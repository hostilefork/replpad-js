//
// c-pump.c
//
// * Functions in this file are exported by emscripten with preceding
//   underscores.  So `init_c_pump()` is called from JS as `_init_c_pump()`
//
// * "EM_ASM_" here actually means "EMBEDDED_JAVASCRIPT_" as the "assembly"
//
// * The EMSCRIPTEN_KEEPALIVE annotation tells the compiler that although
// the function is never called from the C, it is expected to be available
// to be called from JavaScript...so it shouldn't be GC'd by the build.
//

#include "pump.h"
#include "emscripten.h"

#define JS_EVENT_DOM_CONTENT_LOADED 0
#define JS_EVENT_OUTPUT_DONE 1
#define JS_EVENT_GOT_INPUT 2
#define JS_EVENT_HALTED 3


// PG => "Program Global"
//
char *PG_Input = nullptr;
uint32_t PG_Halted = 0;

EMSCRIPTEN_KEEPALIVE void init_c_pump(void) {
    //
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
    EM_ASM_({ // v-- apostrophe not double QUOTES! parenthesize COMMAS!
        self.event_id_to_num_map = ({ // see note on `self`
            'JS_EVENT_DOM_CONTENT_LOADED': $0,
            'JS_EVENT_OUTPUT_DONE': $1,
            'JS_EVENT_GOT_INPUT': $2,
            'JS_EVENT_HALTED': $3
        });
    },
        JS_EVENT_DOM_CONTENT_LOADED, /* $0 */
        JS_EVENT_OUTPUT_DONE, /* $1 */
        JS_EVENT_GOT_INPUT, /* $2 */
        JS_EVENT_HALTED /* $3 */
    );
}


// on_js_event() is exported as the JavaScript function `_on_js_event()` by
// Emscripten.
//
// It is called by the Web Worker code in %js-pump.js whenever it gets an event
// posted to it by the GUI thread, regarding something happening in the
// web browser.  What it will be called with is one of the JS_EVENT_XXX codes
// and its accompanying data (which may be null).
//
// !!! This routine currently cannot be called while the long-running repl()
// function is suspended in order to run asynchronous events.  For the moment,
// hacks are used to mutate PG_Input and PG_Halted from the JavaScript using
// setValue() on pointers from the `_fetch_xxx_hack()` calls.
//
EMSCRIPTEN_KEEPALIVE void on_js_event(int id, char *data) {
    printf("_c_on_event(%d) halted=%d\n", id, PG_Halted);

    switch (id) {
    case JS_EVENT_DOM_CONTENT_LOADED:
        break;

    case JS_EVENT_OUTPUT_DONE: {
        assert(not data);
        break; }

    case JS_EVENT_GOT_INPUT: {
        PG_Input = data;
        break; }

    case JS_EVENT_HALTED: {
        PG_Halted = true;
        break; }

    default:
        assert(false);
    }
}

// !!! Hacks used until _c_on_event() can't be called.

EMSCRIPTEN_KEEPALIVE char** fetch_input_ptr_hack(void)
  { return &PG_Input; }

EMSCRIPTEN_KEEPALIVE uint32_t* fetch_halted_ptr_hack(void)
  { return &PG_Halted; }


// Synchronous-looking API

char *js_getline(char **lineptr, size_t *n)
{
    EM_ASM_({ // v-- apostrophe not double QUOTES! parenthesize COMMAS!
        queueRequestToJS('C_REQUEST_INPUT');
    } /* no args needed, e.g. no $0, $1... */ );

    while (not PG_Input) // c_on_event() sets this
       emscripten_sleep_with_yield(50);

    char *result = PG_Input;
    PG_Input = nullptr;

    return result;
}

void js_printf(const char *fmt, ...)
{ 
    // See example: https://en.cppreference.com/w/c/io/vfprintf
    //
    va_list args1;
    va_start(args1, fmt);
    va_list args2;
    va_copy(args2, args1);
    int len = 1 + vsnprintf(NULL, 0, fmt, args1);
    char *utf8_buf = malloc(len);
    va_end(args1);
    vsnprintf(utf8_buf, len, fmt, args2);
    va_end(args2);
 
    EM_ASM_({ // v-- apostrophe not double QUOTES! parenthesize COMMAS!
        queueRequestToJS('C_REQUEST_OUTPUT', UTF8ToString($0));
    }, utf8_buf /* $0 */);

    free(utf8_buf);

    emscripten_sleep_with_yield(0);
}

void js_exit(int status)
{
    EM_ASM_({ // v-- apostrophe not double QUOTES! parenthesize COMMAS!
        queueRequestToJS('C_REQUEST_QUIT');
    } /* should pass status via $0 but only strings for now */);
}
