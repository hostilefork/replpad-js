#include <string.h>
#include <stdlib.h>
#include <assert.h>
#include <iso646.h>
#include <stdint.h>
#include <stdbool.h>


//================================================================

// Emscripten builds a .js file that contains some amount of code
// for detecting what kind of environment that JS is running in.
// printf("...\n") knows enough to go to console.log, hence is
// useful for debugging--but not for normal user interaction.
//
#include <stdio.h>

#include "emscripten.h"

int32_t PG_Halted = 0; // Program Global Halted
EMSCRIPTEN_KEEPALIVE int32_t *c_get_halt_ptr(void) {
    return &PG_Halted;
}

// The c_on_input event is called by JavaScript when an interesting
// event happens.  The Rebol code will run arbitrarily long to
// deal with this--but so long as it is running, there will be no
// updates to the DOM or browser UI.  Only alert() boxes and the
// console.log() will work.
//
// If the Rebol code wants to have an effect on the UI, but is not
// actually finished running--it puts itself into a state of 
// "suspended animation".  Whatever state the evaluator is in at
// the time of the UI update request is preserved, but mechanically
// it has to unwind the emscripten stack to return from this
// function.  What gets returned are the events to pump, which will
// then hopefully retrigger this function so the Rebol can resume
// the suspended animation state.

#define C_REQUEST_OUTPUT 0
#define C_REQUEST_INPUT 1
#define C_REQUEST_SLEEP 2

#define JS_EVENT_DOM_CONTENT_LOADED 0
#define JS_EVENT_OUTPUT_DONE 1
#define JS_EVENT_GOT_INPUT 2

EMSCRIPTEN_KEEPALIVE char *c_on_event(int id, char *data) {
    printf("enter _c_on_event(%d) halted=%d\n", id, PG_Halted);

    char *req;

    switch (id) {
    case JS_EVENT_DOM_CONTENT_LOADED: // startup
        req = malloc(2);
        req[0] = C_REQUEST_INPUT;
        req[1] = '\0'; // no data

        // !!! The goal for this table is to get rid of the redundancy, and
        // make it so the constants are defined in one place in the C and
        // then the JavaScript picks them up.  Truly excising the redundancy
        // will require token pasting or some other figuring, it's a work
        // in progress...but at least the JS file doesn't hardcode numbers.
        //
        // v-- apostrophe not double QUOTES! parenthesize COMMAS!
        EM_ASM_({
            num_to_request_id_map = ([
                'C_REQUEST_OUTPUT',
                'C_REQUEST_INPUT',
                'C_REQUEST_SLEEP'
            ]);
            event_id_to_num_map = ({
                'JS_EVENT_DOM_CONTENT_LOADED': $0,
                'JS_EVENT_OUTPUT_DONE': $1,
                'JS_EVENT_GOT_INPUT': $2
            });
        },
            JS_EVENT_DOM_CONTENT_LOADED,
            JS_EVENT_OUTPUT_DONE,
            JS_EVENT_GOT_INPUT
        );
        break;

    case JS_EVENT_OUTPUT_DONE: {
        assert(not data);
        req = malloc(2);
        req[0] = C_REQUEST_INPUT;
        req[1] = '\0';
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
