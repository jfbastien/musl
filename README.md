# musl libc

The [master branch][] reflects the upstream [musl][] without any modifications.
Other branches are used for WebAssembly-specific experiments.

The prototype branches are just that: experimental prototypes.

**Don't commit to the master branch except to update from musl!**

To update the master branch:

```
git clone --origin wasm git@github.com:WebAssembly/musl.git
cd musl
git remote add musl git://git.musl-libc.org/musl
git remote -v  # List all remotes.
git checkout master
git pull musl master
git push wasm master
```

Consult [musl's readme](README) and [license](COPYRIGHT) for further
information.

  [master branch]: https://github.com/WebAssembly/musl/tree/master
  [musl]: http://www.musl-libc.org
