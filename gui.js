//
// gui.js
//
// Currently a kind-of-monolithic file for implementing all the GUI services
// of the #replpad.  Obviously as this becomes more mature it will have to
// be broken up into more files.  Specific guidance on what the rules are here
// (use jQuery or not?) are going to come into play as to what is "good" or
// "bad" methodology.  For now it is just "copypasta" to see what is doable
// and what is not in today's browsers, sans jQuery, in as light a fashion
// as possible.
//

'use strict'; // <-- FIRST statement! https://stackoverflow.com/q/1335851

// We want to start loading the C runtime as soon as possible, and in
// parallel to loading the DOM content.  But both have to be ready to
// run useful code.  Wait to send JS_EVENT_DOM_CONTENT_LOADED to the
// worker until it has sent us C_REQUEST_LOAD_DOM_CONTENT -and- the
// 'DOMContentLoaded' trigger has happened on the GUI.
//
var dom_content_loaded = false;
var runtime_initialized = false;


var replpad;

// As a proof of concept, the "magic undo" is being tested, to see if that
// Ren Garden feature can be carried over to the browser.
//
var input = null;
var first_input = true;
var onInputKeyDown;
var placeCaretAtEnd;

// When the C code requests to sleep, it should still be interrupted by a
// halt.  In order to do this, the outstanding timer request for the sleep
// has to be clearTimeout() called on it.  This saves the ID.
//
var sleep_timeout_id = null;

var RowClick;

// For security reasons, web pages can't read whatever you happened to write
// to your computer's local clipboard...as that would allow snooping.  But
// it can be simulated to make a functional right click menu to copy and
// paste within the page, so long as the source data was on the page itself.
//
// !!! There may be a way to set permissions on this, but Chrome only allows
// paste in extensions, if you've enabled particular things.
//
var clipboard = null;
var OnMenuCut;
var OnMenuPaste;
var OnMenuCopy;


//=//// PUMP FOR HANDLING WORKER MESSAGES //////////////////////////////////=//

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
        // Just as a test, try throwing in some stuff that isn't ordinary
        // console output before the prompt.
        //
        if (param == "&gt;&gt; ") {
            replpad.innerHTML +=
                "<div class='note'><p>" +
                "<a href='https://forum.rebol.info/t/690'>Beta/One</a>" +
                " should have its tutorial steps inline in the console," +
                " talking you through and observing your progress." +
                "</p></div>";
        }

        // We want to break the code into divs at each line boundary.
        replpad.innerHTML += "<div class='line'>" + param + "</div>";
        
        // !!! scrollIntoView() is supposedly experimental.
        replpad.lastChild.scrollIntoView();

        queueEventToC('JS_EVENT_OUTPUT_DONE');
        break; }

    case 'C_REQUEST_INPUT': {
        //
        // !!! It seems that an empty span with contenteditable will stick
        // the cursor to the beginning of the previous span.  :-/  This does
        // not happen when the .input CSS class has `display: inline-block;`,
        // but then that prevents the span from flowing naturally along with
        // the previous spans...it jumps to its own line if it's too long.
        // Putting a (Z)ero (W)idth (N)on-(J)oiner in a preceding span seems
        // to address the issue, so the cursor will jump to that when the
        // input span is empty.
        //
        replpad.lastChild.innerHTML += "<span>&zwnj;</span>";

        replpad.lastChild.innerHTML += "<span class='input'></span>";
        input = replpad.lastChild.lastChild;
        input.onkeydown = onInputKeyDown;
        input.contentEditable = true;

        // These don't seem to work from CSS, so they have to be assigned from
        // the JS directly like this.  They're not completely standard, but
        // disable them all just for the best chance of having no behavior.
        //
        input.spellcheck = false;
        input.autocomplete = "off";
        input.autocorrect = "off";
        input.autocapitalize = "off";

        if (first_input) {
            input.classList.add("first-input"); // stop magic-undo from undoing
            first_input = false;
        }

        input.focus();
        placeCaretAtEnd(input);
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


document.addEventListener('DOMContentLoaded', function () { //...don't indent

//=//// DOMContentLoaded Handled ///////////////////////////////////////////=//

dom_content_loaded = true;
if (runtime_initialized) // runtime initialized first
    queueEventToC('JS_EVENT_DOM_CONTENT_LOADED');
else {
    // wait to send until C_REQUEST_LOAD_DOM_CONTENT
}

Split(['#replpad', '#right'], {
    sizes: [75, 25],
    minSize: 200
});

// !!! The TableResize component is flaky and doesn't seem to work here, but
// there does not seem to be much in the way of viable non-jQuery codebases
// that do this.  So taking ownership and cleaning it up is one option, or
// just biting the bullet and including jQuery is another...but the one table
// resize widget that worked wasn't just jQuery but it involved a build
// process... so that was a double-whammy.  Review the issue as the ground
// rules for this evolve.
//
new TableResize(
    document.getElementById('example'),
    {distance: 100, minWidth: 60, restoreState: true, fixed: true}
);

replpad = document.getElementById('replpad');
replpad.onclick = OnClickReplpad;


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
            if (span.classList && span.classList.contains("input")) {
                input = span;
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
    alert("Magic Undo failure, didn't set input");
    input = null;
}


onInputKeyDown = function(e) {
    e = e || window.event; // !!! "ensure not null"... necessary? :-/

    if (!input || !input.classList.contains("input")) {
        alert("key down but span class isn't input");
        return;
    }

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
        input.classList.add("magic-undo");

        var observer = new MutationObserver(function (mutations) {
            var changed = false;
            mutations.forEach(function (m) {
                // "You can check the actual changes here"
            });
            input.classList.remove("magic-undo");
            observer.disconnect();
        });
        observer.observe(
            input,
            {subtree: true, childList: true, characterData: true}
        );

        setTimeout(function() {
            if (input.classList.contains("magic-undo")) {
                if (input.classList.contains("first-input"))
                    input.innerHTML = null;
                else {
                    input.parentNode.removeChild(input); // make search easier
                    // don't null out input, it should wind up set
                    input = "<magic-undo-should-reset>";
                    MagicUndo(); // go backwards to search for last input span
                }
            }
        }, 0);
    }

    switch (e.key) {

    case 'Enter': {
        input.contentEditable = false;
        input.onkeydown = null;
        queueEventToC('JS_EVENT_GOT_INPUT', input.innerText);
        e.preventDefault(); // Allowing enter puts a <br>
        input = null;
        break; }
    }
}


function OnClickReplpad(e) {
    e = e || window.event; // !!! "ensure not null"... necessary? :-/

    // https://stackoverflow.com/q/31982407
    if (window.getSelection().toString())
        return; // selections aren't clicks

    // https://stackoverflow.com/a/9183467
    if (e.target !== this) // make sure it's replpad, not a child element
        return;

    console.log("It's the target");
    if (!input) // if there's no C_REQUEST_INPUT in progress, do nothing
        return;

    input.focus();
    placeCaretAtEnd(input);
}

window.onmousemove = function() {
    AbandonEscapeMode();
}

function AbandonEscapeMode() {
    if (!replpad.classList.contains('escaped')) 
        return;

    replpad.classList.remove('escaped');

    if (input) {
        input.focus();
        placeCaretAtEnd(input);
    }
}

// In web browsers, people generally expect Ctrl-C to copy text.  So there
// needs to be another keyboard shortcut for stopping evaluation.  Yet the
// ESCAPE key has a number of "light" meanings--like clearing the selection,
// or dismissing a popup.
//
// This is an attempt to use the ESCAPE key creatively to enter "escape mode",
// as opposed to doing necessarily something drastic just by virtue of
// pressing the button.  The mode would then allow pressing any other key
// that is not escape to do the cancellation/clearing.
//
// !!! The idea is a work in progress.
//
function OnEscape() {
    //
    // As a first "gentle" step for escape, clear the selection.  In this,
    // include hiding the insertion cursor and the mouse cursor.  The mouse
    // cursor will come back on a key or mouse movement, but this gives
    // feedback that *something happened* from the escape--which may lead
    // people to hold off pressing it again if they didn't mean it.
    //
    // https://stackoverflow.com/a/3169849
    //
    if (
        !(input && input.innerText == "")
        && !replpad.classList.contains('escaped')
    ){
        console.log("adding escaped");
        replpad.classList.add('escaped');
        if (window.getSelection().empty) {  // Chrome
            window.getSelection().empty();
        }
        else if (window.getSelection().removeAllRanges)  // Firefox
            window.getSelection().removeAllRanges();
        return;
    }

    AbandonEscapeMode();

    // Next, if there's an input, clear that.  But since it might be
    // easy to type on accident, be sure it gets into the undo queue by
    // using `document.execCommand`
    //
    // https://stackoverflow.com/a/28217619
    //
    if (input) {
        input.innerHTML = null;
        return;
    }

    console.log("queueing halt");

    if (sleep_timeout_id)
        clearTimeout(sleep_timeout_id); // forget JS_EVENT_SLEEP_COMPLETE

    queueEventToC('JS_EVENT_HALTED');
}


document.onkeydown = function(e) {
    e = e || window.event;

    // https://stackoverflow.com/a/3369743/211160
    var isEscape = false;
    if ("key" in e)
        isEscape = (e.key == "Escape" || e.key == "Esc");
    else
        isEscape = (e.keyCode == 27);

    if (isEscape) {
        OnEscape();
        return;
    }

    AbandonEscapeMode();
};


// https://stackoverflow.com/a/4238971/211160
//
placeCaretAtEnd = function(el) {
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

// https://stackoverflow.com/a/3997896
//
function replaceSelectedText(replacementText) {
    var sel, range;
    if (window.getSelection) {
        sel = window.getSelection();
        if (sel.rangeCount) {
            range = sel.getRangeAt(0);
            range.deleteContents();
            range.insertNode(document.createTextNode(replacementText));
        }
    } else if (document.selection && document.selection.createRange) {
        range = document.selection.createRange();
        range.text = replacementText;
    }
}

//=//// ROW CLICK WITH MULTI-SELECT ////////////////////////////////////////=//
//
// Taken from:
// https://stackoverflow.com/a/17966381
//

var lastSelectedRow;
var watchlist = document.getElementById('watchlist');
console.log(watchlist);
var trs = document.getElementById('watchlist').tBodies[0].getElementsByTagName('tr');
console.log(trs);

// disable text selection
/*document.onselectstart = function() {
    return false;
}*/

RowClick = function(currenttr, lock) {
    console.log("rowclicky");

    if (window.event.ctrlKey) {
        toggleRow(currenttr);
    }
    
    if (window.event.button === 0) {
        if (!window.event.ctrlKey && !window.event.shiftKey) {
            clearAll();
            toggleRow(currenttr);
        }
    
        if (window.event.shiftKey) {
            selectRowsBetweenIndexes([lastSelectedRow.rowIndex, currenttr.rowIndex])
        }
    }
}

function toggleRow(row) {
    row.className = row.className == 'selected' ? '' : 'selected';
    lastSelectedRow = row;
}

function selectRowsBetweenIndexes(indexes) {
    indexes.sort(function(a, b) {
        return a - b;
    });

    for (var i = indexes[0]; i <= indexes[1]; i++) {
        trs[i-1].className = 'selected';
    }
}

function clearAll() {
    for (var i = 0; i < trs.length; i++) {
        trs[i].className = '';
    }
}


//=//// RIGHT-CLICK MENU ///////////////////////////////////////////////////=//
//
// Taken from:
// https://stackoverflow.com/a/35730445/211160
//

var i = document.getElementById("menu").style;
document.addEventListener('contextmenu', function(e) {
    var posX = e.clientX;
    var posY = e.clientY;
    menu(posX, posY);
    e.preventDefault();
}, false);

document.addEventListener('click', function(e) {
    i.opacity = "0";
    setTimeout(function() {
      i.visibility = "hidden";
    }, 501);
}, false);

function menu(x, y) {
    i.top = y + "px";
    i.left = x + "px";
    i.visibility = "visible";
    i.opacity = "1";
}

OnMenuCut = function() {
    clipboard = window.getSelection().toString();
    document.execCommand('cut');
}

OnMenuCopy = function() {
    clipboard = window.getSelection().toString();
    document.execCommand('copy');
}

OnMenuPaste = function() {
    if (!clipboard)
        alert("For security reasons, paste is only allowed from within page");
    else
        replaceSelectedText(clipboard);
}

//=//// END `DOMContentLoaded` HANDLER /////////////////////////////////////=//

}); // lame to indent nearly this entire file, just to put it in the handler
