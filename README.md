# REPLPAD-JS

Copyright (c) 2018-2019 hostilefork.com

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

The libRebol.js loader is being designed to load hosted files from the web,
and automatically detect browser features to see if it needs the emterpreter
(OS-ID = 0.16.1) or the WebAssembly/WASM-Threads version (OS-ID = 0.16.2)
But if you want to run against a local version you build or download yourself,
the libraries and related support files should be in subdirectories with
these names:

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
    r3-make ${REN-C-DIR}/make/make.r \
        config: ${REN-C-DIR}/make/configs/emterpreter.r \
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
    loop 5 [
       print "Enter a value:"
       x: input
       sum: sum + x
    ]
    print ["The sum was" sum]

This is an example of doing synchronous I/O--displaying output and gathering
input--while a C function implementing LOOP is running.  Yet a JavaScript
browser does not have a mechanism for information from DOM manipulations to
reach code in such a synchronous style.  It must yield to the browser, and be
called back.

So to have code in this style work, one must:

* Queue a request to the browser, to be called back from later
* Save the entire state of the C stack--putting it into "suspended animation"
* Yield to the browser's main loop, to enable being called back
* When called back, poke the response data into memory where the C can read it
* Bring the C code out of suspended animation to observe the response

Fortunately, Emscripten has a tool for addressing this--though it might sound
a little bonkers.  What they do is let you embed a JavaScript interpreter that
is *written in JavaScript* into your project.  Then it compiles your C into
a bytecode that runs in that interpreter:

https://github.com/kripken/emscripten/wiki/Emterpreter

This way, each function call in your C no longer gets a corresponding level of
stack in the browser's JavaScript interpreter.  It merely updates the embedded
interpreter's state, which is being processed by `emterpret()`.  Emterpreter
is designed to be suspended at any time...the function in the C called to do
this is `emscripten_sleep_with_yield()`.


## License

A "strong" share-alike license was chosen for this project: the Affero GPL v3.
This is based on the hope that it will grow to be more substantial, and that
any reasonable fork/clone shouldn't have a problem sharing their improvements.

Any snippets here that were taken from free sources on the web cite their
original links.  If a small portion of *original* code is of interest, then
permission would almost certainly be granted to borrow it under an MIT license.
Just ask.  Or if you don't feel like asking, use common sense; it's not like
we're Oracle.  9 lines of code doth not a lawsuit make.  *(Unless you ARE
Oracle...in which case, heck yeah we'll sue you!)*

In time, the license might be weakened to something more liberal.  Until such
time as a truly principled significant contributor demands that the project
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

* For plausibly good security reasons, Chrome does not let web pages run local
  files from web pages.  This means the `new Worker('worker.js')` call has a
  security problem if you are browsing the page by a local `file://` URL.  To
  work around this, there's an HTTP server in Python available on most unixes
  that just serves the files out of the current directory at localhost:

      python -m SimpleHTTPServer <port>

* Web Assembly is relatively new, but the MIME type must be served correctly
  for it to work.  You may have to add `application/webassembly wasm` to your
  webserver's `/etc/mime-types` file (and restart, e.g. `apache2ctl restart`).
  Failure to do so means it will "fall back to an ArrayBuffer implementation",
  which is slower.  (You will notice it appearing to fetch the .wasm file twice
  in the network log.)
