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
// Licensed under the Lesser GPL, Version 3.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// https://www.gnu.org/licenses/lgpl-3.0.html
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


// Lets us do something like jQuery $("<div class='foo'>content</div>").
// load("&lt;") gives `<` while document.createTextNode("&lt;") gives `&lt;`
//
// Note that <template> is an HTML5 tag that can have any child (including
// <td> elements).
//
var loader_temp = document.createElement("template")
function load(html) {
    loader_temp.innerHTML = html
    var loaded = loader_temp.content.firstChild
    loaded.parentNode.removeChild(loaded)  // https://trello.com/c/64iJBijV
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
var input_history = []
var input_history_index = -1
var first_input = null
var onInputKeyDown
var placeCaretAtEnd

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

    // this should match the styles defined for .input
    // so that the larger copy/paste area gets restored
    el.style.width = '100%'
    el.style.height = '100px'

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

    // shrinks the previous input down to a
    // minimum size that will fit its contents
    el.style.width = 'auto'
    el.style.height = 'auto'
}


document.addEventListener('DOMContentLoaded', function () {  //...don't indent

//=//// DOMContentLoaded Handled ///////////////////////////////////////////=//

var replcontainer = document.getElementById('replcontainer')
replpad = document.getElementById('replpad')
replpad.onclick = OnClickReplPad

// When pasting is performed, we want to strip off the formatting to get plain
// text (so it does not corrupt the ReplPad's structure).  Also, we do not
// want people copying out code samples to get the formatting (e.g. the subtle
// difference of bold for PRINT output, and normal weight for user input.)
//
// https://stackoverflow.com/q/12027137/
//
replpad.addEventListener("paste", (e) => {
    e.preventDefault();  // cancel HTML-based paste
    var text = (e.originalEvent || e).clipboardData.getData('text/plain');
    document.execCommand("insertText", false, text);  // insertText is new-ish
});

replpad.addEventListener('copy', (e) => {
    const selection = document.getSelection();
    e.clipboardData.setData('text/plain', selection.toString());
    e.preventDefault();  // cancel HTML-based paste
});


// As part of a complex trick that flips the repl upside down and back again
// to get decent scroll bar behavior, we have to compensate for the reversed
// mouse wheel direction.  See CSS file for notes on this.
// https://stackoverflow.com/a/34345634
//
document.querySelector("#replcontainer").addEventListener("wheel", (e) => {
    if (e.deltaY) {
        let target = e.currentTarget
        let fontsize = parseFloat(
            getComputedStyle(target).getPropertyValue('font-size')
        )
        e.preventDefault();
        target.scrollTop -= fontsize * (e.deltaY < 0 ? -1 : 1) * 2;
    }
});


// MagicUndo is a feature from Ren Garden.  It would notice when the undo list
// was empty for console input, and if it was, then undo would rewind and undo
// the console output from the previous command...putting your selection back
// to where it was.
//
function MagicUndo() {
    // make sure we have a line to undo
    if (replpad.querySelectorAll('.line').length > 1) {
        // get the current line
        var line = replpad.lastChild

        while (line) {
            // remove the current line, which contains
            // all output from the previous command
            replpad.removeChild(line)

            // get the previous line
            line = replpad.lastChild

            if (line) {
                // get the input from the previous line
                var prev_input = line.querySelector('.input')

                // activate the previous input
                if (prev_input) {
                    ActivateInput(prev_input)
                    return
                }

                // no input exists and so loop around
                // and delete the entire line
            }
        }

        alert("Magic Undo failure, didn't set input")
        input = null
    }
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

    if (e.key == 'Enter' || e.keyCode == 13) { // !!! 13 is enter, standard??

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
        let new_line = load("<div class='line'></div>")
        replpad.appendChild(new_line)

        input_resolve(text)
        input_resolve = undefined

        input_history.push(text)
        input_history_index = input_history.length

        e.preventDefault()  // Allowing enter puts a <br>
        return
    } else if (e.keyCode == 38) { // arrow - up
        if (!input.classList.contains("multiline")) {
            if (input_history_index > 0) {
                input_history_index--
                input.textContent = input_history[input_history_index]
            }

            e.preventDefault()
        }
    } else if (e.keyCode == 40) { // arrow - down
        if (!input.classList.contains("multiline")) {
            if (input_history_index < input_history.length - 1) {
                input_history_index++
                input.textContent = input_history[input_history_index]
            } else {
                input_history_index = input_history.length
                input.textContent = ''
            }

            e.preventDefault()
        }
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
    if (window.getSelection().toString())  // selections aren't clicks
        return  // https://stackoverflow.com/q/31982407

    if (!input)  // if there's no input in progress, do nothing
        return

    if (e.target == input)  // clicks to the input sub-element handle themseves
        return

    let inputTop = input.getBoundingClientRect().top
    if (e.clientY < inputTop)  // don't jump the cursor if click is above input
        return  // (hence a bum selection attempt won't lose your scroll pos)

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
    reb.Halt()
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


//=//// END `DOMContentLoaded` HANDLER /////////////////////////////////////=//


//=//// SIMULATED DEVELOPER CONSOLE INSIDE BROWSER WINDOW /////////////////=//
//
// Mobile web browsers frequently do not have the "Ctrl-Shift-I" option to
// open developer tools.  To assist in debugging (or giving more informative
// status messages while your client is loading), %load-r3.js allows you to
// pass in a configuration object with log(), info(), error(), and warn().
//
// We redirect that output to the replpad element.
//

let temp_elem = document.createElement("div")

var escape_text = function (text) {
    // escape text using
    // the browser's internal mechanisms.
    //
    // https://stackoverflow.com/q/6234773/
    //
    temp_elem.innerText = text  // assignable property, assumes literal text
    return temp_elem.innerHTML  // so <my-tag> now becomes &lt;my-tag&gt;
}


let rewired = function (old_handler, classname) {
    return (txt) => {
        replpad.appendChild(load(
            '<div class="line '
            + classname + '">'
            + escape_text(txt)
            + '</div>'
        ))

        old_handler(txt)  // also show message in browser developer tools
    }
}


//=//// STARTUP PROMISE AND HANDLER ////////////////////////////////////////=//
//
// The %load-r3.js file gives us `reb.Startup()`, which takes a configuration
// object as a parameter, and returns a Promise for a running evaluator.
//
// reb.Startup() loads all `<script type="text/rebol" ...>` tags and runs them.
// Running replpad.reb defines MAIN, which is an adaptation of the CONSOLE
// command from the Console Extension.
//
// The entire console session (with many INPUT and PRINT commands) is run in
// one long Promise.  If you are using a wasm/pthread build, then all the Rebol
// code will be running on a JavaScript worker... which will suspend that
// worker stack any time a synchronous need of JavaScript comes up--and that
// synchronous need will be run via a setTimeout()-based handler on the GUI
// thread.  This is because most anything you want to do with JavaScript is
// going to involve data and functions available only on the GUI thread.
//
// Hence this long call to main only actually "fullfills the promise" when the
// whole interactive session is finished.
//
// See also: "On Giving libRebol JS More Powers than JavaScript"
// https://forum.rebol.info/t/849
//

reb.Startup({

    info: rewired(console.info, "info"),
    log: rewired(console.log, "log"),
    warn: rewired(console.warn, "warn"),
    error:  rewired(console.error, "error")

}).then(() => {

    return reb.Promise("main")

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

  })
  // !!! We could put a catch clause here, e.g.
  //
  //    .catch(function(error) {
  //        console.error(error)  // shows stack trace (if console open)
  //        alert(error.toString())  // notifies user w/no console open
  //    }
  //
  // However, allowing code to error at the spot where a problem happens
  // offers easier debugging.  Consider having a "release version" that does
  // something friendlier, perhaps offering to restart the console.

}) // lame to indent nearly this entire file, just to put it in the handler
