//
// js-pump.js
//
// While JavaScript has "workers", these are more analogous to different
// processes than different threads.  Variables aren't shared between
// them--so that includes the simulated C heap and state of the C code
// being run by emscripten.
//

// Regarding access of the C emscripten memory heap from JavaScript:
//
// http://kripken.github.io/emscripten-site/docs/porting/connecting_cpp_and_javascript/Interacting-with-code.html#interacting-with-code-access-memory
//
// The `halt_ptr` is a memory location that the C code polls to see
// if it is set.  Make it easy to write to it via JavaScript.
// 
var halt_ptr = _c_get_halt_ptr();

function queueEventToC(event_id, event_str) {
    //
    // Do generic callback so UI can update when any event is submitted.
    // (e.g. a "working..." dialog box, or other UI feedback).
    //
    console.log("onQueueEventToC(" + event_id + "," + event_str + ")");
    onQueueEventToC(event_id, event_str);

    // Turn JavaScript string of the text input into an emscripten-ified
    // representation of what a transpiled C string looks like (e.g. a
    // JavaScript byte array)
    //
    // https://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html#intArrayFromString
    //
    // This is effectively a "malloc()", so it must be free()'d.  The
    // freeing is done on the JavaScript side.
    //
    var event_c_str;
    if (event_str == null)
      event_c_str = null; // some events (like startup) have no arguments
    else
      event_c_str = allocateUTF8(event_str); // to emscripten heap

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
    function afterDomSync() {
      var req_buf = _c_on_event(event_num, event_c_str); // JavaScript frees
      if (event_c_str)
          _free(event_c_str)

      onFinishEventInC(event_id, event_str);

      var req_buf_0 = getValue(req_buf + 0, 'i8'); // byte at req_buf[0]
      var request_id = num_to_request_id_map[req_buf_0];
      var request_str = UTF8ToString(req_buf + 1); // from emscripten heap
      console.log("onRequestFromC(" + request_id + "," + request_str + ")");
      onRequestFromC(request_id, request_str);
      _free(req_buf);
    }

    setTimeout(afterDomSync, 0); // yield to main loop before running
}

// The GUI is kept free to run events while the C code may not be yielding
// in the web worker.  So the UI won't lock up.  But if the C code doesn't
// yield--even for a moment with a poll request--then there's no way to
// modify state it could observe.
//
// !!! This should be able to change with the use of emterpreter.  If the
// JavaScript transpilation of C code is being run by a loop of JavaScript
// that itself simulates JavaScript...that loop could itself interject
// polls to receive this halt. 
//
function queueHaltOfC() {
  setTimeout(
    function() {
      setValue(halt_ptr, 1, 'i32');
    },
    0 // run ASAP--but may be a long time if _c_on_event() doesn't return
  );
}
