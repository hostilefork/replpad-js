//
// worker.js
//
// This is the "JavaScript side" of the C code implemented in %c-pump.c, whose
// build product is included here as `c-pump-o.js` (see compile.sh for how
// this is built)
//
// Both pieces of the pump are intended to be run inside a "Web Worker", which
// has exclusive access to: any compiled C routines, the emscripten heap, and
// any emscripten APIs for accessing it.  The reason the access is exclusive
// is because JavaScript's web workers are more analogous to different
// "processes" than what people would think of conventionally as "threads":
//
// https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API
//
// Variables (and even constants) aren't shared between a worker and the
// browser GUI thread that spawned the worker via `new Worker()`.  The threads
// can't mutate each other's objects.  They can only post messages between
// them, where any objects in the message get fully copied.
//
// The GUI is kept free to run events while the C code may not be yielding
// in the web worker.  So the UI won't lock up.  But if the C code doesn't
// yield--even for a moment with a poll request--then there's no way to
// modify state it could observe, and any requests posted to it from the
// GUI could stay queued indefinitely.
//

// !!! Temp hacks to workaround: https://stackoverflow.com/questions/51204703/
//
var PG_Input_Ptr;
var PG_Halted_Ptr;
var premade_mallocs_hack = [];


function queueRequestToJS(id, str) {
    if (str === undefined)
        str = null; // although `undefined == null`, canonize to null

    // This will eventually run `pump.onmessage` in the code that instantiated
    // the pump worker.  So if that code said:
    //
    //     var pump = Worker('js-pump.js');
    //     pump.onmessage(function (e) {...});
    //
    // ...this argument to postMessage is the `e.data` that code will receive.
    //
    postMessage([id, str]);
    console.log("C Request => JS [" + id + "," + str + "]");
}


// If one is using Emterpreter, then immediately after the importScripts()
// for %c-pump.o.js, the C routine exports will not be available yet.  This
// adds to the usual JavaScript dependency of needing the DOM to have
// loaded before anything useful can be done.  The GUI will wait until it
// receives *both* the `DOMContentLoaded` event from the browser *and* the
// `C_REQUEST_LOAD_DOM_CONTENT` message we send here from the worker before
// posting the `JS_EVENT_DOM_CONTENT_LOADED` back to the worker.
//
var Module = {
    memoryInitializerPrefixURL: 'build/', // where %c-pump-o.js.mem is

    onRuntimeInitialized: function() {
        console.log("Worker: onRuntimeInitialized() event");

        // !!! see notes below on why this is necessary...once repl() starts
        // running, as long as it won't get off the stack, we can't malloc().
        //
        for (var i = 0; i < 100; ++i)
            premade_mallocs_hack.push(_malloc(100));

        _init_c_pump(); // initializes constant maps, also

        // !!! Hacks needed so long as _on_js_event() cannot be called.
        //
        PG_Input_Ptr = _fetch_input_ptr_hack(); // char**, starts at null
        PG_Halted_Ptr = _fetch_halted_ptr_hack(); // int32_t*, starts at 0

        queueRequestToJS('C_REQUEST_LOAD_DOM_CONTENT'); // likely loaded by now
    }
} 
importScripts('build/c-pump.o.js'); // _init_c_pump(), _on_js_event()


onmessage = function (e) { // triggered by queueEventToC
    id = e.data[0];
    str = e.data[1];
    console.log("JS Event => C: [" + id + "," + str + "]");

    if (id == 'JS_EVENT_DOM_CONTENT_LOADED') {        
        _repl();

        // The first time repl() yields, it will fall through to here to
        // return to the main loop.  But after that, it will be continued
        // by the `resume()` wrapper function that it was re-posted to run
        // with.  So there's really no way to get a result back from it.
        //
        // There's nothing particularly interesting about the first yield
        // vs any others that come later which you can't respond to, so don't
        // do anything special--just return.
        //
        return;
    }

    // !!! Currently researching how to be able to run C *during* the suspended
    // state of an `emscripten_sleep_with_yield()`:
    //
    // https://stackoverflow.com/questions/51204703/
    //
    // Until a more elegant solution is found, _malloc() can't be called during
    // that callback.  So a premade buffer must be around for pure JavaScript
    // to fill--but if it can do that, why can't non-emterpreted C do it?!  :-/
    //
    if (0) {
        var event_num = event_id_to_num_map[id];
        var c_str = str && allocateUTF8(str); // JS string => malloc()'d c_str
        _on_js_event(event_num, c_str);

        // don't free c_str(), let _c_on_event() take ownership
    }
    else {
        // !!! Proof-of-concept, just show that the JavaScript data can
        // make it to influence the repl(), despite it being written in a
        // synchronous-IO style.  Hack the bytes of the JavaScript string
        // into a premade buffer (hence no malloc())
        //
        switch (id) {

        case 'JS_EVENT_GOT_INPUT': {
            // AllocateUTF8(), minus the _malloc()...
            var size = lengthBytesUTF8(str) + 1;
            var c_str = premade_mallocs_hack.pop(); // !!! fails after 100
            stringToUTF8Array(str, HEAP8, c_str, size);
            setValue(PG_Input_Ptr, c_str, 'i8*');
            break; }

        case 'JS_EVENT_HALTED': {
            setValue(PG_Halted_Ptr, 1, 'i32');
            break; }

        case 'JS_EVENT_OUTPUT_DONE':
            break;

        default:
            console.log("unsupported JS_EVENT " + id);
        }
    }
}
