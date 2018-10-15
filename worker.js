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


function queueRequestToGUI(id, str) {
    if (str === undefined)
        str = null // although `undefined == null`, canonize to null

    // This will eventually run `pump.onmessage` in the code that instantiated
    // the pump worker.  So if that code said:
    //
    //     var pump = Worker('worker.js');
    //     pump.onmessage(function (e) {...});
    //
    // ...this argument to postMessage is the `e.data` that code will receive.
    //
    postMessage([id, str])
}


//=//// WORKER MESSAGE PUMP ////////////////////////////////////////////////=//
//
// This is the routine triggered by the GUI when it does pump.postMessage()
//

onmessage = function (e) {
    var id = e.data[0]
    var str = e.data[1]

}
