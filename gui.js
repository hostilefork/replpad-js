//
// File: %gui.js
// Summary: "GUI Thread Services"
// Project: "JavaScript REPLpad for Ren-C branch of Rebol 3"
// Homepage: https://github.com/hostilefork/replpad-js/
//
//=////////////////////////////////////////////////////////////////////////=//
//
// Copyright (c) 2018-2019 hostilefork.com
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

'use strict'  // <-- FIRST statement! https://stackoverflow.com/q/1335851


// Worker message pump, created once runtime is loaded
//
// !!! The worker is no longer in use, since only one thread is able to call
// the EXPORTED_FUNCTIONS...and it's too important to be able to mix libRebol
// APIs directly with code on the GUI thread.  However, code for instantiating
// it is kept around for the moment, to make it easier to use a worker if a
// need for one comes up.
//
var pump


// Lets us do something like jQuery $("<div class='foo'>content</div>").
// load("&lt;") gives `<` while document.createTextNode("&lt;") gives `&lt;`
//
var loader_temp = document.createElement("div")
function load(html) {
    loader_temp.innerHTML = html
    var loaded = loader_temp.firstChild
    loader_temp.removeChild(loaded)  // https://trello.com/c/64iJBijV
    if (loader_temp.firstChild) {
        alert("load() created more than one element" + loader_temp.innerHTML)
        loader_temp.innerHTML = ""  // https://trello.com/c/1P2jwTmZ
    }
    return loaded
}


var replpad

// As a proof of concept, the "magic undo" is being tested, to see if that
// Ren Garden feature can be carried over to the browser.
//
var input = null
var input_resolve
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
function queueEventToWorker(id, str) {  // str `undefined` if not passed in
    if (str === undefined)
        str = null  // although `undefined == null`, canonize to null

    pump.postMessage([id, str])  // argument will be e.data in onmessage(e)
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
        first_input = el  // will stop magic-undo from undoing

    // Don't set the focus or scroll if the user is not on the bottom of the
    // terminal output.  Note that scroll positions don't seem to be precise
    // science, sometimes they're fractional pixels and off in various ways.
    //
    // Note: The reversal trick means *bottom* scroll position is actually 0!
    // https://stackoverflow.com/a/34345634/
    //
    if (replcontainer.scrollTop < 3) {
        replcontainer.scrollTop = 0  // go ahead and snap to bottom
        el.focus()
        placeCaretAtEnd(el)
    }

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
    var param = e.data[1]  // can be any data type

    // !!! Currently the worker is not in use.
    //
    switch (id) {
    }
}


var splitter_sizes = [75, 25]
var splitter  // will be created by the JS-WATCH-VISIBLE command

document.addEventListener('DOMContentLoaded', function () {  //...don't indent

//=//// DOMContentLoaded Handled ///////////////////////////////////////////=//

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

var replcontainer = document.getElementById('replcontainer')
replpad = document.getElementById('replpad')
replpad.onclick = OnClickReplPad

// As part of a complex trick that flips the repl upside down and back again
// to get decent scroll bar behavior, we have to compensate for the reversed
// mouse wheel direction.  See CSS file for notes on this.
// https://stackoverflow.com/a/34345634
//
document.querySelector("#replcontainer").addEventListener("wheel",
    function(e) {
        if (e.deltaY) {
            let target = e.currentTarget
            let fontsize = parseFloat(
                getComputedStyle(target).getPropertyValue('font-size')
            )
            e.preventDefault();
            target.scrollTop -= fontsize * (e.deltaY < 0 ? -1 : 1) * 2;
        }
    }
);


// MagicUndo is a feature from Ren Garden.  It would notice when the undo list
// was empty for console input, and if it was, then undo would rewind and undo
// the console output from the previous command...putting your selection back
// to where it was.
//
function MagicUndo() {
    let div = replpad.lastChild
    while (div) {
        let child = div.lastChild
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
    let arrow = input.previousSibling
    arrow.remove()  // scrubs it completely, unlike .detach()
    input.classList.remove("multiline")
}

onInputKeyDown = function(e) {
    e = e || window.event  // !!! "ensure not null"... necessary? :-/

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
            let arrow = load(
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

        // We don't want to get <br>, <div>, or &nbsp; in the Rebol text.
        // But to preserve the undo information, we also don't want to reach
        // in and canonize the mess the browser made during contentEditable.
        //
        // Do in steps; tweak the HTML of a copy, then get the textContent.
        // https://stackoverflow.com/a/5959455
        //
        // `/g` is global replace, `/gi` is global replace case-insensitively
        //
        let clone_children = true
        let temp = input.cloneNode(clone_children)
        temp.innerHTML = temp.innerHTML.replace(/<br\s*[\/]?>/gi, "\n")
        temp.innerHTML = temp.innerHTML.replace(/<div>/gi, "\n")
        temp.innerHTML = temp.innerHTML.replace(/<\/div>/gi, "\n")
        temp.innerHTML = temp.innerHTML.replace(/&nbsp;/gi, ' ')
        temp.innerHTML = temp.innerHTML.replace(/\u200C/g, ' ')

        // Note: textContent is different from innerText
        // http://perfectionkills.com/the-poor-misunderstood-innerText/
        //
        let text = temp.textContent
        DeactivateInput()

        // We want the replpad to act equivalently to what's generally possible
        // on consoles.  With stdio, if the user hits enter, the cursor goes
        // to the next line.  Hence getting input up to a return should act
        // that way for plain INPUT.  Richer choices should be available, but
        // one wants a standard program to work standardly.
        //
        let new_line = load("<div class='line'>&zwnj;</div>")
        replpad.appendChild(new_line)

        if (use_emterpreter) {
            //
            // !!! If building with the emterpreter, EXPORTED_FUNCTIONS may
            // not be called during an emscripten_sleep_with_yield().  This
            // means resolving the promise that REPLPAD-INPUT is waiting on
            // can't be done with a reb.Text() value, because we can't call
            // reb.Text()!
            //
            // Hence the resolver takes a function which is called to produce
            // the value at a time when it is no longer yielding, and it's safe
            // to call the libRebol API again.
            //
            input_resolve(function () {
                return reb.Text(text)
            })
        }
        else {
            // If we're using pthreads, we should be able to make API requests
            // from the GUI, and give the JS-AWAITER's return value directly.
            //
            input_resolve(reb.Text(text))
        }
        input_resolve = undefined

        e.preventDefault()  // Allowing enter puts a <br>
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

        let observer = new MutationObserver(function (mutations) {
            let changed = false
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
                    CollapseMultiline()
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
                    input.innerHTML = null  // don't undo first input
                else {
                    input.parentNode.removeChild(input)  // make search easier
                    input = "<magic-undo-should-reset>"
                    MagicUndo()  // go backwards to search for last input div
                }
            }
        }, 0)
    }
}


function OnClickReplPad(e) {
    // https://stackoverflow.com/q/31982407
    if (window.getSelection().toString())
        return  // selections aren't clicks

    // https://stackoverflow.com/a/9183467
    // make sure it's repl, not a child element
    if (e.target !== replpad && e.target !== replcontainer)
        return

    console.log("It's the target")
    if (!input)  // if there's no C_REQUEST_INPUT in progress, do nothing
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

function selectText(container) {  // https://stackoverflow.com/a/1173319
    if (document.selection) {  // IE
        let range = document.body.createTextRange()
        range.moveToElementText(container)
        range.select()
    }
    else if (window.getSelection) {
        let range = document.createRange()
        range.selectNode(container)
        window.getSelection().removeAllRanges()
        window.getSelection().addRange(range)
    }
}

function getSelectionText() {
    let text = ""
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
            let new_input = load("<div class='input'></div>")
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

    console.log("queueing halt")

    if (sleep_timeout_id)
        clearTimeout(sleep_timeout_id)  // forget JS_EVENT_SLEEP_COMPLETE

    queueEventToC('JS_EVENT_HALTED')
}


// !!! We wish to be able to notice when the user is scrolled to some random
// point in the document with a selection, but hits a printable key...and jump
// to the input in that case.  But we do not want Ctrl-C to do this (for
// example) so there has to be some set of filters for it.  keypress() would
// be the right tool for the job, if it were not "deprecated".  But no
// suitable replacement has been offered for these kinds of scenarios:
//
// https://stackoverflow.com/q/43877434
//
// Since `onkeypress()` going away would break many existing sites, we will
// take that deprecation with a grain of salt and use it anyway.
//
document.addEventListener('keypress', function(e) {
    //
    // Activate input if a printable key is pressed
    // Shouldn't have to AbandonEscapeMode(), onkeydown should do that
    //
    if (input && document.activeElement != input)
        placeCaretAtEnd(input)  // should clear selection, also receive key
});

document.onkeydown = function(e) {
    // https://stackoverflow.com/a/3369743/211160
    let isEscape = false
    if ("key" in e)
        isEscape = (e.key == "Escape" || e.key == "Esc")
    else
        isEscape = (e.keyCode == 27)

    if (isEscape) {
        OnEscape()
        return false
    }

    AbandonEscapeMode()

    if (!input)
        return true

    if (document.activeElement == input)
        return true

    return true
}


placeCaretAtEnd = function(el) {  // https://stackoverflow.com/a/4238971
    el.focus()
    if (
        typeof window.getSelection != "undefined"
        && typeof document.createRange != "undefined"
    ){
        let range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
        let sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(range)
    }
    else if (typeof document.body.createTextRange != "undefined") {
        let textRange = document.body.createTextRange()
        textRange.moveToElementText(el)
        textRange.collapse(false)
        textRange.select()
    }
}

function replaceSelectedText(newText) { // https://stackoverflow.com/a/3997896
    if (window.getSelection) {
        let sel = window.getSelection()
        if (sel.rangeCount) {
            let range = sel.getRangeAt(0)
            range.deleteContents()
            range.insertNode(document.createTextNode(newText))
        }
    }
    else if (document.selection && document.selection.createRange) {
        let range = document.selection.createRange()
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
var trs = document.getElementById('watchlist')
    .tBodies[0]
    .getElementsByTagName('tr')

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
// https://stackoverflow.com/a/35730445
//
// !!! This was an experiment, but it's genuinely annoying to take away the
// user's browser menu (e.g. to right click links and open a new tab).
// Review the motivation for doing this.

/*
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
*/

//=//// END `DOMContentLoaded` HANDLER /////////////////////////////////////=//

onGuiInitialized()

r3_ready_promise.then(function() {

    // As an expedient way of beginning a more formal test process, a small
    // script that must be run outside of a rebPromise() is loaded by this
    // point.  Invoke it at top level before doing anything with the ReplPad.

    console.log("Performing some basic tests from %toplevel.test.js")
    if (!toplevelTest())
        throw ("Test failure encountered in %toplevel.test.js")

    // !!! This isn't the ideal place to put this, but scripts have to have
    // an idea of what the "current directory is" when they are running.  Then
    // resources are fetched by path relative to that.
    //
    // Method chosen for getting the URL dir was one that included the slash:
    // https://stackoverflow.com/a/16985358
    //
    let url = document.URL
    let base_url
    if (url.charAt(url.length - 1) === '/') {
        base_url = url.slice(0, url.lastIndexOf('/'))
        base_url = base_url.slice(0, base_url.lastIndexOf('/')) + '/'
    } else {
        base_url = url.slice(0, url.lastIndexOf('/')) + '/'
    }
    reb.Elide("change-dir system/options/path: as url!", reb.T(base_url))

    // %replpad.reb contains JS-NATIVE/JS-AWAITER declarations, so it can only
    // run after libr3 is loaded and the JavaScript extension is initialized.

    console.log("fetch()-ing %replpad.reb from host")

    return fetch('replpad.reb')
      .then(function(response) {

        // https://www.tjvantoll.com/2015/09/13/fetch-and-errors/
        if (!response.ok)
            throw Error(response.statusText)  // handled by .catch() below

        return response.text()  // text() method a promise ("USVString")

      }).then(function(text) {

        // Note that %replpad.reb contains JS-NATIVE/JS-AWAITER declarations,
        // so it can only run after libr3 and JavaScript extension are loaded.

        console.log("Running %replpad.reb")
        reb.Elide(text)
        console.log("Finished running replpad.reb @ tick " + reb.Tick())

        // Running replpad.reb defines MAIN, which is an adaptation of the
        // CONSOLE command from the Console Extension.
        //
        // The entire console session (with many INPUT and PRINT commands) is
        // run in one long Promise.  If you are using a wasm/pthread build,
        // then all the Rebol code will be running on a JavaScript worker...
        // which will suspend that worker stack any time a synchronous need of
        // JavaScript comes up--and that synchronous need will be run via a
        // setTimeout()-based handler on the GUI thread.  This is because most
        // anything you want to do with JavaScript is going to involve data
        // and functions available only on the GUI thread.
        //
        // Hence this long call to main only actually "fullfills the promise"
        // when the whole interactive session is finished.
        //
        // See also: "On Giving libRebol JS More Powers than JavaScript"
        // https://forum.rebol.info/t/849

        return reb.Promise("main")
      })

}).then(function(exit_code) {

    // You can QUIT and wind up here.  That raises the question of what "QUIT"
    // means on a web page:
    //
    // https://github.com/hostilefork/replpad-js/issues/17
    //
    // In C, the console returns an integer result to the shell.  Not clear
    // what good that value does us here, but...we do get it.  :-/

    console.log("CONSOLE exited with " + reb.UnboxInteger(exit_code))
    reb.Release(exit_code)

    // In theory, this is a good time to use the various debug/shutdown checks
    // that everything balances to 0.  But in practice, it's rather prohibitive
    // to do a full debug build in emscripten (the emterpreter version,
    // especially).  See also concerns here:
    //
    // https://github.com/hostilefork/replpad-js/issues/22

    console.log("Calling reb.Shutdown()")
    reb.Shutdown()

  }).catch(function(error) {

    console.error(error)  // shows stack trace (if user opens console...)
    alert(error.toString())  // notifies user w/no console open

  })

}) // lame to indent nearly this entire file, just to put it in the handler
