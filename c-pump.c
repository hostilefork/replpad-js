//
// c-pump.c
//

#include <string.h>
#include <stdlib.h>
#include <assert.h>
#include <iso646.h>
#include <stdint.h>
#include <stdbool.h>

// Emscripten builds a .js file that contains some amount of code for detecting
// what kind of environment that JS is running in.  `printf("...\n")` is set
// up to go to console.log, hence is useful for debugging--but not for normal
// user interaction.
//
#include <stdio.h>

#include "emscripten.h"

int32_t PG_Halted = 0; // Program Global Halted
EMSCRIPTEN_KEEPALIVE int32_t *c_get_halt_ptr(void) {
    return &PG_Halted;
}

#define C_REQUEST_OUTPUT 0
#define C_REQUEST_INPUT 1
#define C_REQUEST_SLEEP 2

#define JS_EVENT_DOM_CONTENT_LOADED 0
#define JS_EVENT_OUTPUT_DONE 1
#define JS_EVENT_GOT_INPUT 2
/* JS_EVENT_HALTED is not actually passed to the C code */


// c_on_event() is exported as the JavaScript function `_c_on_event()` by
// Emscripten.
//
// It is called by the Web Worker code in %js-pump.js whenever it gets an event
// posted to it by the GUI thread, regarding something happening in the
// web browser.  What it will be called with is one of the JS_EVENT_XXX codes
// and its accompanying data (which may be null).
//
// While c_on_event() is running, the browser will continue to be responsive...
// because it is on a separate thread in the worker.  However, there can be
// no communication between the running C code and the JavaScript code other
// than through a returned result, and getting back another event.
//
// The current simple protocol for the return value is that it returns a
// malloc()'d block of memory, whose first bte is a C_REQUEST_XXX constant.
// The following bytes represent a UTF-8 string, or the invalid UTF-8 byte
// 255 if the result is null.  The JavaScript code is responsible for freeing
// the allocated return result.
//
// NOTE: The EMSCRIPTEN_KEEPALIVE annotation tells the compiler that although
// the function is never called from the C, it is expected to be available
// to be called from JavaScript...so it shouldn't be GC'd by the build.
//
EMSCRIPTEN_KEEPALIVE char *c_on_event(int id, char *data) {
    printf("enter _c_on_event(%d) halted=%d\n", id, PG_Halted);

    char *req;

    switch (id) {
    case JS_EVENT_DOM_CONTENT_LOADED: // startup
        req = malloc(2);
        req[0] = C_REQUEST_INPUT;
        req[1] = '\xFF'; // invalid UTF-8 byte, signals null data

        // !!! The goal for this table is to get rid of the redundancy, and
        // make it so the constants are defined in one place in the C and
        // then the JavaScript picks them up.  Truly excising the redundancy
        // will require token pasting or some other figuring, it's a work
        // in progress...but at least the JS file doesn't hardcode numbers.
        //
        // NOTE: self seems to be required here when using with a Web Worker.
        // It doesn't seem to be required when using in just a plain "window"
        // context, and it doesn't appear needed for variables in `pump.js`.
        // So the need for it has something to do in particular with the
        // scope in effect set up by all the emscripten wrapper code.  The
        // "right" way to do this in emscripten should be researched.
        //
        // NOTE: "EM_ASM_" here *actually* means "EMBEDDED_JAVASCRIPT_"
        //
        EM_ASM_({ // v-- apostrophe not double QUOTES! parenthesize COMMAS!
            self.num_to_request_id_map = ([ // see note on `self`
                'C_REQUEST_OUTPUT',
                'C_REQUEST_INPUT',
                'C_REQUEST_SLEEP'
            ]);
            self.event_id_to_num_map = ({ // see note on `self`
                'JS_EVENT_DOM_CONTENT_LOADED': $0,
                'JS_EVENT_OUTPUT_DONE': $1,
                'JS_EVENT_GOT_INPUT': $2
            });
        }, // v-- C parameters substituted in order, $0, $1, $2...
            JS_EVENT_DOM_CONTENT_LOADED,
            JS_EVENT_OUTPUT_DONE,
            JS_EVENT_GOT_INPUT
        );
        break;

    case JS_EVENT_OUTPUT_DONE: {
        assert(not data);
        req = malloc(2);
        req[0] = C_REQUEST_INPUT;
        req[1] = '\xFF'; // invalid UTF-8 byte, signals null data
        break; }

    case JS_EVENT_GOT_INPUT: {
        req = malloc(3);
        req[0] = C_REQUEST_OUTPUT;
        req[1] = data[0]; // !!! simplest of feedback, just return first letter
        req[2] = '\0';
        break; }

    default:
        assert(false);
    }

    printf("exit _c_on_event->%d halted=%d\n", req[0], PG_Halted);
    return req;
}
