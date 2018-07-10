//
// File: %worker.js
// Summary: "Web Worker for Code Evaluation"
// Project: "JavaScript REPLpad for Ren-C branch of Rebol 3"
// Homepage: https://github.com/hostilefork/replpad-js/
//
//=////////////////////////////////////////////////////////////////////////=//
//
// Copyright (c) 2018 hostilefork.com
//
// See README.md and CREDITS.md for more information
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// https://www.gnu.org/licenses/agpl-3.0.en.html
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
//=////////////////////////////////////////////////////////////////////////=//
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

'use strict' // <-- FIRST statement! https://stackoverflow.com/q/1335851


function queueRequestToJS(id, str) {
    if (str === undefined)
        str = null // although `undefined == null`, canonize to null

    // This will eventually run `pump.onmessage` in the code that instantiated
    // the pump worker.  So if that code said:
    //
    //     var pump = Worker('js-pump.js');
    //     pump.onmessage(function (e) {...});
    //
    // ...this argument to postMessage is the `e.data` that code will receive.
    //
    postMessage([id, str])
    console.log("C Request => JS [" + id + "," + str + "]")
}


var Module = {
    memoryInitializerPrefixURL: 'build/', // where %c-pump-o.js.mem is

    // https://stackoverflow.com/q/46332699
    locateFile: function(s) {
      return 'build/' + s
    },

    // GUI will wait until it receives both the 'DOMContentLoaded' signal from
    // the browser, and this C_REQUEST_LOAD_DOM_CONTENT from the worker,
    // before signaling back to the worker with JS_EVENT_DOM_CONTENT_LOADED.
    // Hence that event means the GUI is ready to service requests.
    //
    onRuntimeInitialized: function() {
        _init_c_pump()
        queueRequestToJS('C_REQUEST_LOAD_DOM_CONTENT') // likely loaded by now
    },

    emterpreterFile: "<will be filled in via XMLHttpRequest()>"

    // The rest of these fields will be filled in by the boilerplate of the
    // Emterpreter.js file (it looks for an existing Module and adds to it,
    // but this is also how you parameterize options.)
} 

// If you use the emterpreter, it will balloon up the size of the javascript
// unless you break the emterpreter bytecode out into a separate binary file.
// You have to get the data into the Module['emterpreterFile'] before trying
// to load the emscripten'd code.
//
var req = new XMLHttpRequest()
req.open("GET", "build/r3.bin", true)
req.responseType = "arraybuffer"

req.onreadystatechange = function (e) {
    // 0=UNSENT, 1=OPEN, 2=HEADERS_RECEIVED, 3=LOADING, 4=DONE  
    if (req.readyState == 4) {
        if (req.status != 200) {
            queueRequestToJS("C_REQUEST_ALERT", req.statusText)
            return
        }

        var arraybuffer = req.response // Note: not req.responseText
        Module['emterpreterFile'] = arraybuffer

        importScripts('build/r3.js') // _init_c_pump(), _on_js_event()
    }  
}; 

req.send()


//=//// WORKER MESSAGE PUMP ////////////////////////////////////////////////=//
//
// This is the routine triggered by the GUI when it does queueEventToC().
//

onmessage = function (e) {
    var id = e.data[0]
    var str = e.data[1]
    console.log("JS Event => C: [" + id + "," + str + "]")

    if (id != 'JS_EVENT_DOM_CONTENT_LOADED') {
        //
        // _on_js_event() is responsible for freeing allocation (if not null)
        //
        _on_js_event(event_id_to_num_map[id], str && allocateUTF8(str))
        return
    }

    queueRequestToJS('C_REQUEST_OUTPUT', '\nExecuting Rebol boot code...')
    rebInit()

    queueRequestToJS('C_REQUEST_RESET')
    _repl()

    // The first time repl() yields, it will fall through to here to
    // return to the main loop.  But after that, it will be continued
    // by the `resume()` wrapper function that it was re-posted to run
    // with.  So there's really no way to get a result back from it.
    //
    // There's nothing particularly interesting about the first yield
    // vs any others that come later which you can't respond to, so don't
    // do anything special--just return.
}
