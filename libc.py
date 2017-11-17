#! /usr/bin/env python

#   Copyright 2016 WebAssembly Community Group participants
#
#   Licensed under the Apache License, Version 2.0 (the "License");
#   you may not use this file except in compliance with the License.
#   You may obtain a copy of the License at
#
#       http://www.apache.org/licenses/LICENSE-2.0
#
#   Unless required by applicable law or agreed to in writing, software
#   distributed under the License is distributed on an "AS IS" BASIS,
#   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#   See the License for the specific language governing permissions and
#   limitations under the License.

import argparse
import glob
import itertools
import multiprocessing
import os
import shutil
import subprocess
import sys
import tempfile


verbose = False

DIR_BLACKLIST = ['misc']
BLACKLIST = [
    'puts.c', # Prefer the JS version for now
    'abort.c', # Perfer the JS version for now
    '_Exit.c', # Perfer the JS version for now
]
# Files that contain weak reference which are not suppoered by s2wasm
WEAK_BLACKLIST = [
    'exit.c',
    '__libc_start_main.c',
]
CFLAGS = ['-std=c99',
          '-D_XOPEN_SOURCE=700',
          '-Werror',
          '-Wno-empty-body',
          '-Wno-incompatible-library-redeclaration',
          '-Wno-shift-op-parentheses',
          '-Wno-tautological-unsigned-zero-compare',
          '-Wno-tautological-constant-out-of-range-compare',
          '-Wno-tautological-unsigned-enum-zero-compare',
          '-Wno-ignored-attributes',
          '-Wno-format',
          '-Wno-bitwise-op-parentheses',
          '-Wno-logical-op-parentheses',
          '-Wno-string-plus-int',
          '-Wno-pointer-sign',
          '-Wno-dangling-else',
          '-Wno-absolute-value',
          '-Wno-unknown-pragmas']


def check_output(cmd, **kwargs):
  cwd = kwargs.get('cwd', os.getcwd())
  if verbose:
    c = ' '.join('"' + c + '"' if ' ' in c else c for c in cmd)
    print '  `%s`, cwd=`%s`' % (c, cwd)
  return subprocess.check_output(cmd, cwd=cwd)


def change_extension(path, new_extension):
  return path[:path.rfind('.')] + new_extension


def create_version(musl):
  """musl's Makefile creates version.h"""
  script = os.path.join(musl, 'tools', 'version.sh')
  version = check_output(['sh', script], cwd=musl).strip()
  with open(os.path.join(musl, 'src', 'internal', 'version.h'), 'w') as v:
    v.write('#define VERSION "%s"\n' % version)


def build_alltypes(musl, arch):
  """Emulate musl's Makefile build of alltypes.h."""
  mkalltypes = os.path.join(musl, 'tools', 'mkalltypes.sed')
  inbits = os.path.join(musl, 'arch', arch, 'bits', 'alltypes.h.in')
  intypes = os.path.join(musl, 'include', 'alltypes.h.in')
  out = check_output(['sed', '-f', mkalltypes, inbits, intypes])
  with open(os.path.join(musl, 'arch', arch, 'bits', 'alltypes.h'), 'w') as o:
    o.write(out)


def musl_sources(musl_root, include_weak):
  """musl sources to be built."""
  sources = []
  for d in os.listdir(os.path.join(musl_root, 'src')):
    if d in DIR_BLACKLIST:
      continue
    base = os.path.join(musl_root, 'src', d)
    pattern = os.path.join(base, '*.c')
    for f in glob.glob(pattern):
      if os.path.basename(f) in BLACKLIST:
        continue
      if not include_weak and os.path.basename(f) in WEAK_BLACKLIST:
        continue
      sources.append(f)
  return sorted(sources)


def includes(musl, arch):
  """Include path."""
  includes = [
              os.path.join(musl, 'arch', arch),
              os.path.join(musl, 'src', 'internal'),
              os.path.join(musl, 'include')]
  return list(itertools.chain(*zip(['-I'] * len(includes), includes)))


class Compiler(object):
  """Compile source files."""
  def __init__(self, out, clang_dir, musl, arch, tmpdir):
    self.out = out
    self.outbase = os.path.basename(self.out)
    self.clang_dir = clang_dir
    self.musl = musl
    self.arch = arch
    self.tmpdir = tmpdir
    self.compiled = []

  def compile(self, sources):
    if verbose:
      self.compiled = sorted([self(source) for source in sources])
    else:
      pool = multiprocessing.Pool()
      self.compiled = sorted(pool.map(self, sources))
      pool.close()
      pool.join()


class ObjCompiler(Compiler):
  def __init__(self, out, clang_dir, musl, arch, tmpdir):
    super(ObjCompiler, self).__init__(out, clang_dir, musl, arch, tmpdir)

  def __call__(self, src):
    target = 'wasm32-unknown-unknown-wasm'
    compile_cmd = [os.path.join(self.clang_dir, 'clang'), '-target', target,
                   '-Os', '-c', '-nostdinc']
    compile_cmd += includes(self.musl, self.arch)
    compile_cmd += CFLAGS
    check_output(compile_cmd + [src], cwd=self.tmpdir)
    return os.path.basename(src)[:-1] + 'o'  # .c -> .o

  def binary(self):
    if os.path.exists(self.out):
      os.remove(self.out)
    check_output([os.path.join(self.clang_dir, 'llvm-ar'), 'rcs', self.out] + self.compiled,
                  cwd=self.tmpdir)


class AsmCompiler(Compiler):
  def __init__(self, out, clang_dir, musl, arch, tmpdir, binaryen_dir,
      sexpr_wasm):
    super(AsmCompiler, self).__init__(out, clang_dir, musl, arch, tmpdir)
    self.binaryen_dir = binaryen_dir
    self.sexpr_wasm = sexpr_wasm

  def __call__(self, src):
    target = 'wasm32-unknown-unknown'
    compile_cmd = [os.path.join(self.clang_dir, 'clang'), '-target', target,
                   '-Os', '-emit-llvm', '-S', '-nostdinc']
    compile_cmd += includes(self.musl, self.arch)
    compile_cmd += CFLAGS
    check_output(compile_cmd + [src], cwd=self.tmpdir)
    return os.path.basename(src)[:-1] + 'll'  # .c -> .ll

  def binary(self):
    max_memory = str(16 * 1024 * 1024)
    bytecode = change_extension(self.out, '.bc')
    assembly = os.path.join(self.tmpdir, self.outbase + '.s')
    check_output([os.path.join(self.clang_dir, 'llvm-link'),
                  '-o', bytecode] + self.compiled,
                 cwd=self.tmpdir)
    check_output([os.path.join(self.clang_dir, 'llc'),
                  bytecode, '-o', assembly],
                 cwd=self.tmpdir)
    check_output([os.path.join(self.binaryen_dir, 's2wasm'),
                  assembly, '--ignore-unknown', '-o', self.out,
                  '--import-memory', '-m', max_memory],
                 cwd=self.tmpdir)

    if self.sexpr_wasm:
      check_output([self.sexpr_wasm,
                    self.out, '-o', change_extension(self.out, '.wasm')],
                   cwd=self.tmpdir)


def run(clang_dir, binaryen_dir, sexpr_wasm, musl, arch, out, save_temps,
    compile_to_wasm):
  if save_temps:
    tmpdir = os.path.join(os.getcwd(), 'libc_build')
    if os.path.isdir(tmpdir):
      shutil.rmtree(tmpdir)
    os.mkdir(tmpdir)
  else:
    tmpdir = tempfile.mkdtemp()

  try:
    create_version(musl)
    build_alltypes(musl, arch)
    sources = musl_sources(musl, include_weak=compile_to_wasm)
    if compile_to_wasm:
      compiler = ObjCompiler(out, clang_dir, musl, arch, tmpdir)
    else:
      compiler = AsmCompiler(out, clang_dir, musl, arch, tmpdir, binaryen_dir,
                             sexpr_wasm)
    compiler.compile(sources)
    compiler.binary()
    if compile_to_wasm:
      compiler.compile([os.path.join(musl, 'crt', 'crt1.c')])
      shutil.copy(os.path.join(tmpdir, compiler.compiled[0]),
                  os.path.dirname(out))
  finally:
    if not save_temps:
      shutil.rmtree(tmpdir)


def getargs():
  parser = argparse.ArgumentParser(description='Build a hacky wasm libc.')
  parser.add_argument('--clang_dir', type=str, required=True,
                      help='Clang binary directory')
  parser.add_argument('--binaryen_dir', type=str, required=True,
                      help='binaryen binary directory')
  parser.add_argument('--sexpr_wasm', type=str, required=False,
                      help='sexpr-wasm binary')
  parser.add_argument('--musl', type=str, required=True,
                      help='musl libc root directory')
  parser.add_argument('--arch', type=str, default='wasm32',
                      help='architecture to target')
  parser.add_argument('--out', '-o', type=str,
                      default=os.path.join(os.getcwd(), 'musl.wast'),
                      help='Output file')
  parser.add_argument('--save-temps', default=False, action='store_true',
                      help='Save temporary files')
  parser.add_argument('--verbose', default=False, action='store_true',
                      help='Verbose')
  parser.add_argument('--compile-to-wasm', default=False, action='store_true',
                      help='Use clang to compile directly to wasm')
  return parser.parse_args()


def main():
  global verbose
  args = getargs()
  if args.verbose:
    verbose = True
  return run(args.clang_dir, args.binaryen_dir, args.sexpr_wasm,
             args.musl, args.arch, args.out, args.save_temps,
             args.compile_to_wasm)


if __name__ == '__main__':
  sys.exit(main())
