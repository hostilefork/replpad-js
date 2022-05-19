# REPLPAD-JS

Copyright (c) 2018-2020 hostilefork.com

This project is an effort to build an interactive GUI console that runs in
a web browser, for the Ren-C branch of Rebol3:

http://github.com/metaeducation/ren-c

It is inspired by a prior non-web effort circa 2015, written in Qt:

https://www.youtube.com/watch?v=0exDvv5WEv

This project is at a very early stage of development.  For support, please
visit the StackOverflow chat room or Rebol Discourse Forum:

* https://chat.stackoverflow.com/rooms/291/rebol
* https://forum.rebol.info


## Dependencies

ReplPad depends on libRebol.js, which is the JavaScript version of Ren-C's
"lightweight" API.

It uses the `load-r3.js` hosted on S3.  This loader detects browser features,
and knows where to find hosted copies of builds for the empterpreter
(OS-ID = 0.16.1) or the WebAssembly/WASM-Threads version (OS-ID = 0.16.2)

The loader supports parsing the URL requested to load the page and looks for
`?local`, which requests running against a build relative to the location of
the page.  If you go with this option, you will need to build or obtain
copies of the compiled Rebol interpreter in subdirectories with these names:

* `%0.16.1/libr3.js`
* `%0.16.1/libr3.wasm`
* `%0.16.1/libr3.bytecode`

* `%0.16.2/libr3.js`
* `%0.16.2/libr3.wasm`
* `%0.16.2/libr3.js.mem`

It is possible to tell rebmake to do an "out of source build" and put its
build products in any directory you want.  So you might say something along
the lines of:

    mkdir 0.16.1
    cd 0.16.1
    r3-make ${REN_C_DIR}/make.r \
        config: ${REN_C_DIR}/configs/emscripten.r \
        target: makefile

    make

*(It may be helpful to create a script that does this, e.g. `./jsmake`)*


## Mechanics

The Rebol interpreter is written in C, so running it in a browser requires it
to be "transpiled" into JavaScript or WebAssembly.  This is done via the
Mozilla "Emscripten" project:

http://emscripten.org
https://kripken.github.io/emscripten-site/docs/getting_started/FAQ.html

Thanks to that project, getting a sufficiently standards-compliant C codebase
to merely *execute* in a browser is not difficult.  One simply uses the
`emcc` front-end instead of plain `gcc` or `clang`.  Having this "just work"
mostly has to do with minding one's p's and `*`'s about issues of alignment and
aliasing (which C developers should have been doing anyway).

What makes it tricky is when your C code was written in a synchronous style,
expecting to see feedback while it is running--instead of waiting until it has
finished running.  For instance:

    sum: 0
    repeat 5 [
       print "Enter a value:"
       x: ask integer!
       sum: sum + x
    ]
    print ["The sum was" sum]

This is an example of doing synchronous I/O--displaying output and gathering
input--while a C function implementing REPEAT is running.  Yet a JavaScript
browser does not have a mechanism for information from DOM manipulations to
reach code in such a synchronous style.  It must yield to the browser, and be
called back.

This is technically possible to do if the C code was running on a JavaScript
"web worker".  It can suspend itself--leaving the stack state intact--and
wait for a wakeup message to come from the GUI thread.  That solution is
implemented in the JavaScript extension for Rebol via the `rebPromise()` API.

But if threads aren't available in the browser, it's a bit more complex:

* Queue a request to the browser, to be called back from later
* Save the entire state of the C stack--putting it into "suspended animation"
* Yield to the browser's main loop, to enable being called back
* When called back, poke the response data into memory where the C can read it
* Bring the C code out of suspended animation to observe the response

Fortunately, Emscripten has tools for addressing this.  Once those depended
on embedding a JavaScript interpreter that was *written in JavaScript* into
your project...so it could simulate scripts, suspend them, and bring them back
to life on a single thread.  But the modern approach is based on weaving
instructions into the Clang code generation itself to make certain functions
suspendible at the WebAssembly level, this is called "Asyncify":

https://emscripten.org/docs/porting/asyncify.html

The threading approach is preferred, and over the long run will hopefully be
supported in more browsers.


## License

A share-alike license was chosen for this project: the GNU Lesser GPL v3.
This is based on the hope that it will grow to be more substantial, and that
any reasonable fork/clone shouldn't have a problem sharing their improvements.

Any snippets here that were taken from free sources on the web cite their
original links.  If a small portion of *original* code is of interest, then
permission would almost certainly be granted to borrow it under an MIT license.
Just ask.  Or if you don't feel like asking, use common sense; it's not like
we're Oracle.  9 lines of code doth not a lawsuit make.  *(Unless you ARE
Oracle...in which case, heck yeah we'll sue you!)*

Initially the project was Affero GPL but relaxed to LGPL, which seems fair
enough.  Until a principled significant contributor demands that the project
*not* be relicensed, it's asked that all contributors agree that a more liberal
license could be chosen.  The only rule is that there won't be any "special
treatment" licenses--e.g. a more liberal license for people who pay.  Any
license change will be applicable to everyone.  *(Except, maybe...Oracle.)*

Note: This doesn't preclude someone making a donation in order to ask that
the license be loosened.  It just means that everyone gets the result--not
just the donor.


## Coding Style

This tries to follow the Ren-C coding styles as closely as possible.  Lines are
kept to 80 columns, etc.

One thing being tried is going with "no semicolons" in JavaScript.  This is
more in line with the visual aesthetics of Rebol, and is advocated by some
authoritative-sounding voices in the JavaScript community:

https://feross.org/never-use-semicolons/
https://standardjs.com/

Also in line with Rebol is specifically being a bit Luddite, and not engaging
complex build processes that abstract stylesheets or use TypeScript or bring
other toolchains into the mix.  While there are projects which simply must do
this, the hope here is to build something that does not need to.

For the moment, this is including the choice to avoid jQuery--which is a more
viable option than it was historically.  Exactly how things will evolve as it
moves from cut-and-paste to a project of scale will be seen as it goes.


## Usage Notes

* If you've built locally and want an easy solution for serving the files,
  there's an HTTP server in Python available on most unixes that just serves
  the files out of the current directory at localhost:

      python -m SimpleHTTPServer <port>

  A similar project exists which uses Rebol, but it is not "published" at this
  time.  So to avoid support requests, anyone who doesn't already know
  about it (who can fix bugs themselves) is asked to use a different server.

* Web Assembly is relatively new, but the MIME type must be served correctly
  for it to work.  You may have to add `application/webassembly wasm` to your
  webserver's `/etc/mime-types` file (and restart, e.g. `apache2ctl restart`).
  Failure to do so means it will "fall back to an ArrayBuffer implementation",
  which is slower.  (You will notice it appearing to fetch the .wasm file twice
  in the network log.)
