/*
 * Copyright 2016 WebAssembly Community Group participants
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/*
 * Support JavaScript code to run WebAssembly in a JavaScript shell.
 *
 * This is a giant hack which stands in for a real libc and runtime. It acts
 * both as a hobbling libc and a linker/loader, including dynamic linking.
 */

var heap_size_bytes = 16 * 1024 * 1024;
var heap_size_pages = heap_size_bytes / (64 * 1024);
var memory = new WebAssembly.Memory({initial: heap_size_pages, maximum: heap_size_pages})
var heap = memory.buffer;
var heap_uint8 = new Uint8Array(heap);

// Heap access helpers.
function charFromHeap(ptr) { return String.fromCharCode(heap_uint8[ptr]); }
function stringFromHeap(ptr) {
  var str = '';
  for (var i = ptr; i < heap_size_bytes && heap_uint8[i] != 0; ++i)
    str += charFromHeap(i);
  return str;
}

// Exceptions.

function TerminateWasmException(value) {
  this.value = value;
  this.message = 'Terminating WebAssembly';
  this.toString = function() { return this.message + ': ' + this.value; };
}

function NotYetImplementedException(what) {
  this.message = 'Not yet implemented';
  this.what = what;
  this.toString = function() { return this.message + ': ' + this.what; };
}

function NYI(what) {
  return function() { throw new NotYetImplementedException(what); };
}

var builtins = (function() {
  return {
    // TODO create a complete list from:
    //      https://gcc.gnu.org/onlinedocs/gcc/C-Extensions.html

    // Constructing function calls.
    __builtin_apply_args: NYI('__builtin_apply_args'),
    __builtin_apply: NYI('__builtin_apply'),
    __builtin_return: NYI('__builtin_return'),
    __builtin_va_arg_pack: NYI('__builtin_va_arg_pack'),
    __builtin_va_arg_pack_len: NYI('__builtin_va_arg_pack_len'),

    // Others.
    __builtin_malloc: function(size) { return stdlib.malloc(size); }
  };
})();

var ctype = (function() {
  function between(c, lower, upper) {
    c &= 0xff;
    return lower.charCodeAt(0) <= c && c <= upper.charCodeAt(0);
  }

  return {
    // Character classification functions.
    isalnum: function(c) { return ctype.isalpha(c) || ctype.isnum(c); },
    isalpha: function(c) { return between(ctype.tolower(c), 'a', 'z'); },
    isblank: function(c) { c &= 0xff; return c == 0x09 || c == 0x20; },
    iscntrl: function(c) { c &= 0xff; return c <= 0x1f || c == 0x7f; },
    isdigit: function(c) { return between(c, '0', '9'); },
    isgraph: function(c) { return ctype.isprint(c) && (c & 0xff) != 0x20; },
    islower: function(c) { return between(c, 'a', 'z'); },
    isprint: function(c) { return !ctype.iscntrl(c); },
    ispunct: function(c) { return ctype.isgraph(c) && !ctype.isalnum(c); },
    isspace: function(c) {
      var spaces = [0x20, 0x09, 0x0a, 0x0b, 0x0c, 0x0d];
      for (var s in spaces)
        if ((c & 0xff) == spaces[s]) return 1;
      return 0;
    },
    isupper: function(c) { return between(c, 'A', 'Z'); },
    isxdigit: function(c) { return ctype.isdigit(c) ||
                                   between(tolower(c), 'a', 'f'); },

    // Character conversion functions.
    tolower: function(c) { return ctype.isupper(c) ? 0xff & c + 0x20 : c; },
    toupper: function(c) { return ctype.islower(c) ? 0xff & c - 0x20 : c; }
  };
})();

var math = (function() {
  return {
    // Constants.
    math_errhandling: 2,  // TODO: use MATH_ERRNO instead?
    INFINITY: Number.POSITIVE_INFINITY,
    NAN: Number.NAN,
    HUGE_VAL: Number.POSITIVE_INFINITY,
    HUGE_VALF: Number.POSITIVE_INFINITY,
    HUGE_VALL: Number.POSITIVE_INFINITY,
    MATH_ERRNO: 1,
    MATH_ERREXCEPT: 2,
    // No defined because we don't guarantee fast FMA.
    // FP_FAST_FMA
    // FP_FAST_FMAF
    // FP_FAST_FMAL
    FP_INFINITE: 1,
    FP_NAN: 0,
    FP_NORMAL: 4,
    FP_SUBNORMAL: 3,
    FP_ZERO: 2,
    FP_ILOGB0: -1 - 0x7fffffff,
    FP_ILOGBNAN: -1 - 0x7fffffff,

    // Trigonometric functions.
    cos: Math.cos,
    sin: Math.sin,
    tan: Math.tan,
    acos: Math.acos,
    asin: Math.asin,
    atan: Math.atan,
    atan2: Math.atan2,

    // Hyperbolic functions.
    cosh: Math.cosh,
    sinh: Math.sinh,
    tanh: Math.tanh,
    acosh: Math.acosh,
    asinh: Math.asinh,
    atanh: Math.atanh,

    // Exponential and logarithmic functions.
    exp: Math.exp,
    frexp: NYI('frexp'),
    ldexp: NYI('ldexp'),
    log: Math.log,
    log10: Math.log10,
    modf: NYI('fmod'),
    exp2: NYI('exp2'),
    expm1: Math.expm1,
    ilogb: NYI('ilogb'),
    log1p: Math.log1p,
    log2: Math.log2,
    logb: Math.logb,
    scalbn: NYI('scalbn'),
    scalbln: NYI('scalbln'),

    // Power functions.
    pow: Math.pow,
    sqrt: Math.sqrt,
    cbrt: Math.cbrt,
    hypot: Math.hypot,

    // Error and gamma functions.
    erf: NYI('erf'),
    erfc: NYI('erfc'),
    tgamma: NYI('tgamma'),
    lgamma: NYI('lgamma'),

    // Rounding and remainder functions.
    ceil: Math.ceil,
    floor: Math.floor,
    fmod: NYI('fmod'),
    trunc: Math.trunc,
    round: Math.round,
    lround: Math.round,
    llround: Math.round,
    rint: NYI('rint'),
    lrint: NYI('lrint'),
    llrint: NYI('llrint'),
    nearbyint: NYI('nearbyint'),
    remainder: NYI('remainder'),
    remquo: NYI('remquo'),

    // Floating-point manipulation functions.
    copysign: NYI('copysign'),
    nan: function() { return Number.NAN; },
    nextafter: NYI('nextafter'),
    nexttoward: NYI('nexttoward'),

    // Minimum, maximum, difference functions.
    fdim: function(x, y) { return x > y ? x - y : 0; },
    fmax: NYI('fmax'),
    fmin: NYI('fmin'),

    // Other functions.
    fabs: Math.abs,
    abs: Math.abs,
    // fma is not provided.

    // Classification.
    fpclassify: function(x) { if (math.isnormal(x)) return math.FP_NORMAL;
                              if (math.isfinite(x)) return math.FP_INFINITE;
                              if (math.isnan(x)) return math.FP_NAN;
                              if (x == 0.0 || x == -0.0) return math.FP_ZERO;
                              else return math.FP_SUBNORMAL; },
    isfinite: Number.isFinite,
    isfinitef: Number.isFinite,
    isfinitel: Number.isFinite,
    isinf: function(x) { return Number.POSITIVE_INFINITY == x ? 1 :
                                Number.NEGATIVE_INFINITY ? -1 : 0; },
    isinff: function(x) { return math.isinf(x); },
    isinfl: function(x) { return math.isinf(x); },
    isnan: Number.isNaN,
    isnanf: Number.isNaN,
    isnanl: Number.isNaN,
    isnormal: NYI('isnormal'),
    signbit: NYI('signbit'),

    // Comparison.
    isgreater: function(x, y) { return x > y; },
    isgreaterequal: function(x, y) { return x >= y; },
    isless: function(x, y) { return x < y; },
    islessequal: function(x, y) { return x <= y; },
    islessgreater: function(x, y) { return x < y || x > y; },
    isunordered: Number.isNaN,

    // Non-standard.
    finite: Number.isFinite,
    finitef: Number.isFinite,
    finitel: Number.isFinite,
    __builtin_finite: Number.isFinite,
    __builtin_finitef: Number.isFinite,
    __builtin_finitel: Number.isFinite,
    __builtin_isinf: function(x) { return math.isinf(x); },
    __builtin_isinff: function(x) { return math.isinf(x); },
    __builtin_isinfl: function(x) { return math.isinf(x); },
    __builtin_isnan: Number.isNaN,
    __builtin_isnanf: Number.isNaN,
    __builtin_isnanl: Number.isNaN,
    __builtin_clrsb: NYI('__builtin_clrsb'),
    __builtin_clrsbl: NYI('__builtin_clrsbl'),
    __builtin_clrsbll: NYI('__builtin_clrsbll')
  };
})();

var runtime = (function() {
  return {
    // TODO create a complete list from:
    //      https://gcc.gnu.org/onlinedocs/gccint/Libgcc.html
    __addtf3: NYI('__addtf3'),
    __divtf3: NYI('__divtf3'),
    __eqtf2: NYI('__eqtf2'),
    __fixsfti: NYI('__fixsfti'),
    __fixtfdi: NYI('__fixtfdi'),
    __fixtfsi: NYI('__fixtfsi'),
    __fixunstfdi: NYI('__fixunstfdi'),
    __fixunstfsi: NYI('__fixunstfsi'),
    __floatditf: NYI('__floatditf'),
    __floatsitf: NYI('__floatsitf'),
    __floatunditf: NYI('__floatunditf'),
    __floatunsitf: NYI('__floatunsitf'),
    __getf2: NYI('__getf2'),
    __gttf2: NYI('__gttf2'),
    __letf2: NYI('__letf2'),
    __lttf2: NYI('__lttf2'),
    __multf3: NYI('__multf3'),
    __multi3: NYI('__multi3'),
    __muldc3: NYI('__muldc3'),
    __mulsc3: NYI('__mulsc3'),
    __multc3: NYI('__multc3'),
    __netf2: NYI('__netf2'),
    __subtf3: NYI('__subtf3'),
    __divsc3: NYI('__divsc3'),
    __unordtf2: NYI('__unordtf2')
  };
})();

var stdio = (function() {
  var stdout_buf = '';

  return {
    // Internal.
    __flush_stdout: function() { print(stdout_buf); stdout_buf = ''; },

    // Constants.
    BUFSIZ: 0xffffffff,  // TODO
    EOF: 0xffffffff,
    FILENAME_MAX: 4096,
    FOPEN_MAX: 1000,
    L_tmpnam: 20,
    NULL: 0,
    TMP_MAX: 10000,

    // Operations on files.
    remove: NYI('remove'),
    rename: NYI('rename'),
    tmpfile: NYI('tmpfile'),
    tmpnam: NYI('tmpnam'),

    // File access.
    fclose: NYI('fclose'),
    fflush: NYI('fflush'),
    fopen: NYI('fopen'),
    freopen: NYI('freopen'),
    setbuf: NYI('setbuf'),
    setvbuf: NYI('setvbuf'),

    // Formatted input/output.
    fprintf: NYI('fprintf'),
    fscanf: NYI('fscanf'),
    printf: NYI('printf'),
    scanf: NYI('scanf'),
    snprintf: NYI('snprintf'),
    sprintf: NYI('sprintf'),
    sscanf: NYI('sscanf'),
    vfprintf: NYI('vfprintf'),
    vfscanf: NYI('vfscanf'),
    vprintf: NYI('vprintf'),
    vscanf: NYI('vscanf'),
    vsnprintf: NYI('vsnprintf'),
    vsprintf: NYI('vsprintf'),
    vsscanf: NYI('vsscanf'),

    // Character input/output.
    fgetc: NYI('fgetc'),
    fgets: NYI('fgets'),
    fputc: NYI('fputc'),
    fputs: NYI('fputs'),
    getc: NYI('getc'),
    getchar: NYI('getchar'),
    gets: NYI('gets'),
    putc: NYI('putc'),
    putchar: function(character) {
      character &= 0xff;
      stdout_buf += String.fromCharCode(character);
      return character;
    },
    puts: function(str) { stdout_buf += stringFromHeap(str) + '\n'; },
    ungetc: NYI('ungetc'),

    // Direct input/output.
    fread: NYI('fread'),
    fwrite: NYI('fwrite'),

    // File positioning.
    fgetpos: NYI('fgetpos'),
    fseek: NYI('fseek'),
    fsetpos: NYI('fsetpos'),
    ftell: NYI('ftell'),
    rewind: NYI('rewind'),

    // Error-handling.
    clearerr: NYI('clearerr'),
    feof: NYI('feof'),
    ferror: NYI('ferror'),
    perror: NYI('perror')
  };
})();

var stdlib = (function() {
  var exit_code = 0;
  var allocated_bytes = 1 << 14;  // Leave the heap bottom free.

  return {
    // Internals.
    __get_exit_code: function() { return exit_code; },

    // Constants.
    EXIT_SUCCESS: 0,
    EXIT_FAILURE: 1,
    NULL: 0,
    MB_CUR_MAX: 1,
    RAND_MAX: 0xffffffff,

    // String conversion.
    atof: NYI('atof'),
    atoi: NYI('atoi'),
    atol: NYI('atol'),
    atoll: NYI('atoll'),
    strtod: NYI('strtod'),
    strtof: NYI('strtof'),
    strtol: NYI('strtol'),
    strtold: NYI('strtold'),
    strtoll: NYI('strtoll'),
    strtoul: NYI('strtoul'),
    strtoull: NYI('strtoull'),

    // Pseudo-random sequence generation.
    rand: NYI('rand'),
    srand: NYI('srand'),

    // Dynamic memory management.
    calloc: function(nmemb, size) {
      var bytes = nmemb * size;
      if (bytes == 0) return 0;
      var ptr = stdlib.malloc(bytes);
      return ptr ? string.memset(ptr, 0, bytes) : 0;
    },
    free: NYI('free'),
    malloc: function(size) {
      if (size == 0) return 0;
      if (allocated_bytes > heap_size_bytes) return 0;
      allocated_bytes += size;
      return allocated_bytes - size;
    },
    realloc: function(ptr, size) {
      if (ptr == 0) return stdlib.malloc(size);
      if (size == 0) stdlib.free(ptr);
      throw new NotYetImplementedException('realloc');
    },

    // Environment.
    abort: function() {
      exit_code = stdlib.EXIT_FAILURE;
      throw new TerminateWasmException('abort()'); },
    atexit: NYI('atexit'),
    at_quick_exit: NYI('at_quick_exit'),
    exit: function(code) {
      // TODO invoke atexit functions.
      exit_code = code;
      throw new TerminateWasmException('exit(' + code + ')'); },
    getenv: NYI('getenv'),
    quick_exit: function(code) {
      // TODO invoke at_quick_exit functions.
      _Exit(code); },
    system: NYI('system'),
    _Exit: function(code) {
      exit_code = code;
      throw new TerminateWasmException('_Exit(' + code + ')'); },

    // Searching and sorting.
    bsearch: NYI('bsearch'),
    qsort: NYI('qsort'),

    // Integer arithmetics.
    abs: NYI('abs'),
    div: NYI('div'),
    labs: NYI('labs'),
    ldiv: NYI('ldiv'),
    llabs: NYI('llabs'),
    lldiv: NYI('lldiv'),

    // Multibyte characters.
    mblen: NYI('mblen'),
    mbtowc: NYI('mbtowc'),
    wctomb: NYI('wctomb'),

    // Multibyte strings.
    mbstowcs: NYI('mbstowcs'),
    wcstombs: NYI('wcstombs')
  };
})();

var string = (function() {
  return {
    // Constants.
    NULL: 0,

    // Functions.
    memcpy: function(destination, source, num) {
      for (var i = 0; i != num; ++i)
        heap_uint8[destination + i] = heap_uint8[source + i];
      return destination;
    },
    mempcpy: function(destination, source, num) {  // Non-standard.
      return num + string.memcpy(destination, source, num);
    },
    memmove: NYI('memmove'),
    strcpy: function(destination, source) {
      var i = 0;
      for (; heap_uint8[source + i] != 0; ++i)
        heap_uint8[destination + i] = heap_uint8[source + i];
      heap_uint8[destination + i] = 0;
      return destination;
    },
    strncpy: function(destination, source, num) {
      var i = 0;
      for (; i != num && heap_uint8[source + i] != 0; ++i)
        heap_uint8[destination + i] = heap_uint8[source + i];
      for (; i != num; ++i) heap_uint8[destination + i] = 0;
      return destination;
    },

    // Concatenation.
    strcat: NYI('strcat'),
    strncat: NYI('strncat'),

    // Comparison.
    memcmp: function(ptr1, ptr2, num) {
      for (var i = 0; i != num; ++i)
        if (heap_uint8[ptr1 + i] != heap_uint8[ptr2 + i])
          return heap_uint8[ptr1 + i] < heap_uint8[ptr2 + i];
      return 0;
    },
    strcmp: function(str1, str2) {
      for (var i1 = 0, i2 = 0; heap_uint8[str1 + i1] == heap_uint8[str2 + i2];
           ++i1, ++i2) {
        if (heap_uint8[str1 + i1] == 0)
          return 0;
      }
      return heap_uint8[str1 + i1] < heap_uint8[str2 + i2] ? -1 : 1;
    },
    strcoll: NYI('strcoll'),
    strncmp: function(str1, str2, num) {
      for (var i1 = 0, i2 = 0; num > 0; ++i1, ++i2, --num) {
        var s1 = heap_uint8[str1 + i1], s2 = heap_uint8[str2 + i2];
        if (s1 != s2)
          return s1 < s2 ? -1 : 1;
        else if (s1 == 0)
          return 0;
      }
      return 0;
    },
    strxfrm: NYI('strxfrm'),

    // Searching.
    memchr: NYI('memchr'),
    strchr: function(str, character) {
      character &= 0xff;
      var i = 0;
      for (; heap_uint8[str + i] != 0; ++i) {
        if (str + i >= heap_size_bytes)
          return 0;
        if (heap_uint8[str + i] == character)
          return str + i;
      }
      return character == 0 ? str + i : 0;
    },
    strcspn: NYI('strcspn'),
    strpbrk: NYI('strpbrk'),
    strrchr: function(str, character) {
      character &= 0xff;
      if (character == 0) return str + string.strlen(str);
      var found = str;
      for (var i = 0; heap_uint8[str + i] != 0; ++i)
        if (heap_uint8[str + i] == character) found = str + i;
      return heap_uint8[found] == character ? found : 0;
    },
    strspn: NYI('strspn'),
    strstr: NYI('strstr'),
    strtok: NYI('strtok'),

    // Other.
    memset: function(ptr, value, num) {
      for (var i = 0; i != num; ++i) heap_uint8[ptr + i] = value;
      return ptr;
    },
    strerror: NYI('strerror'),
    strlen: function(str) {
      for (var i = 0;; ++i) if (heap_uint8[str + i] == 0) return i;
    }
  };
})();

var unix = (function() {
  var OPEN_MAX = 256;
  var open_files = new Uint8Array(OPEN_MAX);

  var dlfcn = {};
  var dlfcn_handle_to_filename = {};
  var dlfcn_max_handle = 0;

  return {
    // <dlfcn.h> constants.
    RTLD_LAZY: 1,
    RTLD_NOW: 2,
    RTLD_NOLOAD: 4,
    RTLD_NODELETE: 4096,
    RTLD_GLOBAL: 256,
    RTLD_LOCAL: 0,
    RTLD_NEXT: 0xffffffff,
    RTLD_DEFAULT: 0,
    RTLD_DI_LINKMAP: 2,

    // <dlfcn.h>
    dlclose: function(handle) {
      var filename = dlfcn_handle_to_filename[handle];
      if (!filename) NYI('dlclose of invalid handle')();
      dlfcn[filename].refcount -= 1;
      if (dlfcn[filename].refcount == 0)
        dlfcn[filename] = undefined;
      return 0; },
    dlerror: function() {
      // TODO: implement error handling.
      return 0; },
    dlopen: function(filename, flags) {
      if (!filename) NYI('dlopen(NULL, ...);')();
      var fs = stringFromHeap(filename);
      if (dlfcn[fs]) {
        dlfcn[fs].refcount += 1;
        return dlfcn[fs].handle;
      }
      if (flags & unix.RTLD_LAZY) NYI('dlopen with flag RTLD_LAZY')();
      if (~flags & unix.RTLD_NOW) NYI('dlopen without flag RTDL_NOW')();
      if (flags & unix.RTLD_NOLOAD) NYI('dlopen with flag RTLD_NOLOAD')();
      if (flags & unix.RTLD_NODELETE) NYI('dlopen with flag RTLD_NODELETE')();
      if (flags & unix.RTLD_GLOBAL) NYI('dlopen with flag RTLD_GLOBAL')();
      // TODO: other flags.
      var handle = ++dlfcn_max_handle;
      dlfcn[fs] = {
        refcount: 0,
        module: load_wasm(fs),
        handle: handle
      };
      dlfcn_handle_to_filename[handle] = fs;
      return handle; },
    dlsym: function(handle, symbol) {
      var filename = dlfcn_handle_to_filename[handle];
      if (!filename) NYI('dlsym of invalid handle')();
      if (!symbol) NYI('dlsym of NULL symbol')();
      var ss = stringFromHeap(symbol);
      // TODO: error handling when module doesn't contain symbol.
      for (var m in dlfcn[filename].module)
        if (m == ss)
          return dlfcn[filename].module[m];
      NYI('dlsym with symbol not found in handle')(); },
    dladdr: NYI('dladdr'),
    dlinfo: NYI('dlinfo'),

    // <fcntl.h> constants.
    F_DUPFD: 0,
    F_GETFD: 1,
    F_SETFD: 2,
    F_GETFL: 3,
    F_SETFL: 4,
    F_GETLK: 5,
    F_SETLK: 6,
    F_SETLKW: 7,
    F_GETOWN: 9,
    F_SETOWN: 8,
    FD_CLOEXEC: 1,
    F_RDLCK: 0,
    F_UNLCK: 2,
    F_WRLCK: 1,
    SEEK_SET: 0,
    SEEK_CUR: 1,
    SEEK_END: 2,
    O_CREAT: 0100,
    O_EXCL: 0200,
    O_NOCTTY: 0400,
    O_TRUNC: 01000,
    O_APPEND: 02000,
    O_DSYNC: 010000,
    O_NONBLOCK: 04000,
    O_RSYNC: 04010000,
    O_SYNC: 04010000,
    O_ACCMODE: 010000030,
    O_RDONLY: 00,
    O_RDWR: 02,
    O_WRONLY: 01,

    // <fcntl.h>
    creat: function(pathname, mode) {
      var flags = unix.O_CREAT | unix.O_WRONLY | unix.O_TRUNC;
      return unix.open(pathname, flags, mode); },
    fcntl: NYI('fcntl'),
    open: function(pathname, flags, mode) {
      for (var i = 0; i != OPEN_MAX; ++i)
        if (!open_files[i]) {
          open_files[i] = true;
            return i;
        }
      return -1; },
    posix_fadvise: NYI('posix_fadvise'),
    posix_fallocate: NYI('posix_fallocate'),

    // <setjmp.h>
    longjmp: NYI('longjmp'),
    siglongjmp: NYI('siglongjmp'),
    _longjmp: NYI('_longjmp'),
    setjmp: NYI('setjmp'),
    sigsetjmp: NYI('sigsetjmp'),
    _setjmp: NYI('_setjmp'),

    // <signal.h> constants.
    // TODO other <signal.h> constants.
    SIG_ERR: 0xffffffff,

    // <signal.h>
    // TODO other <signal.h> functions.
    signal: function signal(signum, handler) { return unix.SIG_ERR; },

    // <sys.mman.h> constants.
    PROT_READ: 1,
    PROT_WRITE: 2,
    PROT_EXEC: 4,
    PROT_NONE: 0,
    MAP_SHARED: 0x01,
    MAP_PRIVATE: 0x02,
    MAP_FIXED: 0x10,
    MS_ASYNC: 1,
    MS_SYNC: 4,
    MS_INVALIDATE: 2,
    MCL_CURRENT: 1,
    MCL_FUTURE: 2,
    MAP_FAILED: 0xffffffff,

    // <sys/mman.h>
    mlock: NYI('mlock'),
    mlockall: NYI('mlockall'),
    mmap: function(addr, length, prot, flags, fd, offset) {
      if (addr != 0) NYI('mmap addr ' + addr)();
      if (prot != PROT_READ | PROT_WRITE) NYI('mmap prot ' + prot)();
      if (fd != -1) NYI('mmap fd ' + fd)();
      return stdlib.malloc(length); },
    mprotect: NYI('mprotect'),
    msync: NYI('msync'),
    munlock: NYI('munlock'),
    munlockall: NYI('munlockall'),
    munmap: NYI('munmap'),
    shm_open: NYI('shm_open'),
    shm_unlink: NYI('shm_unlink'),

    // <unistd.h> constants.
    NULL: 0,
    F_OK: 0,
    R_OK: 4,
    W_OK: 2,
    X_OK: 1,
    F_LOCK: 1,
    F_TEST: 3,
    F_TLOCK: 2,
    F_ULOCK: 0,
    STDIN_FILENO: 0,
    STDOUT_FILENO: 1,
    STDERR_FILENO: 2,

    // <unistd.h>
    access: NYI('access'),
    alarm: NYI('alarm'),
    brk: NYI('brk'),
    chdir: NYI('chdir'),
    chroot: NYI('chroot'),
    chown: NYI('chown'),
    close: function(fd) {
      if (fd > OPEN_MAX || !open_files[fd]) return -1;
        open_files[fd] = false; },
    confstr: NYI('confstr'),
    crypt: NYI('crypt'),
    ctermid: NYI('ctermid'),
    cuserid: NYI('cuserid'),
    dup: NYI('dup'),
    dup2: NYI('dup2'),
    encrypt: NYI('encrypt'),
    execl: NYI('execl'),
    execle: NYI('execle'),
    execlp: NYI('execlp'),
    execv: NYI('execv'),
    execve: NYI('execve'),
    execvp: NYI('execvp'),
    exit: stdlib.exit,
    fchown: NYI('fchown'),
    fchdir: NYI('fchdir'),
    fdatasync: NYI('fdatasync'),
    fork: NYI('fork'),
    fpathconf: NYI('fpathconf'),
    fsync: NYI('fsync'),
    ftruncate: NYI('ftruncate'),
    getcwd: NYI('getcwd'),
    getdtablesize: NYI('getdtablesize'),
    getegid: function() { return 0; },
    geteuid: function() { return 0; },
    getgid: function() { return 0; },
    getgroups: NYI('getgroups'),
    gethostid: function() { return 0; },
    getlogin: NYI('getlogin'),
    getlogin_r: NYI('getlogin_r'),
    getopt: NYI('getopt'),
    getpagesize: NYI('getpagesize'),
    getpass: NYI('getpass'),
    getpgid: function(pid) { return 0; },
    getpgrp: function() { return 0; },
    getpid: function() { return 0; },
    getppid: function() { return 0; },
    getsid: function(pid) { return 0; },
    getuid: function() { return 0; },
    getwd: function() { return 0; },
    isatty: function(fd) { return 0; },
    lchown: NYI('lchown'),
    link: NYI('link'),
    lockf: NYI('lockf'),
    lseek: NYI('lseek'),
    nice: NYI('nice'),
    pathconf: NYI('pathconf'),
    pause: NYI('pause'),
    pipe: NYI('pipe'),
    pread: NYI('pread'),
    pthread_atfork: NYI('pthread_atfork'),
    void: NYI('    void'),
    pwrite: NYI('pwrite'),
    read: NYI('read'),
    readlink: NYI('readlink'),
    rmdir: NYI('rmdir'),
    sbrk: NYI('sbrk'),
    setgid: NYI('setgid'),
    setpgid: NYI('setpgid'),
    setpgrp: NYI('setpgrp'),
    setregid: NYI('setregid'),
    setreuid: NYI('setreuid'),
    setsid: NYI('setsid'),
    setuid: NYI('setuid'),
    sleep: NYI('sleep'),
    swab: NYI('swab'),
    symlink: NYI('symlink'),
    sync: NYI('sync'),
    sysconf: NYI('sysconf'),
    tcgetpgrp: NYI('tcgetpgrp'),
    tcsetpgrp: NYI('tcsetpgrp'),
    truncate: NYI('truncate'),
    ttyname: NYI('ttyname'),
    ttyname_r: NYI('ttyname_r'),
    ualarm: NYI('ualarm'),
    unlink: NYI('unlink'),
    usleep: NYI('usleep'),
    vfork: NYI('vfork'),
    write: NYI('write')
  };
})();

// Temporary workarounds for functions my hacky musl build thinks are imports.
// Generated with:
// grep "(import " musl.wast | cut -d'$' -f2 | cut -d' ' -f1 | grep -v __syscall | sort | sed "s/\(.*\)/\1: NYI('\1'),/g"
var musl_hack = (function() {
  return {
    abort: NYI('abort'),
    __addtf3: NYI('__addtf3'),
    __clone: NYI('__clone'),
    __divtf3: NYI('__divtf3'),
    __eqtf2: NYI('__eqtf2'),
    exit: NYI('exit'),
    _Exit: NYI('_Exit'),
    __extenddftf2: NYI('__extenddftf2'),
    __extendsftf2: NYI('__extendsftf2'),
    __fixtfdi: NYI('__fixtfdi'),
    __fixtfsi: NYI('__fixtfsi'),
    __fixunstfsi: NYI('__fixunstfsi'),
    __floatsitf: NYI('__floatsitf'),
    __floatunsitf: NYI('__floatunsitf'),
    __getf2: NYI('__getf2'),
    getrlimit: NYI('getrlimit'),
    __gttf2: NYI('__gttf2'),
    ioctl: NYI('ioctl'),
    __letf2: NYI('__letf2'),
    __lock: NYI('__lock'),
    longjmp: NYI('longjmp'),
    __lttf2: NYI('__lttf2'),
    __muldc3: NYI('__muldc3'),
    __mulsc3: NYI('__mulsc3'),
    __multc3: NYI('__multc3'),
    __multf3: NYI('__multf3'),
    __netf2: NYI('__netf2'),
    nftw: NYI('nftw'),
    pthread_attr_init: NYI('pthread_attr_init'),
    pthread_attr_setdetachstate: NYI('pthread_attr_setdetachstate'),
    pthread_attr_setguardsize: NYI('pthread_attr_setguardsize'),
    pthread_attr_setstacksize: NYI('pthread_attr_setstacksize'),
    pthread_barrier_destroy: NYI('pthread_barrier_destroy'),
    pthread_barrier_init: NYI('pthread_barrier_init'),
    pthread_barrier_wait: NYI('pthread_barrier_wait'),
    pthread_cancel: NYI('pthread_cancel'),
    _pthread_cleanup_pop: NYI('_pthread_cleanup_pop'),
    _pthread_cleanup_push: NYI('_pthread_cleanup_push'),
    pthread_cond_init: NYI('pthread_cond_init'),
    pthread_cond_wait: NYI('pthread_cond_wait'),
    pthread_create: NYI('pthread_create'),
    pthread_mutex_init: NYI('pthread_mutex_init'),
    pthread_mutex_lock: NYI('pthread_mutex_lock'),
    pthread_mutex_unlock: NYI('pthread_mutex_unlock'),
    pthread_once: NYI('pthread_once'),
    pthread_rwlock_rdlock: NYI('pthread_rwlock_rdlock'),
    pthread_rwlock_unlock: NYI('pthread_rwlock_unlock'),
    pthread_rwlock_wrlock: NYI('pthread_rwlock_wrlock'),
    pthread_setcancelstate: NYI('pthread_setcancelstate'),
    pthread_sigmask: NYI('pthread_sigmask'),
    pthread_testcancel: NYI('pthread_testcancel'),
    sem_init: NYI('sem_init'),
    sem_post: NYI('sem_post'),
    sem_wait: NYI('sem_wait'),
    setjmp: NYI('setjmp'),
    setrlimit: NYI('setrlimit'),
    __set_thread_area: NYI('__set_thread_area'),
    __subtf3: NYI('__subtf3'),
    __synccall: NYI('__synccall'),
    __timedwait_cp: NYI('__timedwait_cp'),
    __trunctfdf2: NYI('__trunctfdf2'),
    __trunctfsf2: NYI('__trunctfsf2'),
    uname: NYI('uname'),
    __unlock: NYI('__unlock'),
    __unordtf2: NYI('__unordtf2'),
    __wait: NYI('__wait'),
};
})();

syscall_names = {
  // Generted using the following command:
  // grep "^#define SYS_" arch/wasm32/bits/syscall.h | awk '{print $3 ": \"" $2 // "\'," }'
  0: "SYS_restart_syscall",
  1: "SYS_exit",
  2: "SYS_fork",
  3: "SYS_read",
  4: "SYS_write",
  5: "SYS_open",
  6: "SYS_close",
  7: "SYS_waitpid",
  8: "SYS_creat",
  9: "SYS_link",
  10: "SYS_unlink",
  11: "SYS_execve",
  12: "SYS_chdir",
  13: "SYS_time",
  14: "SYS_mknod",
  15: "SYS_chmod",
  16: "SYS_lchown",
  17: "SYS_break",
  18: "SYS_oldstat",
  19: "SYS_lseek",
  20: "SYS_getpid",
  21: "SYS_mount",
  22: "SYS_umount",
  23: "SYS_setuid",
  24: "SYS_getuid",
  25: "SYS_stime",
  26: "SYS_ptrace",
  27: "SYS_alarm",
  28: "SYS_oldfstat",
  29: "SYS_pause",
  30: "SYS_utime",
  31: "SYS_stty",
  32: "SYS_gtty",
  33: "SYS_access",
  34: "SYS_nice",
  35: "SYS_ftime",
  36: "SYS_sync",
  37: "SYS_kill",
  38: "SYS_rename",
  39: "SYS_mkdir",
  40: "SYS_rmdir",
  41: "SYS_dup",
  42: "SYS_pipe",
  43: "SYS_times",
  44: "SYS_prof",
  45: "SYS_brk",
  46: "SYS_setgid",
  47: "SYS_getgid",
  48: "SYS_signal",
  49: "SYS_geteuid",
  50: "SYS_getegid",
  51: "SYS_acct",
  52: "SYS_umount2",
  53: "SYS_lock",
  54: "SYS_ioctl",
  55: "SYS_fcntl",
  56: "SYS_mpx",
  57: "SYS_setpgid",
  58: "SYS_ulimit",
  59: "SYS_oldolduname",
  60: "SYS_umask",
  61: "SYS_chroot",
  62: "SYS_ustat",
  63: "SYS_dup2",
  64: "SYS_getppid",
  65: "SYS_getpgrp",
  66: "SYS_setsid",
  67: "SYS_sigaction",
  68: "SYS_sgetmask",
  69: "SYS_ssetmask",
  70: "SYS_setreuid",
  71: "SYS_setregid",
  72: "SYS_sigsuspend",
  73: "SYS_sigpending",
  74: "SYS_sethostname",
  75: "SYS_setrlimit",
  76: "SYS_getrlimit",
  77: "SYS_getrusage",
  78: "SYS_gettimeofday",
  79: "SYS_settimeofday",
  80: "SYS_getgroups",
  81: "SYS_setgroups",
  82: "SYS_select",
  83: "SYS_symlink",
  84: "SYS_oldlstat",
  85: "SYS_readlink",
  86: "SYS_uselib",
  87: "SYS_swapon",
  88: "SYS_reboot",
  89: "SYS_readdir",
  90: "SYS_mmap",
  91: "SYS_munmap",
  92: "SYS_truncate",
  93: "SYS_ftruncate",
  94: "SYS_fchmod",
  95: "SYS_fchown",
  96: "SYS_getpriority",
  97: "SYS_setpriority",
  98: "SYS_profil",
  99: "SYS_statfs",
  100: "SYS_fstatfs",
  101: "SYS_ioperm",
  102: "SYS_socketcall",
  103: "SYS_syslog",
  104: "SYS_setitimer",
  105: "SYS_getitimer",
  106: "SYS_stat",
  107: "SYS_lstat",
  108: "SYS_fstat",
  109: "SYS_olduname",
  110: "SYS_iopl",
  111: "SYS_vhangup",
  112: "SYS_idle",
  113: "SYS_vm86old",
  114: "SYS_wait4",
  115: "SYS_swapoff",
  116: "SYS_sysinfo",
  117: "SYS_ipc",
  118: "SYS_fsync",
  119: "SYS_sigreturn",
  120: "SYS_clone",
  121: "SYS_setdomainname",
  122: "SYS_uname",
  123: "SYS_modify_ldt",
  124: "SYS_adjtimex",
  125: "SYS_mprotect",
  126: "SYS_sigprocmask",
  127: "SYS_create_module",
  128: "SYS_init_module",
  129: "SYS_delete_module",
  130: "SYS_get_kernel_syms",
  131: "SYS_quotactl",
  132: "SYS_getpgid",
  133: "SYS_fchdir",
  134: "SYS_bdflush",
  135: "SYS_sysfs",
  136: "SYS_personality",
  137: "SYS_afs_syscall",
  138: "SYS_setfsuid",
  139: "SYS_setfsgid",
  140: "SYS__llseek",
  141: "SYS_getdents",
  142: "SYS__newselect",
  143: "SYS_flock",
  144: "SYS_msync",
  145: "SYS_readv",
  146: "SYS_writev",
  147: "SYS_getsid",
  148: "SYS_fdatasync",
  149: "SYS__sysctl",
  150: "SYS_mlock",
  151: "SYS_munlock",
  152: "SYS_mlockall",
  153: "SYS_munlockall",
  154: "SYS_sched_setparam",
  155: "SYS_sched_getparam",
  156: "SYS_sched_setscheduler",
  157: "SYS_sched_getscheduler",
  158: "SYS_sched_yield",
  159: "SYS_sched_get_priority_max",
  160: "SYS_sched_get_priority_min",
  161: "SYS_sched_rr_get_interval",
  162: "SYS_nanosleep",
  163: "SYS_mremap",
  164: "SYS_setresuid",
  165: "SYS_getresuid",
  166: "SYS_vm86",
  167: "SYS_query_module",
  168: "SYS_poll",
  169: "SYS_nfsservctl",
  170: "SYS_setresgid",
  171: "SYS_getresgid",
  172: "SYS_prctl",
  173: "SYS_rt_sigreturn",
  174: "SYS_rt_sigaction",
  175: "SYS_rt_sigprocmask",
  176: "SYS_rt_sigpending",
  177: "SYS_rt_sigtimedwait",
  178: "SYS_rt_sigqueueinfo",
  179: "SYS_rt_sigsuspend",
  180: "SYS_pread64",
  181: "SYS_pwrite64",
  182: "SYS_chown",
  183: "SYS_getcwd",
  184: "SYS_capget",
  185: "SYS_capset",
  186: "SYS_sigaltstack",
  187: "SYS_sendfile",
  188: "SYS_getpmsg",
  189: "SYS_putpmsg",
  190: "SYS_vfork",
  191: "SYS_ugetrlimit",
  192: "SYS_mmap2",
  193: "SYS_truncate64",
  194: "SYS_ftruncate64",
  195: "SYS_stat64",
  196: "SYS_lstat64",
  197: "SYS_fstat64",
  198: "SYS_lchown32",
  199: "SYS_getuid32",
  200: "SYS_getgid32",
  201: "SYS_geteuid32",
  202: "SYS_getegid32",
  203: "SYS_setreuid32",
  204: "SYS_setregid32",
  205: "SYS_getgroups32",
  206: "SYS_setgroups32",
  207: "SYS_fchown32",
  208: "SYS_setresuid32",
  209: "SYS_getresuid32",
  210: "SYS_setresgid32",
  211: "SYS_getresgid32",
  212: "SYS_chown32",
  213: "SYS_setuid32",
  214: "SYS_setgid32",
  215: "SYS_setfsuid32",
  216: "SYS_setfsgid32",
  217: "SYS_pivot_root",
  218: "SYS_mincore",
  219: "SYS_madvise",
  219: "SYS_madvise1",
  220: "SYS_getdents64",
  221: "SYS_fcntl64",
  224: "SYS_gettid",
  225: "SYS_readahead",
  226: "SYS_setxattr",
  227: "SYS_lsetxattr",
  228: "SYS_fsetxattr",
  229: "SYS_getxattr",
  230: "SYS_lgetxattr",
  231: "SYS_fgetxattr",
  232: "SYS_listxattr",
  233: "SYS_llistxattr",
  234: "SYS_flistxattr",
  235: "SYS_removexattr",
  236: "SYS_lremovexattr",
  237: "SYS_fremovexattr",
  238: "SYS_tkill",
  239: "SYS_sendfile64",
  240: "SYS_futex",
  241: "SYS_sched_setaffinity",
  242: "SYS_sched_getaffinity",
  243: "SYS_set_thread_area",
  244: "SYS_get_thread_area",
  245: "SYS_io_setup",
  246: "SYS_io_destroy",
  247: "SYS_io_getevents",
  248: "SYS_io_submit",
  249: "SYS_io_cancel",
  250: "SYS_fadvise64",
  252: "SYS_exit_group",
  253: "SYS_lookup_dcookie",
  254: "SYS_epoll_create",
  255: "SYS_epoll_ctl",
  256: "SYS_epoll_wait",
  257: "SYS_remap_file_pages",
  258: "SYS_set_tid_address",
  259: "SYS_timer_create",
  260: "SYS_timer_settime",
  261: "SYS_timer_gettime",
  262: "SYS_timer_getoverrun",
  263: "SYS_timer_delete",
  264: "SYS_clock_settime",
  265: "SYS_clock_gettime",
  266: "SYS_clock_getres",
  267: "SYS_clock_nanosleep",
  268: "SYS_statfs64",
  269: "SYS_fstatfs64",
  270: "SYS_tgkill",
  271: "SYS_utimes",
  272: "SYS_fadvise64_64",
  273: "SYS_vserver",
  274: "SYS_mbind",
  275: "SYS_get_mempolicy",
  276: "SYS_set_mempolicy",
  277: "SYS_mq_open",
  278: "SYS_mq_unlink",
  279: "SYS_mq_timedsend",
  280: "SYS_mq_timedreceive",
  281: "SYS_mq_notify",
  282: "SYS_mq_getsetattr",
  283: "SYS_kexec_load",
  284: "SYS_waitid",
  286: "SYS_add_key",
  287: "SYS_request_key",
  288: "SYS_keyctl",
  289: "SYS_ioprio_set",
  290: "SYS_ioprio_get",
  291: "SYS_inotify_init",
  292: "SYS_inotify_add_watch",
  293: "SYS_inotify_rm_watch",
  294: "SYS_migrate_pages",
  295: "SYS_openat",
  296: "SYS_mkdirat",
  297: "SYS_mknodat",
  298: "SYS_fchownat",
  299: "SYS_futimesat",
  300: "SYS_fstatat64",
  301: "SYS_unlinkat",
  302: "SYS_renameat",
  303: "SYS_linkat",
  304: "SYS_symlinkat",
  305: "SYS_readlinkat",
  306: "SYS_fchmodat",
  307: "SYS_faccessat",
  308: "SYS_pselect6",
  309: "SYS_ppoll",
  310: "SYS_unshare",
  311: "SYS_set_robust_list",
  312: "SYS_get_robust_list",
  313: "SYS_splice",
  314: "SYS_sync_file_range",
  315: "SYS_tee",
  316: "SYS_vmsplice",
  317: "SYS_move_pages",
  318: "SYS_getcpu",
  319: "SYS_epoll_pwait",
  320: "SYS_utimensat",
  321: "SYS_signalfd",
  322: "SYS_timerfd_create",
  323: "SYS_eventfd",
  324: "SYS_fallocate",
  325: "SYS_timerfd_settime",
  326: "SYS_timerfd_gettime",
  327: "SYS_signalfd4",
  328: "SYS_eventfd2",
  329: "SYS_epoll_create1",
  330: "SYS_dup3",
  331: "SYS_pipe2",
  332: "SYS_inotify_init1",
  333: "SYS_preadv",
  334: "SYS_pwritev",
  340: "SYS_prlimit64",
  341: "SYS_name_to_handle_at",
  342: "SYS_open_by_handle_at",
  343: "SYS_clock_adjtime",
  344: "SYS_syncfs",
  345: "SYS_sendmmsg",
  346: "SYS_setns",
  347: "SYS_process_vm_readv",
  348: "SYS_process_vm_writev",
  349: "SYS_kcmp",
  350: "SYS_finit_module",
  357: "SYS_recvmmsg",
  367: "SYS_fanotify_init",
  368: "SYS_fanotify_mark",
  375: "SYS_membarrier"
}

// Syscall API with C libraries. In theory this is the only JavaScript
// implementation we need.
var syscall = (function() {
  return {
    __syscall: function(n, args) {
      print('syscall(' + syscall_names[n] + ', ' + args + ')');
      return -1; },
    __syscall0: function(n) {
      print('syscall0(' + syscall_names[n] + ')');
      return -1; },
    __syscall1: function(n, a) {
      print('syscall1(' + syscall_names[n] + ', ' + a + ')');
      return -1; },
    __syscall2: function(n, a, b) {
      print('syscall2(' + syscall_names[n] + ', ' + a + ', ' + b + ')');
      return -1; },
    __syscall3: function(n, a, b, c) {
      print('syscall3(' + syscall_names[n] + ', ' + a + ', ' + b + ', ' + c + ')');
      return -1; },
    __syscall4: function(n, a, b, c, d) {
      print('syscall4(' + syscall_names[n] + ', ' + a + ', ' + b + ', ' + c + ', ' + d + ')');
      return -1; },
    __syscall5: function(n, a, b, c, d, e) {
      print('syscall4(' + syscall_names[n] + ', ' + a + ', ' + b + ', ' + c + ', ' + d + ', ' +
            e + ')');
      return -1; },
    __syscall6: function(n, a, b, c, d, e, f) {
      print('syscall6(' + syscall_names[n] + ', ' + a + ', ' + b + ', ' + c + ', ' + d + ', ' +
            e + ', ' + f + ')');
      return -1; },
    __syscall_cp: function(n, a, b, c, d, e, f) {
      print('syscall_cp(' + syscall_names[n] + ', ' + a + ', ' + b + ', ' + c + ', ' + d + ', ' +
            e + ', ' + f + ')');
      return -1; }
};
})();

// Start with the stub implementations. Further module loads may shadow them.
var ffi = (function() {
  var functions = {env:{memory: memory}};
  var libraries = [
    musl_hack, // Keep first, overriden later.
    builtins, ctype, math, runtime, stdio, stdlib, string, unix,
    syscall // Keep last.
  ];
  for (var l in libraries)
    for (var f in libraries[l])
      if (libraries[l].hasOwnProperty(f) && libraries[l][f] instanceof Function)
        functions["env"][f] = libraries[l][f];
  return functions;
})();

if (arguments.length < 1)
  throw new Error('Expected at least one wasm module to load.');

function load_wasm(file_path) {
  // TODO this should be split up in load, check dependencies, and then resolve
  // dependencies. That would make it easier to do lazy loading. We could do
  // this by catching load exceptions + adding to ffi and trying again, but
  // we're talking silly there: modules should just tell us what they want.
  const buf = (typeof readbuffer === 'function')
    ? new Uint8Array(readbuffer(file_path))
    : read(file_path, 'binary');
  instance = new WebAssembly.Instance(new WebAssembly.Module(buf), ffi)
  // For the application exports its memory, we use that rather than
  // the one we created. In this way this code works with modules that
  // import or export their memory.
  if (instance.exports.memory) {
    heap = instance.exports.memory.buffer;
    heap_uint8 = new Uint8Array(heap);
    heap_size_bytes = heap.byteLength;
  }
  return instance;
}

// Load modules in reverse, adding their exports to the ffi object.
// This is analogous to how the linker resolves symbols: the later modules
// export symbols used by the earlier modules, and allow shadowing.
// Note that all modules, as well as the main module, share a heap.
var modules = {};
for (var i = arguments.length - 1; i > 0; --i) {
  var path = arguments[i];
  modules[i] = load_wasm(path);
  for (var f in modules[i].exports) {
    // TODO wasm modules don't have hasOwnProperty. They probably should.
    //      The code should look like:
    //      if (modules[i].hasOwnProperty(f) &&
    //          modules[i][f] instanceof Function)
    if (modules[i].exports[f] instanceof Function)
      ffi['env'][f] = modules[i].exports[f];
  }
}

// Load the main module once the ffi object has been fully populated.
var main_module = arguments[0];
modules[0] = load_wasm(main_module);

// TODO check that `main` exists in modules[0].exports and error out if not.

try {
  var ret = modules[0].exports.main();
  stdio.__flush_stdout();
  print(main_module + '::main() returned ' + ret);
  if (ret != stdlib.EXIT_SUCCESS)
    throw new Error('main reported failure');
} catch (e) {
  stdio.__flush_stdout();
  if (e instanceof TerminateWasmException) {
    print('Program terminated with: ' + e);
    if (stdlib.__get_exit_code() != stdlib.EXIT_SUCCESS) {
      throw stdlib.__get_exit_code();
    }
  } else if (e instanceof NotYetImplementedException) {
    print(e);
    throw e;
  } else {
    function is_runtime_trap(e) {
      if ('string' != typeof e) return false;
      var traps = ['unreachable',
                   'memory access out of bounds',
                   'divide by zero',
                   'divide result unrepresentable',
                   'remainder by zero',
                   'integer result unrepresentable',
                   'invalid function',
                   'function signature mismatch'];
      for (var msg in traps) if (e == traps[msg]) return true;
      return false;
    }
    print(is_runtime_trap(e) ?
        ('Runtime trap: ' + e) :
        ('Unknown exception of type `' + typeof(e) + '`: ' + e));
    throw e;
  }
}
