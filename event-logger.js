//
// File: %event-logger.js
// Summary: "Event Logging Helper"
// Project: "JavaScript REPLpad for Ren-C branch of Rebol 3"
// Homepage: https://github.com/hostilefork/replpad-js/
//
//=////////////////////////////////////////////////////////////////////////=//
//
// At time of writing this file is basically just a routine from Stack Overflow
// and as such is under the CC BY-SA 4.0 license.
//
//=////////////////////////////////////////////////////////////////////////=//
//
// Using the Android debugger tools via Chrome/Edge/Firefox is actually not
// that hard, where you can set breakpoints and look at things.  But this was
// a primitive attempt to make event logging that the ReplPad could spit out.
//
// It clutters up the already-cluttered gui.js file, so it's being put aside.
//
//=//// USAGE //////////////////////////////////////////////////////////////=//
//
// If you have an event hander with an event `e` to log, just say:
//
//     window.keylog.push(stringify_object(e, 1))
//
// Then from the console run KEYLOG.
//

'use strict'  // <-- FIRST statement! https://stackoverflow.com/q/1335851

window.keylog = []  // expose to the interpreter on global window object

// JSON.stringify won't work on Event objects, which is why this is needed.
//
// https://stackoverflow.com/a/58416333
//
function stringify_object(object, depth=0, max_depth=2) {
    // change max_depth to see more levels, for a touch event, 2 is good
    if (depth > max_depth)
        return 'Object';

    const obj = {};
    for (let key in object) {
        let value = object[key];
        if (value instanceof Node)
            // specify which properties you want to see from the node
            value = {id: value.id};
        else if (value instanceof Window)
            value = 'Window';
        else if (value instanceof Object)
            value = stringify_object(value, depth+1, max_depth);

        obj[key] = value;
    }

    return depth ? obj : JSON.stringify(obj);
}


/*
 * REBOL PART
 */

/*
    try-get-one-keylog: js-awaiter [] --[
        if (window.keylog.length == 0)
            return null

        return reb.Text(JSON.stringify(window.keylog.shift()))
    ]--

    export keylog: func [return: []] [
        let key
        while [key: try-get-one-keylog] [
            print mold key
            print newline
        ]
    ]

    export a: does [print ["you said:" ask text!], keylog]
*/
