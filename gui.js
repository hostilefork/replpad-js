//
// gui.js
//

'use strict'; // <-- FIRST statement! https://stackoverflow.com/q/1335851

var replpad;

// As a proof of concept, the "magic undo" is being tested, to see if that
// Ren Garden feature can be carried over to the browser.
//
var first_input = true;

// When the C code requests to sleep, it should still be interrupted by a
// halt.  In order to do this, the outstanding timer request for the sleep
// has to be clearTimeout() called on it.  This saves the ID.
//
var sleep_timeout_id = null;

// We want to start loading the C runtime as soon as possible, and in
// parallel to loading the DOM content.  But both have to be ready to
// run useful code.  Wait to send JS_EVENT_DOM_CONTENT_LOADED to the
// worker until it has sent us C_REQUEST_LOAD_DOM_CONTENT -and- the
// 'DOMContentLoaded' trigger has happened on the GUI.
//
var dom_content_loaded = false;
var runtime_initialized = false;


// `pump` was created with `new Worker('worker.js')` in index.html, so that it
// could start loading as soon as possible.  The only way to communicate with
// a web worker is by posting messages to it, and having it post messages
// back--which are received by the pump.onmessage handler.
//
// This wraps pump.postMessage to make what the pump is *for* more clear.
//
function queueEventToC(id, str) { // str `undefined` if not passed in
    if (str === undefined)
        str = null; // although `undefined == null`, canonize to null
    
    // Some stub "loading" text was in the console area.  This would be changed
    // to take down whatever loading animation or more sophisticated thing.
    //
    if (id == 'JS_EVENT_DOM_CONTENT_LOADED')
        replpad.innerHTML = null;

    pump.postMessage([id, str]); // argument will be e.data in onmessage(e)
}


// There is apparently no race condition by setting the onmessage after
// the pump has already been spawned.  No messages will be lost:
//
// https://stackoverflow.com/a/3416386/211160
//
pump.onmessage = function(e) {
    var id = e.data[0];
    var param = e.data[1]; // can be any data type

    switch (id) {

    case 'C_REQUEST_LOAD_DOM_CONTENT':
        //
        // This will kick off the C code, so that it can run for a while
        // and then--when it decides to--post a request to the GUI
        // be processed.
        //
        if (dom_content_loaded) // 'DOMContentLoaded' already happened
            queueEventToC('JS_EVENT_DOM_CONTENT_LOADED');
        else {
            // wait to send event until 'DOMContentLoaded' happens
        }
        runtime_initialized = true;
        break;

    case 'C_REQUEST_OUTPUT': {
        //
        // We want to break the code into divs at each line boundary.
        replpad.innerHTML += "<div class='line'>" + param + "</div>";
        queueEventToC('JS_EVENT_OUTPUT_DONE');
        break; }

    case 'C_REQUEST_INPUT': {
        replpad.lastChild.innerHTML += "<span class='input'>&nbsp;</span>";
        var span = replpad.lastChild.lastChild;
        span.onkeydown = onInputKeyDown;
        span.contentEditable = true;

        // These don't seem to work from CSS, so they have to be assigned from
        // the JS directly like this.  They're not completely standard, but
        // disable them all just for the best chance of having no behavior.
        //
        span.spellcheck = false;
        span.autocomplete = "off";
        span.autocorrect = "off";
        span.autocapitalize = "off";

        if (first_input) {
            span.classList.add("first-input"); // stop magic-undo from undoing
            first_input = false;
        }

        span.focus();
        placeCaretAtEnd(span);
        break; } // JS_EVENT_GOT_INPUT will be sent later via onTypingEnter()

    case 'C_REQUEST_SLEEP': {
        //
        // This is distinct from emscripten_sleep_with_yield() because of the
        // need to be interrupted by halts.
        //
        sleep_timeout_id = setTimeout(function () {
            queueEventToC('JS_EVENT_SLEEP_DONE');
        }, param);
        break; }

    case 'C_REQUEST_QUIT': {
        alert("Process called js_exit()");
        break; }

    default: {
        alert("Unknown C_REQUEST:" + id);
        break; }
    }
}


// MagicUndo is a feature from Ren Garden.  It would notice when the undo list
// was empty for console input, and if it was, then undo would rewind and undo
// the console output from the previous command...putting your selection back
// to where it was.
//
function MagicUndo() {
    var div = replpad.lastChild;
    while (div) {
        var span = div.lastChild;
        while (span) {
            console.log(span);
            if (span.classList && span.classList.contains("input")) {
                span.contentEditable = true;
                span.onkeydown = onInputKeyDown;
                span.focus();
                placeCaretAtEnd(span);
                return;
            }
            div.removeChild(span);
            span = div.lastChild;
        }
        replpad.removeChild(div);
        div = replpad.lastChild;
    }
}


function onInputKeyDown(e) {
    e = e || window.event; // !!! "ensure not null"... necessary? :-/

    var span = replpad.lastChild.lastChild;
    if (!span.classList.contains("input"))
        alert("key down but span class isn't input");

    // The trick for "magic undo" is to notice when Ctrl-Z is a no-op, and
    // assume that means the undo queue is exhausted...so kill all output
    // since the last input, and restore the selection and position of that
    // last input.  Being able to notice the undo queue is exhausted depends
    // on the browser supporting MutationObservers:
    //
    // https://stackoverflow.com/q/24344022/211160
    //
    // So basically, set up a callback which will do the magic undo *unless*
    // the mutation observer says there was no mutation.
    //
    if ((e.which == 90 || e.keyCode == 90) && e.ctrlKey) {
        span.classList.add("magic-undo");

        var observer = new MutationObserver(function (mutations) {
            var changed = false;
            mutations.forEach(function (m) {
                // "You can check the actual changes here"
            });
            span.classList.remove("magic-undo");
            observer.disconnect();
        });
        observer.observe(
            span,
            {subtree: true, childList: true, characterData: true}
        );

        setTimeout(function() {
            if (span.classList.contains("magic-undo")) {
                if (span.classList.contains("first-input"))
                    span.innerHTML = null;
                else {
                    span.parentNode.removeChild(span); // make search easier
                    MagicUndo(); // go backwards to search for last input span
                }
            }
        }, 0);
    }

    //
    // As a sample visual change we might like to take care of before
    // calling back into C, just disable the typed input.  Turn it gray
    // to make it look disabled, then actually disable it.
    //
    switch (e.key) {

    case 'Enter': {
        var span = replpad.lastChild.lastChild;
        span.contentEditable = false;
        span.onkeydown = null;
        queueEventToC('JS_EVENT_GOT_INPUT', span.innerText);
        e.preventDefault(); // Allowing enter puts a <br>
        break; }
    }
}


document.addEventListener('DOMContentLoaded', function () {
    replpad = document.getElementById('replpad');

    if (runtime_initialized) // runtime initialized first
        queueEventToC('JS_EVENT_DOM_CONTENT_LOADED');
    else {
        // wait to send until C_REQUEST_LOAD_DOM_CONTENT
    }
    dom_content_loaded = true;
});


// ESCAPE key requests a halt.  While it would be technically possible
// to use a custom emterpret() function and just throw away the re-entry
// allowing escape from even an uncooperative C routine, that could
// pull the rug out of something that had had just done a malloc().
// Hence it has to be cooperative and wait for the PG_Halted to be
// polled, until some deeper magic comes about.
//
// https://stackoverflow.com/a/3369743/211160
//
document.onkeydown = function(e) {
    e = e || window.event;
    var isEscape = false;
    if ("key" in e)
        isEscape = (e.key == "Escape" || e.key == "Esc");
    else
        isEscape = (e.keyCode == 27);
    if (isEscape) {
        if (sleep_timeout_id)
            clearTimeout(sleep_timeout_id); // forget JS_EVENT_SLEEP_COMPLETE
        queueEventToC('JS_EVENT_HALTED');
    }
};


// https://stackoverflow.com/a/4238971/211160
//
function placeCaretAtEnd(el) {
    el.focus();
    if (typeof window.getSelection != "undefined"
            && typeof document.createRange != "undefined") {
        var range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    } else if (typeof document.body.createTextRange != "undefined") {
        var textRange = document.body.createTextRange();
        textRange.moveToElementText(el);
        textRange.collapse(false);
        textRange.select();
    }
}
