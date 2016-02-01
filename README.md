# WebAssembly experiment for musl libc with dynamic linking

A [musl experiment][].

  [musl experiment]: https://github.com/WebAssembly/musl/blob/landing-branch/README.md

The goal of this prototype was to get a WebAssembly libc off the ground. Dynamic
linking came out of it *for free* which is mighty convenient. We should:

1. Focus on the libc aspect.
2. As a secondary goal use dynamic linking to inform WebAssembly's design.

**Note:** This experimental WebAssembly C library with dynamic linking is a
hack. Don't rely on it: it's meant to inform the design of WebAssembly. Things
are changing rapidly, so mixing different parts of the toolchain may break from
time to time, try to keep them all in sync.

In this experiment dynamic linking is entirely done through JavaScript, which is
acting as the dynamic linker / loader. This merely uses the WebAssembly object's
capabilities.

## Quick how-to

Pre-built Linux x86-64 Linux binaries are available on the [waterfall][], so are
`musl.wast`, `musl.wasm`, and `wasm.js`.  The waterfall marks as green the
builds which are known to work properly. Click on a green build to download the
archived binaries. Check out its [last known good revision][].  You can build
everything yourself using the waterfall's [build.py][].

  [waterfall]: https://wasm-stat.us
  [last known good revision]: https://storage.googleapis.com/wasm-llvm/builds/git/lkgr
  [build.py]: https://github.com/WebAssembly/waterfall/tree/master/src/build.py

Compile your program using LLVM:

```
  clang -S -O2 --target=wasm32-unknown-unknown foo.c
```

Creates a `.s` assembly file. Link it:

```
  s2wasm foo.s -o foo.wast
```

Creates a `.wast` WebAssembly s-expression. Assemble it:

```
  sexpr-wasm foo.wast -o foo.wasm
```

You now have a WebAssembly binary file.

Run `.wasm` files which import libc functions:

```
  d8 --expose-wasm musl/arch/wasm32/wasm.js -- foo.wasm musl-out/musl.wasm
```

Or run it without musl, using only `wasm.js` to emulate libc:

```
  d8 --expose-wasm musl/arch/wasm32/wasm.js -- foo.wasm
```

This may work... or not. [File bugs][] on what's broken, or send patches!

  [File bugs]: https://github.com/WebAssembly/musl/issues

## libc + dynamic linking: how does it work?

In the current V8 implementation of WebAssembly binaries, each `.wasm` module:

* Declares it imports and its exports.
* Takes in a dictionary mapping Foreign Function Interface (FFI) names to
  corresponding functions.
* Takes in its heap, an `ArrayBuffer`.

The [wasm.js][] file:

  [wasm.js]: https://github.com/WebAssembly/musl/blob/wasm-prototype-1/arch/wasm32/wasm.js

* Initializes the heap.
* Implements a rudimentary C library in JavaScript, and adds these functions to
  the FFI object.
* Loads `.wasm` files provided on the command-line, from last to first.
* Adds each exported function to the FFI object, sometimes shadowing the
  JavaScript fallback.
* Loads the first `.wasm` file provided and calls its `main` function.

Each loaded `.wasm` file is initialized with the same heap. They all share the
same address space.

Calls from one WebAssembly module to another trampoline through JavaScript, but
they should optimize well. We should figure out what we suggest developers use,
so that the default pattern doesn't require gymnastics on the compiler's part.

A WebAssembly module with un-met imports will throw. This can be handled, add
the missing function as a stub to FFI, and then load again (loop until success)
but it's silly. If WebAssembly modules were loadable, imports inspectable, and
FFI object provided later then we'd be better off. We could implement very fancy
lazy-loading, where the developer can handle load failures. We can easily
implement `dlopen` / `dlsym` / `dlclose` as demonstrated by the `<dlfcn.h>`
example below.

It would also be good to be able to specify compilation / execution separately.

## libc implementation details

The current libc implementation builds a subset of musl using the hacked-up
`libc.py` script. It excludes files which triggered bugs throughout the
toolchain, not that the files being built are bug free either.

The implementation is based on Emscripten's musl port, but is based on a much
more recent musl and has no modifications to musl's code: all changes are in the
`arch/wasm32` directory. It aims to only communicate to the embedder using a
syscall API, modeled after Linux' own syscall API. This may have shortcomings,
but it's a good thing to try out since we can revisit later. Note the
`musl_hack` functions in `wasm.js`: they fill in for functionality that's
currently been hacked out and which musl expects to import. It should be
exporting these instead of importing them. Maybe more functionality should be
implemented in JavaScript, but experience with NaCl and Emscripten leads us to
believe the syscall API is a good boundary.

The eventual goal is for the WebAssembly libc to be upstreamed to musl, and
that'll require *doing it right* according to the musl community. We also want
Emscripten to be able to use the same libc implementation. The approach in this
repository may not be the right one.

## Miscellaneous

Dynamic linking isn't in WebAssembly's current MVP because we thought it would
be hard. This repository shows that it's *possible*, we therefore may as well
design it right from the start, or make it entirely impossible for the MVP.

That'll including figuring out calling convention and ABI. Exports currently
don't declare their signature in a WebAssembly module, even though they are in
the binary format, and don't cause any failure when the APIs don't match. That
should be fixed.

We'll also need to figure out how to make memory segments relocatable, and the
AST references to the segments position independent. Do we even want to allow
non-relocatable segments? The current implementation overwrites previous
segments if they specify the same memory location.

It seems like user code should be managing all of the heap, the first module
that's loaded (even before libc) could therefore be a basic memory manager. The
dynamic loading mechanism (implemented in JavaScript) would then query this heap
manager to figure out where to locate segments, as well as to position user
stacks. libc's `malloc` would then use this basic memory manager to implement
runtime memory management, the same would be true for stack positioning, thread
stacks, and thread-local storage allocation.

Interesting applications can be built when modules *don't* share the same
heap. They need to communicate through copy-in / copy-out functionality (such as
Linux' `copy_from_user` / `copy_to_user` functions), and are then entirely
isolated from each other except for their API boundary. This allows applications
to instantiate their heap in a private closure and only expose APIs, providing
good isolation properties and preventing user code from overflow and other
security issues.

## Why do dynamic linking now?

These basic experiments are finding bugs in the toolchain, if anything they're
useful in making it more robust. It's also an unexpected usage of the APIs! It's
better that we find it now and figure out what it means.

Having a standalone `musl.wasm` is much simpler for code deployment and allows
caching.

Developers are in control: they can do the equivalent of `-ffunction-sections`
and `-fdata-sections` but emit one `.wasm` file per section. This allows them to
lazy-load and lazy-compile each function as needed, and even unload them when
the program doesn't need them anymore.


## `<dlfcn.h>` example

This example doesn't use `musl.wasm`, it currently only uses `wasm.js`. musl
could be used for this, it would be much cleaner (e.g. `dlerror` could work and
return `const char *` as it should), but it requires hooking up syscalls
properly.

Create `dlhello.c`:

```
  #include <dlfcn.h>
  #include <stdio.h>
  #include <stdlib.h>

  int main() {
    typedef void (*world_type)();

    void *handle = dlopen("dlworld.wasm", RTLD_NOW);
    if (!handle) {
      puts("dlopen failed:");
      puts(dlerror());
      abort();
    }

    dlerror();
    world_type world = (world_type)dlsym(handle, "world");
    const char *err = dlerror();
    if (err) {
      puts("dlsym failed:");
      puts(err);
      abort();
    }

    world();

    dlclose(handle);
    return 0;
  }
```

And `dlworld.c`:

```
  #include <stdio.h>
  void world() { puts("World!"); }
```

Compile the programs:

```
  clang -S -O2 --target=wasm32-unknown-unknown ./dlhello.c
  clang -S -O2 --target=wasm32-unknown-unknown ./dlworld.c
  s2wasm dlhello.s -o dlhello.wast
  s2wasm dlworld.s -o dlworld.wast
  sexpr-wasm dlhello.wast -o dlhello.wasm
  sexpr-wasm dlworld.wast -o dlworld.wasm
```

Execute it:

```
  d8 --expose-wasm musl/arch/wasm32/wasm.js -- dlhello.wasm
```

Note that this currently doesn't work because the `dlsym` implementation returns
the function from another module, and the implementation puts the functions in
different tables. `call_indirect` can only call functions from the same module,
whereas `call_import` can call functions from another module by trampolining
through JavaScript. We could fix this by:

* Forcing developers to use a function such as `dlcall` and provide handles for
  the module and symbol. `dlcall` would trampoline through JavaScript. This
  requires that developers modify their code: C currently allows them to call
  the `dlsym` result directly.
* Map functions from all module into the same table.
* Map functions from other modules into the current one when `dlsym` is invoked,
  e.g. adding new functions to the `_WASMEXP_` instance. This also requires
  tracking `dlclose` properly.
