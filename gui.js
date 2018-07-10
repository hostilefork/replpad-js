//
// File: %gui.js
// Summary: "GUI Thread Services"
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
// This is currently a kind-of-monolithic file for implementing all the GUI
// services of the #replpad.  As this becomes more mature it will have to
// be broken up into more files.  Specific guidance on what the rules are here
// (use jQuery or not?) are going to come into play as to what is "good" or
// "bad" methodology.  For now it is just "copypasta" to see what is doable
// and what is not in today's browsers, sans jQuery, in as light a fashion
// as possible.
//

'use strict' // <-- FIRST statement! https://stackoverflow.com/q/1335851

// Lets us do something like jQuery $("<div class='foo'>content</div>").
// load("&lt;"") gives `<` while document.createTextNode("&lt;") gives `&lt;`
//
var loader_temp = document.createElement("div")
function load(html) {
    loader_temp.innerHTML = html;
    var loaded = loader_temp.firstChild;
    loader_temp.removeChild(loaded) // https://trello.com/c/64iJBijV
    if (loader_temp.firstChild) {
        alert("load() created more than one element" + loader_temp.innerHTML)
        loader_temp.innerHTML = "" // https://trello.com/c/1P2jwTmZ
    }
    return loaded
}


// We want to start loading the C runtime as soon as possible, and in
// parallel to loading the DOM content.  But both have to be ready to
// run useful code.  Wait to send JS_EVENT_DOM_CONTENT_LOADED to the
// worker until it has sent us C_REQUEST_LOAD_DOM_CONTENT -and- the
// 'DOMContentLoaded' trigger has happened on the GUI.
//
var dom_content_loaded = false
var runtime_initialized = false


var replpad

// As a proof of concept, the "magic undo" is being tested, to see if that
// Ren Garden feature can be carried over to the browser.
//
var input = null
var first_input = null
var onInputKeyDown
var placeCaretAtEnd

// When the C code requests to sleep, it should still be interrupted by a
// halt.  In order to do this, the outstanding timer request for the sleep
// has to be clearTimeout() called on it.  This saves the ID.
//
var sleep_timeout_id = null

var RowClick

// For security reasons, web pages can't read whatever you happened to write
// to your computer's local clipboard...as that would allow snooping.  But
// it can be simulated to make a functional right click menu to copy and
// paste within the page, so long as the source data was on the page itself.
//
// !!! There may be a way to set permissions on this, but Chrome only allows
// paste in extensions, if you've enabled particular things.
//
var clipboard = null
var undo_escape_input = null
var OnMenuCut
var OnMenuPaste
var OnMenuCopy


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
        str = null // although `undefined == null`, canonize to null
    
    // Some stub "loading" text was in the console area.  This would be changed
    // to take down whatever loading animation or more sophisticated thing.
    //
    if (id == 'JS_EVENT_DOM_CONTENT_LOADED')
        replpad.appendChild(load(
            "<div class='line'>DOMContentLoaded event received...</div>"
        ))

    pump.postMessage([id, str]) // argument will be e.data in onmessage(e)
}

function ActivateInput(el) {
    el.onkeydown = onInputKeyDown
    el.contentEditable = true

    // These don't seem to work from CSS, so they have to be assigned from
    // the JS directly like this.  They're not completely standard, but
    // disable them all just for the best chance of having no behavior.
    //
    el.spellcheck = false
    el.autocomplete = "off"
    el.autocorrect = "off"
    el.autocapitalize = "off"

    if (!first_input)
        first_input = el // will stop magic-undo from undoing

    el.focus()
    placeCaretAtEnd(el)

    input = el
}

function DeactivateInput() {
    var el = input
    input = null
    el.onkeydown = null
    el.contentEditable = false
}

// There is apparently no race condition by setting the onmessage after
// the pump has already been spawned.  No messages will be lost:
//
// https://stackoverflow.com/a/3416386/211160
//
pump.onmessage = function(e) {
    var id = e.data[0]
    var param = e.data[1] // can be any data type

    switch (id) {

    case 'C_REQUEST_LOAD_DOM_CONTENT':
        //
        // This will kick off the C code, so that it can run for a while
        // and then--when it decides to--post a request to the GUI
        // be processed.
        //
        if (dom_content_loaded) // 'DOMContentLoaded' already happened
            queueEventToC('JS_EVENT_DOM_CONTENT_LOADED')
        else {
            // wait to send event until 'DOMContentLoaded' happens
        }
        runtime_initialized = true
        break

    case 'C_REQUEST_ALERT':
        //
        // Used for errors early in initialization, when output to the
        // console may not work.
        //
        alert(param)
        break

    case 'C_REQUEST_RESET': {
        //
        // The output strategy is to merge content into the last div, until
        // a newline is seen.  Kick it off with an empty div, so there's
        // always somewhere the first output can stick to.
        //
        replpad.innerHTML = "<div class='line'>&zwnj;</div>"
        break }

    case 'C_REQUEST_OUTPUT': {
        //
        // Just as a test, try throwing in some stuff that isn't ordinary
        // console output before the prompt.
        //
/*        if (param == "&gt;&gt; ") {
            var note = load("<div class='note'><p>"
                + "<a href='https://forum.rebol.info/t/690'>Beta/One</a>"
                + " should have its tutorial steps inline in the console,"
                + " talking you through and observing your progress."
                + "</p><div>"
            replpad.appendChild(note)
        }*/

        var line = replpad.lastChild

        // Split string into pieces.  Note that splitting a string of just "\n"
        // will give ["", ""].
        //
        // Each newline means making a new div, but if there's no newline (e.g.
        // only "one piece") then no divs will be added.
        //
        var pieces = param.split("\n")
        line.innerHTML += pieces.shift() // shift() takes first element
        while (pieces.length)
            replpad.appendChild(
                load("<div class='line'>&zwnj;" + pieces.shift() + "</div>")
            )

        // !!! scrollIntoView() is supposedly experimental.
        replpad.lastChild.scrollIntoView()

        queueEventToC('JS_EVENT_OUTPUT_DONE')
        break }

    case 'C_REQUEST_INPUT': {
        //
        // !!! It seems that an empty div with contenteditable will stick
        // the cursor to the beginning of the previous div.  :-/  This does
        // not happen when the .input CSS class has `display: inline-block;`,
        // but then that prevents the div from flowing naturally along with
        // the previous divs...it jumps to its own line if it's too long.
        // Putting a (Z)ero (W)idth (N)on-(J)oiner before it seems to solve
        // the issue, so the cursor will jump to that when the input is empty.
        //
        replpad.lastChild.appendChild(load("&zwnj;"))

        var new_input = load("<div class='input'></div>")
        replpad.lastChild.appendChild(new_input)

        ActivateInput(new_input)
        break } // JS_EVENT_GOT_INPUT will be sent later via onTypingEnter()

    case 'C_REQUEST_SLEEP': {
        //
        // This is distinct from emscripten_sleep_with_yield() because of the
        // need to be interrupted by halts.
        //
        sleep_timeout_id = setTimeout(function () {
            queueEventToC('JS_EVENT_SLEEP_DONE')
        }, param)
        break }

    case 'C_REQUEST_QUIT': {
        alert("Process called js_exit()")
        break }

    default: {
        alert("Unknown C_REQUEST:" + id)
        break }
    }
}


document.addEventListener('DOMContentLoaded', function () { //...don't indent

//=//// DOMContentLoaded Handled ///////////////////////////////////////////=//

dom_content_loaded = true
if (runtime_initialized) // runtime initialized first
    queueEventToC('JS_EVENT_DOM_CONTENT_LOADED')
else {
    // wait to send until C_REQUEST_LOAD_DOM_CONTENT
}

Split(['#replpad', '#right'], {
    sizes: [75, 25],
    minSize: 200
})

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
)

replpad = document.getElementById('replpad')
replpad.onclick = OnClickReplPad


// MagicUndo is a feature from Ren Garden.  It would notice when the undo list
// was empty for console input, and if it was, then undo would rewind and undo
// the console output from the previous command...putting your selection back
// to where it was.
//
function MagicUndo() {
    var div = replpad.lastChild
    while (div) {
        var child = div.lastChild
        while (child) {
            if (child.classList && child.classList.contains("input")) {
                ActivateInput(child)
                return
            }
            div.removeChild(child)
            child = div.lastChild
        }
        replpad.removeChild(div)
        div = replpad.lastChild
    }
    alert("Magic Undo failure, didn't set input")
    input = null
}

function CollapseMultiline() {
    var arrow = input.previousSibling
    arrow.remove() // scrubs it completely, unlike .detach()
    input.classList.remove("multiline")
}

onInputKeyDown = function(e) {
    e = e || window.event // !!! "ensure not null"... necessary? :-/

    if (!input || !input.classList.contains("input")) {
        alert("key down but div class isn't input")
        return
    }

    if (e.key == 'Enter' || e.keycode == 13) { // !!! 13 is enter, standard??

        // https://stackoverflow.com/a/6015906
        if (e.shiftKey && !input.classList.contains("multiline")) {
            //
            // SHIFT-ENTER transitions into multiline, but it's too commonly
            // used to inject plain newlines into submittable-data to be
            // allowed to do anything else but add a normal line once you
            // are in the multiline mode.  Hence, CTRL-ENTER submits, and
            // we only toggle multiline *on* from shift enter.  Escape can
            // be used to get out of multiline.
            //
            var arrow = load(
                "<span class='multiline-arrow'>[Ctrl-Enter to evaluate]</span>"
            )
            input.parentNode.insertBefore(arrow, input)
            input.classList.add("multiline")

            // One might argue that a person in the middle of a line who hits
            // Shift-Enter wants to enter multiline mode *and* get a newline,
            // but it could also be just a partial thought to type "a" and then
            // realize you want to be in multiline mode.  So getting "a" on
            // its own line and a cursor on the next, having to backspace,
            // could be annoying.  Since the user's finger is on the ENTER
            // key already they cna just hit it again if they want (even can
            // keep shift held down).  So prevent propagating to the editable
            // div so it doesn't insert a newline.
            //
            e.preventDefault()
            return
        }

        if (input.classList.contains("multiline") && !e.ctrlKey) {
            //
            // In Ren Garden this had some logic that if you hit a couple of
            // blank lines at the end, it assumed you wanted to submit...but
            // didn't do any analysis of when the code was "complete".  This
            // should be reviewed.
            //
            // For the moment, just fall through to the default newline insert
            return
        }

        // Otherwise, consider the input ready for evaluation

        var text = input.innerText
        if (text == "") {
            //
            // !!! Currently passing an empty string to the C is causing it
            // to hang; the loop isn't going to be in C though, it's going to
            // be a JavaScript loop calling libRebol routines...so fixing it
            // isn't important.  Just return.
            //
            e.preventDefault()
            return
        }
        DeactivateInput()

        // We want the replpad to act equivalently to what's generally possible
        // on consoles.  With stdio, if the user hits enter, the cursor goes
        // to the next line.  Hence getting input up to a return should act
        // that way for plain INPUT.  Richer choices should be available, but
        // one wants a standard program to work standardly.
        //
        var new_line = load("<div class='line'>&zwnj;</div>")
        replpad.appendChild(new_line)

        queueEventToC('JS_EVENT_GOT_INPUT', text)
        e.preventDefault() // Allowing enter puts a <br>
        return
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
        input.classList.add("magic-undo")

        var observer = new MutationObserver(function (mutations) {
            var changed = false
            mutations.forEach(function (m) {
                // "You can check the actual changes here"
            })
            input.classList.remove("magic-undo")
            observer.disconnect()
        })
        observer.observe(
            input,
            {subtree: true, childList: true, characterData: true}
        )

        setTimeout(function() {
            if (input.classList.contains("magic-undo")) {
                //
                // First off, clear it and get rid of multiline if it's not
                // already clear.
                //
                if (input.classList.contains("multiline"))
                    CollapseMultiline();
                if (input.innerText != "") {
                    input.innerText = ""
                    input.focus()
                    return
                }

                // Next thing we try is to see if the data was cleared by
                // an escape.  This means there might be more undo information
                // waiting in a put-aside div.  (See notes in OnEscape for why
                // escape can't add an "ordinary" undo item on clearing input.)
                //
                if (undo_escape_input) {
                    input.parentNode.replaceChild(undo_escape_input, input)
                    DeactivateInput(input)
                    ActivateInput(undo_escape_input)
                    undo_escape_input = null
                    return
                }

                if (input == first_input)
                    input.innerHTML = null // don't undo first input
                else {
                    input.parentNode.removeChild(input) // make search easier
                    input = "<magic-undo-should-reset>"
                    MagicUndo() // go backwards to search for last input div
                }
            }
        }, 0)
    }
}


function OnClickReplPad(e) {
    // https://stackoverflow.com/q/31982407
    if (window.getSelection().toString())
        return // selections aren't clicks

    // https://stackoverflow.com/a/9183467
    if (e.target !== this) // make sure it's repl, not a child element
        return

    console.log("It's the target");
    if (!input) // if there's no C_REQUEST_INPUT in progress, do nothing
        return

    input.focus()
    placeCaretAtEnd(input)
}

window.onmousemove = function() {
    AbandonEscapeMode()
}

function AbandonEscapeMode() {
    if (!replpad.classList.contains('escaped')) 
        return

    replpad.classList.remove('escaped')

    if (input) {
        input.focus()
        placeCaretAtEnd(input)
    }
}

function selectText(container) { // https://stackoverflow.com/a/1173319
    if (document.selection) { // IE
        var range = document.body.createTextRange();
        range.moveToElementText(container)
        range.select()
    }
    else if (window.getSelection) {
        var range = document.createRange()
        range.selectNode(container)
        window.getSelection().removeAllRanges()
        window.getSelection().addRange(range)
    }
}

function getSelectionText() {
    var text = ""
    if (window.getSelection)
        text = window.getSelection().toString()
    else if (document.selection && document.selection.type != "Control")
        text = document.selection.createRange().text
    return text
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
    if (input) {
        //
        // If there's multiline input, demote to single line
        //
        if (input.classList.contains("multiline")) {
            CollapseMultiline()
            return
        }

        // If there's content in the input, give the appearance of clearing
        // it...but actually save the content div aside.  This way we have not
        // only the content, but its undo history.  So we can bring both
        // the data back, and the undo queue back, if the user hits Ctrl-Z.
        //
        // !!! Unfortunately we can't use the mechanism for adding to the
        // browser's built-in undo/redo queue, which is `document.execCommand`.
        // The problem is that you can only call that from a "trusted user
        // initiated event", e.g. an `onkeypress`.  But the ESC key doesn't
        // generate printable output, so it's only detectable in keydown().
        // If it *did* work all we'd have to do is select the content and
        // use an `document.execCommand('delete')` to give the effect.  :-/
        //
        if (input.innerText != "") {
            undo_escape_input = input
            var new_input = load("<div class='input'></div>")
            input.parentNode.replaceChild(new_input, input)
            DeactivateInput()
            ActivateInput(new_input)
            return
        }

        // !!! This could be ambiguous.  If the user's at a blank prompt from
        // INPUT and hits escape, what do they mean?  Do they want to tell
        // the running script that they canceled (e.g. by having INPUT return
        // NULL) or do they want to cancel the script entirely?
        //
        return
    }

    // There's no input, but there might be a selection of some arbitrary
    // text in the window...and it could be scrolled to some weird place.
    // Treat escape as a "call for help" if it isn'
    //
    // https://stackoverflow.com/a/3169849
    //
    if (!replpad.classList.contains('escaped')) {
        replpad.lastChild.scrollIntoView()

        if (getSelectionText() != "") {
            if (window.getSelection().empty)  // Chrome
                window.getSelection().empty()
            else if (window.getSelection().removeAllRanges)  // Firefox
                window.getSelection().removeAllRanges()
            return
        }
        
        console.log("adding escaped")
        replpad.classList.add('escaped')
        return
    }

    AbandonEscapeMode()

    // Next, if there's an input, clear that.  But since it might be
    // easy to type on accident, be sure it gets into the undo queue by
    // using `document.execCommand`
    //
    // https://stackoverflow.com/a/28217619
    //
    if (input) {
        input.innerHTML = null
        return
    }

    console.log("queueing halt");

    if (sleep_timeout_id)
        clearTimeout(sleep_timeout_id) // forget JS_EVENT_SLEEP_COMPLETE

    queueEventToC('JS_EVENT_HALTED')
}


document.onkeydown = function(e) {
    // https://stackoverflow.com/a/3369743/211160
    var isEscape = false
    if ("key" in e)
        isEscape = (e.key == "Escape" || e.key == "Esc")
    else
        isEscape = (e.keyCode == 27)

    if (isEscape) {
        OnEscape()
        return
    }

    AbandonEscapeMode()
};


placeCaretAtEnd = function(el) { // https://stackoverflow.com/a/4238971
    el.focus()
    if (
        typeof window.getSelection != "undefined"
        && typeof document.createRange != "undefined"
    ){
        var range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
        var sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(range)
    }
    else if (typeof document.body.createTextRange != "undefined") {
        var textRange = document.body.createTextRange()
        textRange.moveToElementText(el)
        textRange.collapse(false)
        textRange.select()
    }
}

// 
//
function replaceSelectedText(newText) { https://stackoverflow.com/a/3997896
    if (window.getSelection) {
        var sel = window.getSelection()
        if (sel.rangeCount) {
            var range = sel.getRangeAt(0)
            range.deleteContents()
            range.insertNode(document.createTextNode(newText))
        }
    }
    else if (document.selection && document.selection.createRange) {
        var range = document.selection.createRange()
        range.text = newText
    }
}

//=//// ROW CLICK WITH MULTI-SELECT ////////////////////////////////////////=//
//
// Taken from:
// https://stackoverflow.com/a/17966381
//

var lastSelectedRow
var watchlist = document.getElementById('watchlist')
console.log(watchlist)
var trs = document.getElementById('watchlist').tBodies[0].getElementsByTagName('tr')
console.log(trs)

// disable text selection
/*document.onselectstart = function() {
    return false
}*/

RowClick = function(currenttr, lock) {
    if (window.event.ctrlKey)
        toggleRow(currenttr)
    
    if (window.event.button === 0) {
        if (!window.event.ctrlKey && !window.event.shiftKey) {
            clearAll()
            toggleRow(currenttr)
        }
    
        if (window.event.shiftKey) {
            selectRowsBetweenIndexes(
                [lastSelectedRow.rowIndex, currenttr.rowIndex]
            )
        }
    }
}

function toggleRow(row) {
    row.className = (row.className == 'selected') ? '' : 'selected'
    lastSelectedRow = row
}

function selectRowsBetweenIndexes(indexes) {
    indexes.sort(function(a, b) {
        return a - b
    })

    for (var i = indexes[0]; i <= indexes[1]; i++)
        trs[i - 1].className = 'selected'
}

function clearAll() {
    for (var i = 0; i < trs.length; i++)
        trs[i].className = ''
}


//=//// RIGHT-CLICK MENU ///////////////////////////////////////////////////=//
//
// Taken from:
// https://stackoverflow.com/a/35730445/211160
//

var i = document.getElementById("menu").style
document.addEventListener('contextmenu', function(e) {
    var posX = e.clientX
    var posY = e.clientY
    menu(posX, posY)
    e.preventDefault()
}, false)

document.addEventListener('click', function(e) {
    i.opacity = "0"
    setTimeout(function() {
      i.visibility = "hidden"
    }, 501)
}, false)

function menu(x, y) {
    i.top = y + "px"
    i.left = x + "px"
    i.visibility = "visible"
    i.opacity = "1"
}

OnMenuCut = function() {
    clipboard = window.getSelection().toString()
    document.execCommand('cut')
}

OnMenuCopy = function() {
    clipboard = window.getSelection().toString()
    document.execCommand('copy')
}

OnMenuPaste = function() {
    if (!clipboard)
        alert("For security reasons, paste is only allowed from within page")
    else
        replaceSelectedText(clipboard)
}

//=//// END `DOMContentLoaded` HANDLER /////////////////////////////////////=//

}) // lame to indent nearly this entire file, just to put it in the handler
