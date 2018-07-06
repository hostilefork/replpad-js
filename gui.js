//
// gui.js
//

var typing;
var repl;

// We want to start loading the C runtime as soon as possible, and in
// parallel to loading the DOM content.  But both have to be ready to
// run useful code.  Wait to send JS_EVENT_DOM_CONTENT_LOADED to the
// worker until it has sent us C_REQUEST_LOAD_DOM_CONTENT -and- the
// onDomContentLoaded trigger has happened on the GUI.
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
    if (id == 'JS_EVENT_DOM_CONTENT_LOADED')
        repl.innerHTML = null;
    pump.postMessage([id, str]); // argument will be e.data in onmessage(e)
}


// There is apparently no race condition by setting the onmessage after
// the pump has already been spawned.  No messages will be lost:
//
// https://stackoverflow.com/a/3416386/211160
//
pump.onmessage = function(e) {
    id = e.data[0];
    str = e.data[1];

    switch (id) {

    case 'C_REQUEST_LOAD_DOM_CONTENT':
        //
        // This will kick off the C code, so that it can run for a while
        // and then--when it decides to--post a request to the GUI
        // be processed.
        //
        if (dom_content_loaded) // onDomContentLoaded() already happened
            queueEventToC('JS_EVENT_DOM_CONTENT_LOADED');
        else {
            // wait to send event until onDomContentLoaded() happens
        }
        runtime_initialized = true;
        break;

    case 'C_REQUEST_OUTPUT': {
        repl.innerHTML += str + "<br>";
        queueEventToC('JS_EVENT_OUTPUT_DONE');
        break; }

    case 'C_REQUEST_INPUT': {
        typing.disabled = false;
        typing.style = null;
        typing.focus();
        break; } // JS_EVENT_GOT_INPUT will be sent later via onTypingEnter()

    case 'C_REQUEST_SLEEP': {
        //
        // !!! Needs way to have requests parameterized with integers, or
        // perhaps always strings will be used?
        //
        alert("C_REQUEST_SLEEP not implemented yet");
        break; }

    case 'C_REQUEST_QUIT': {
        alert("Process called js_exit()");
        break; }

    default: {
        alert("Unknown C_REQUEST:" + id);
        break; }
    }
}


function onTypingEnter() {
    //
    // As a sample visual change we might like to take care of before
    // calling back into C, just disable the typed input.  Turn it gray
    // to make it look disabled, then actually disable it.
    //
    typing.style = "color: grey; background-color: #F0F0F0;"; // looks
    typing.disabled = true; // behavior

    queueEventToC('JS_EVENT_GOT_INPUT', typing.value);
    typing.value = null;
}


document.addEventListener('DOMContentLoaded', function () {
    typing = document.getElementById('typing');
    repl = document.getElementById('repl');

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
document.onkeydown = function(evt) {
    evt = evt || window.event;
    var isEscape = false;
    if ("key" in evt)
        isEscape = (evt.key == "Escape" || evt.key == "Esc");
    else
        isEscape = (evt.keyCode == 27);
    if (isEscape)
        queueEventToC('JS_EVENT_HALTED');
};
