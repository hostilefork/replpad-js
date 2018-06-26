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

EMSCRIPTEN_KEEPALIVE char *c_on_event(int id, char *data) {
    printf("enter _c_on_event(%d) halted=%d\n", id, PG_Halted);

    char *req;

    switch (id) {
    case 0: // startup
        req = malloc(1);
        req[0] = 2; // just request input, for now
        break;

    case 1: { // output successfully printed
        assert(not data);
        req = malloc(1);
        req[0] = 2; // just request input, for now
        break; }

    case 2: { // got input
        req = malloc(3);
        req[0] = 1;
        req[1] = data[0]; // just return first letter
        req[2] = '\0';
        free(data);
        break; }

    default:
        assert(false);
    }

    printf("exit _c_on_event->%d halted=%d\n", req[0], PG_Halted);
    return req;
}
