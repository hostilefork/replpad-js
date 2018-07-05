//
// js-pump.js
//
// This is the "JavaScript side" of the emscripten-based message pump.  The
// "C side" is implemented in %c-pump.c, whose build product is included here
// as `c-pump-o.js` (must be built with `emcc c-pump.js -o c-pump.o.js`).
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
// !!! This should be able to change with the use of emterpreter.  If the
// JavaScript transpilation of C code is being run by a loop of JavaScript
// that itself simulates JavaScript...that loop could itself interject
// polls to receive this halt.
//

importScripts('c-pump.o.js'); // provides _c_on_event(), _c_get_halt_ptr()

// The `halt_ptr` is an emscripten heap location that the C code polls to see
// if it is set.  Make it easy to write to it via JavaScript.
// 
var halt_ptr = _c_get_halt_ptr();

onmessage = function (e) { // triggered by queueEventToC
    event_id = e.data[0];
    event_str = e.data[1];
    console.log("JS Event => C: [" + event_id + "," + event_str + "]");

    // !!! It doesn't make sense to "send a halt event" to the C code, because
    // if the C code was ready to handle an event it would be idle and not
    // running--hence no point in sending it a halt.  Where halt makes sense
    // is if there's something which is simulating or preserving the C stack
    // and can manipulate a variable that it polls...e.g. emterpreter.  Doing
    // that is one of the goals of this experiment, but it isn't there yet.
    //
    if (event_id == 'JS_EVENT_HALTED') {
        setValue(halt_ptr, 1, 'i32'); // write to variable C code could observe
        return; // !!! not useful yet...
    }

    // event_str is a JavaScript string object that C can't decipher.  Use an
    // emscripten API to turn it into a byte array on the emscripten heap.
    //
    var event_c_str;
    if (event_str == null)
        event_c_str = null; // some events (like startup) have no arguments
    else
        event_c_str = allocateUTF8(event_str); // we must _free() this below

    var event_num;
    if (event_id == 'JS_EVENT_DOM_CONTENT_LOADED')
        event_num = 0; // C code to create map hasn't been made yet
    else
        event_num = event_id_to_num_map[event_id];

    // This will process a request that comes back from _c_on_event().
    // The request id is in the first byte, and the rest of the array is
    // the data to process.
    //
    // (A more complex system would be like WaitOnMultipleObjects(),
    // so that _c_on_event() could send back a list of requests and then
    // be notified if any of them were active.  The focus of this demo
    // is proof-of-concept on suspending a JavaScript interpreter that
    // is written in JavaScript, however.)
    //
    var req_buf = _c_on_event(event_num, event_c_str);
    if (event_c_str)
        _free(event_c_str) // by convention, JavaScript frees the buffer

    // The code that did queueEventToC() can optionally take action when the
    // C has processed that event.  Notification of the completion will come
    // before the notification of the request the C code made.
    //
    postMessage([event_id, event_str]);

    var req_buf_0 = getValue(req_buf + 0, 'i8'); // byte at req_buf[0]
    var request_id = num_to_request_id_map[req_buf_0];
    var request_str;
    console.log("byte is" + getValue(req_buf + 1, 'i8'));
    if (getValue(req_buf + 1, 'i8') == -1) // a.k.a. u8 255 (there's no 'u8')
        request_str = null; // 255 is invalid UTF-8 byte, signals null
    else
        request_str = UTF8ToString(req_buf + 1); // from emscripten heap
    _free(req_buf);

    // This will eventually run `pump.onmessage` in the code that instantiated
    // the pump worker.  So if that code said:
    //
    //     var pump = Worker('js-pump.js');
    //     pump.onmessage(function (e) {...});
    //
    // ...this argument to postMessage is the `e.data` that code will receive.
    //
    postMessage([request_id, request_str]);
    console.log("C Request => JS [" + request_id + "," + request_str + "]");
}
