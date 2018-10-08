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
    //
    // For errors like:
    //
    //    "table import 1 has a larger maximum size 37c than the module's
    //     declared maximum 890"
    //
    // The total memory must be bumped up.  These large sizes occur in debug
    // builds with lots of assertions and symbol tables.  Note that the size
    // may appear smaller than the maximum in the error message, as previous
    // tables (e.g. table import 0 in the case above) can consume memory.
    //
    // !!! Messing with this setting never seemed to help.
    //
 /* TOTAL_MEMORY: 16 * 1024 * 1024, */

    locateFile: function(s) {
        //
        // function for finding %libr3.wasm and %libr3.bytecode
        // (Note: memoryInitializerPrefixURL for bytecode was deprecated)
        //
        // https://stackoverflow.com/q/46332699
        //
        return '../ren-c/make/' + s
    },

    // This is a callback that happens sometime after you load the emscripten
    // library (%libr3.js in this case).  It's turned into a promise instead
    // of a callback.  Sanity check it's not used prior by making it a string.
    //
    onRuntimeInitialized: "<mutated from a callback into a Promise>",

    // If you use the emterpreter, it balloons up the size of the javascript
    // unless you break the emterpreter bytecode out into a separate file.
    // You have to get the data into the Module['emterpreterFile'] before
    // trying to load the emscripten'd code.
    //
    emterpreterFile: "<filled in via fetch() of libr3.bytecode>"

    // The rest of these fields will be filled in by the boilerplate of the
    // Emterpreter.js file (it looks for an existing Module and adds to it,
    // but this is also how you parameterize options.)
}


// The GUI has to be initialized (DOM initialization, etc.) before we can
// even use HTML to show status text like "Running Mezzanine", etc.  The GUI
// will post a message to the worker's pump when it is ready, which will in
// turn call onGuiInitialized().  This converts that into a promise so it
// can be used in a clearer-to-read linear .then() sequence.
//
// https://stackoverflow.com/a/22519785
//
var onGuiInitialized
var gui_init_promise = new Promise(function(resolve, reject) {
    onGuiInitialized = resolve
})


// The initialization is written as a series of promises for simplicity.
//
// !!! Review use of Promise.all() for steps which could be run in parallel.
//
fetch("../ren-c/make/libr3.bytecode").then(function(response) {

    // https://www.tjvantoll.com/2015/09/13/fetch-and-errors/
    if (!response.ok)
        throw Error(response.statusText) // handled by .catch() below

    return response.arrayBuffer() // arrayBuffer() method is a promise

}).then(function(buffer) {

    // When emscripten calls onRuntimeInitialized, it causes this promise to
    // resolve (used to trigger the next .then() step)
    //
    // https://stackoverflow.com/a/22519785
    //
    var runtime_init_promise = new Promise(function(resolve, reject) {
        Module.onRuntimeInitialized = resolve
    })

    Module.emterpreterFile = buffer // must load before emterpret()-ing
    importScripts('../ren-c/make/libr3.js') // synchronous call

    return runtime_init_promise

}).then(function() { // emscripten's onRuntimeInitialized() has no args

    _init_c_pump() // Light initialization w/no status message?  Needed?

    // It's almost certain that the runtime didn't initialize before the DOM
    // and GUI elements were ready.  But just to keep things on the up and up,
    // we don't start sending HTML-based status messages until we're sure.
    //
    // So GUI will wait until it receives both its 'DOMContentLoaded' callback
    // and this C_REQUEST_LOAD_DOM_CONTENT from the worker, then it signals
    // back to the worker with JS_EVENT_DOM_CONTENT_LOADED--which is when
    // the GUI is fully ready to service requests.
    //
    queueRequestToJS('C_REQUEST_LOAD_DOM_CONTENT') // likely loaded by now

    return gui_init_promise

}).then(function() { // our onGuiInitialized() message currently has no args

    queueRequestToJS('C_REQUEST_OUTPUT', '\nExecuting Rebol boot code...')
    rebStartup()

    queueRequestToJS('C_REQUEST_OUTPUT', '\nInitializing extensions...')
    var extensions = rebBuiltinExtensions() // e.g. JS-NATIVE extension
    rebElide(
        "for-each [init quit]", extensions,
            "[load-extension ensure handle! init]"
    )

    queueRequestToJS('C_REQUEST_OUTPUT', '\nFetching %replpad.reb...')
    return fetch('replpad.reb') // contains JS-NATIVE declarations

}).then(function(response) {

    // https://www.tjvantoll.com/2015/09/13/fetch-and-errors/
    if (!response.ok)
        throw Error(response.statusText) // handled by .catch() below

    return response.text() // text() method also a promise ("USVString")

}).then(function(text) {

    queueRequestToJS('C_REQUEST_OUTPUT', '\nRunning %replpad.reb...')
    rebElide(text)

    queueRequestToJS('C_REQUEST_RESET')

    // !!! Note that anything we try to call at this point would begin the
    // suspend of the stack, and hence inhibit any emscripten_sleep_with_yield
    // calls following it.  The whole thing is getting studied now.
    //
 /* rebElide("print {This would cause async suspend, screw up the repl()}") */

    _repl()

    // The first time repl() yields, it will fall through to here to
    // return to the main loop.  But after that, it will be continued
    // by the `resume()` wrapper function that it was re-posted to run
    // with.  So there's really no way to get a result back from it.
    //
    // There's nothing particularly interesting about the first yield
    // vs any others that come later which you can't respond to, so don't
    // do anything special--just return.

}).catch(function(error) {

    queueRequestToJS('C_REQUEST_ALERT', error.toString())
})


//=//// WORKER MESSAGE PUMP ////////////////////////////////////////////////=//
//
// This is the routine triggered by the GUI when it does queueEventToC().
//

onmessage = function (e) {
    var id = e.data[0]
    var str = e.data[1]
    console.log("JS Event => C: [" + id + "," + str + "]")

    if (id == 'JS_EVENT_DOM_CONTENT_LOADED') {
        onGuiInitialized() // resolves gui_init_promise above, triggers then()
        return
    }

    // _on_js_event() is responsible for freeing allocation (if not null)
    //
    _on_js_event(event_id_to_num_map[id], str && allocateUTF8(str))
}
