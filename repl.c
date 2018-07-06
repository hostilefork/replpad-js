//
// repl.c
//
// The goal of this program is to be written in a synchronous style, where it
// expects to be able to call I/O routines and have them take effect without
// needing to yield itself off the stack.
//
// Plain emscripten has a very limited number of options for this, even though
// it is possible to run inline JavaScript that does arbitrary interaction
// with the DOM.  There's really only console.log and the modal "prompt" box:
//
// https://developer.mozilla.org/en-US/docs/Web/API/Window/prompt
//
// The reason that more isn't possible is because on the GUI thread, effects
// from changes to the DOM can only be seen after control has been returned to
// the browser's main loop.  That can't happen while the function is still
// hogging the thread by running.
//
// Putting the code on a Web Worker takes away the ability to access the DOM
// directly--you can't even use alert() or prompt()!  However, it does allow
// you to send messages to tell the GUI thread to affect the DOM while the
// function is still on the stack.  Yet it is a one way street--it can't get
// any information back from that process until the call that made the request
// has yielded control back to the brwoser.  Because the web worker's message
// queue is tied up so long as a function is running, and the message queue
// is the only way to get a response back (modulo something egregious, like
// using synchronous XMLHttpRequests to talk to the GUI through a webserver.)
//
// So one can either adapt to this by writing one's program in an asynchronous
// style like the rest of the JavaScript world (posting requests, getting
// called back when they're ready).  Or you can be rebellious and try working
// around it by simulating the execution of JavaScript *in JavaScript*, which
// allows a function making a synchronous request to be put in a state of
// suspended animation--then run the requests--then resume it.
//
// https://github.com/kripken/emscripten/wiki/Emterpreter
//
// ...so that is what this project is trying to figure out and do.
//

#include <string.h>
#include "pump.h"
#include <emscripten.h>

void repl(void)
{
    printf("C repl() function called\n");

    size_t size;
    char *line = nullptr;
    while (true) {
        free(line); // legal on nullptr */

        js_printf("&gt;&gt; ");
        size = 0;
        line = js_getline_unless_halt(nullptr, &size);
        if (not line) {
            js_printf("[Halted by ESCAPE]");
            continue;
        }

        if (strcmp(line, "quit") == 0)
            break;

        do {
            js_printf("... %s ... (hit ESC to cancel)", line);
        } while (not js_sleep_halts(2000));
        js_printf("[Halted by ESCAPE]");
    };

    // !!! The calls to `js_printf()` and `js_getline()` above cause repl()
    // to take itself off the stack, and then re-enter it via a setTimeout()
    // of a `resume()` function.  That resume() function doesn't look at the
    // ultimate return result...and all intermediate return results (such as
    // the one that the initial call to repl() might get on the first yield)
    // are garbage.  So returns are meaningless...use a routine that will
    // signal using a C_REQUEST to the message pump.
    //
    js_exit(0);
}
