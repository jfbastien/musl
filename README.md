# WebAssembly experiment for musl libc with dynamic linking

The main goal was to get a WebAssembly libc off the ground. Dynamic linking kind
of came out of it *for free*.

*Note:* This experimental WebAssembly C library with dynamic linking is a
hack. Don't rely on it: it's meant to inform the design of WebAssembly. Things
are changing rapidly, so mixing different parts of the toolchain may break from
time to time, try to keep them all in sync.

[musl experiment details](https://github.com/WebAssembly/musl/blob/landing-branch/README.md).

## Quick how-to

Pre-built Linux x86-64 Linux binaries are available on the
[waterfall](https://wasm-stat.us), as well as `musl.wast`, `musl.wasm`, and
`wasm.js`.  The waterfall marks as green which builds are known to work
properly. Click on a green build to download the archived binaries. Check out
its [last known good revision](https://storage.googleapis.com/wasm-llvm/builds/git/lkgr).
You can build everything yourself using the waterfall's
[build.py](https://github.com/WebAssembly/waterfall/tree/master/src/build.py).

Compile your program using LLVM:
```
  clang -S foo.c
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
This may work... or not. File bugs on what's broken, or send patches!

## libc + dynamic linking: how does it work?

In the current V8 implementation of WebAssembly binaries, each `.wasm` module:

* Declares it imports and its exports.
* Takes in a dictionary mapping Foreign Function Interface (FFI) names to corresponding functions.
* Pointer to the heap, an `ArrayBuffer`.

The [wasm.js](https://github.com/WebAssembly/musl/blob/wasm-prototype-1/arch/wasm32/wasm.js) file:

* Initializes the heap.
* Implements a rudimentary C library in JavaScript, and adds these functions to the FFI object.
* Loads `.wasm` files provided on the command-line, from last to first.
* Adds each exported function to the FFI object, sometimes shadowing the JavaScript fallback.
* Loads the first `.wasm` file provided, assuming it's the main program, and calls its `main` function.

Each loaded `.wasm` file is initialized with the same heap. They all share the
same address space.

Calls from one WebAssembly module to another trampoline through JavaScript, but
they should optimize well. We should figure out what we suggest developers use,
so that the default pattern doesn't require gymnastics on the compiler's part.

A WebAssembly module with un-met imports will throw. This can be handled, add
the missing function as a stub to FFI, and then load again (loop until success)
but its' silly. If WebAssembly modules were loadable, imports inspectable, and
FFI object provided later then we'd be better off. We could implement very fancy
lazy-loading, where the developer can handle load failures. We could also easily
implement `dlopen` and `dlsym`.

It would also be good to be able to specify compilation / execution separately.

## libc implementation details

The current libc implementation builds a subset of musl using the hacked-up
`libc.py` script. It excludes files which triggered bugs throughout the
toolchain, not that the files being built are bug free either.

The implementation is based on Emscripten's musl port, but is based on a much
more recent musl and has no modifications to code musl: all changes are in the
`arch/wasm32` directory. It aims to only communicate to the embedder using a
syscall API, modeled after Linux' own syscall API. This may have shortcomings,
but it's a good thing to try out since we can revisit later. Note the
`musl_hack` functions in `wasm.js`: they fill in for functionality that's
currently been hacked out and which musl expects to import. It should be
exporting these instead. Maybe more functionality should be implemented in
JavaScript, but experience with NaCl and Emscripten leads us to believe the
syscall API is a good boundary.

The eventual goal is for the WebAssembly libc to be upstreamed to musl, and
that'll require *doing it right* according to the musl community. We also want
Emscripten to be able to use the same libc implementation. The approach in this
repository may not be the right one.

## Miscellaneous

Dynamic linking isn't in WebAssembly's current MVP because we thought it would
be hard. This repository shows that it's *possible*, we therefore may as well
design it right from the start.

That'll including figuring out calling convention and ABI. Exports currently
don't declare their signature in a WebAssembly module, even though they are in
the binary format, and don't cause any failure when the APIs don't match. That
should be fixed.
