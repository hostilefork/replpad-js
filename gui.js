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


// Currently, the only way the REPL runs is if you build using "emterpreter":
//
// https://github.com/kripken/emscripten/wiki/Emterpreter
//
// Future directions would run rebPromise() on a spawned thread, and hold the
// stack in a suspended state when asynchronous demands are made, then using
// Atomics.wait() to be signaled when the resolve() or reject() are called by
// code on the GUI thread.  This requires writing some new code and also the
// support for SharedArrayBuffer, which many browsers don't have enabled yet:
//
// https://stackoverflow.com/questions/51351983/
//
var using_emterpreter = true

var is_localhost = (  // helpful to put certain debug behaviors under this flag
    location.hostname === "localhost"
    || location.hostname === "127.0.0.1"
    || location.hostname.startsWith("192.168")
)
if (is_localhost) {
    var old_alert = window.alert
    window.alert = function(message) {
        console.error(message)
        old_alert(message)
        debugger
    }
}


// GitHub is queried for this hash if it is not already set, unless running
// on the local host.  (If you run locally and want to test the fetching,
// you'll have to edit the code.)
//
var libr3_git_short_hash = null

// We're able to ask GitHub what the latest build's commit ID is, and then use
// that to ask for the latest Travis build.  GitHub API returns responses via
// JSON, and supports CORS so we can legally do the cross domain request in
// the client (yay!)
//
// https://stackoverflow.com/a/15933109/211160
//
// Note these are "promiser" functions, because if they were done as a promise
// it would need to have a .catch() clause attached to it here.  This way, it
// can just use the catch of the promise chain it's put into.)

var libr3_git_hash_promiser
if (!libr3_git_short_hash && is_localhost)
    libr3_git_hash_promiser = () => Promise.resolve(null)
else {
    libr3_git_hash_promiser = () => {
        console.log("Making GitHub API CORS request for the latest commit ID")

        let owner = "metaeducation"
        let repo = "ren-c"
        let branch = "master"

        return fetch(
            "https://api.github.com/repos/" + owner + "/" + repo
                + "/git/refs/heads/" + branch

          ).then(function (response) {

            // https://www.tjvantoll.com/2015/09/13/fetch-and-errors/
            if (!response.ok)
                throw Error(response.statusText)  // handled by .catch() below

            return response.json();

          }).then(function (json) {

            let hash = json["object"]["sha"];
            console.log("GitHub says latest commit to master was " + hash)
            return hash
          })
    }
}


// At this moment, there are 3 files involved in the download of the library:
// a .JS loader stub, a .WASM loader stub, and a large emterpreter .BYTECODE
// file.  See notes on the hopefully temporary use of the "Emterpreter",
// without which one assumes only a .wasm file would be needed.
//
// If you see files being downloaded multiple times in the Network tab of your
// browser's developer tools, this is likely because your webserver is not
// configured correctly to offer the right MIME type for the .wasm file...so
// it has to be interpreted by JavaScript.  See the README.md for how to
// configure your server correctly.
//
function libRebolComponentURL(extension) {
    let components = [".js", ".wasm", ".wast", ".temp.asm.js", ".bytecode"]

    if (!components.includes(extension))
        throw Error("Unknown libRebol component extension: " + extension)

    let dir = libr3_git_short_hash  // empty string ("") is falsey in JS
            ? "http://metaeducation.s3.amazonaws.com/travis-builds/0.16.2/"
            : "../ren-c/make/"  // assumes replpad-js/ is peer to ren-c/ dir

    let opt_dash = libr3_git_short_hash ? "-" : "";

    return dir + "libr3" + opt_dash + libr3_git_short_hash + extension
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
    // !!! Messing with this setting never seemed to help.  See the emcc
    // parameter ALLOW_MEMORY_GROWTH for another possibility.
    //
 /* TOTAL_MEMORY: 16 * 1024 * 1024, */

    locateFile: function(s) {
        //
        // function for finding %libr3.wasm  (Note: memoryInitializerPrefixURL
        // for bytecode was deprecated)
        //
        // https://stackoverflow.com/q/46332699
        //
        console.info("Module.locateFile() asking for .wasm address of " + s)

        // Although we rename the files to add the Git Commit Hash before
        // uploading them to S3, it seems that for some reason the .js hard
        // codes the name the file was built under in this request.  :-/
        // So even if the request was for `libr3-xxxxx.js` it will be asked
        // in this routine as "Where is `libr3.wasm`
        //
        if (s == "libr3.wasm")
            return libRebolComponentURL(".wasm")

        // !!! These files should only be generated if you are debugging, and
        // are optional.  But it seems locateFile() can be called to ask for
        // them anyway--even if it doesn't try to fetch them (e.g. no entry in
        // the network tab that tried and failed).  Review build settings to
        // see if there's a way to formalize this better to know what's up.
        //
        if (s == "libr3.wast")
            return libRebolComponentURL(".wast")
        if (s == "libr3.temp.asm.js")
            return libRebolComponentURL(".temp.asm.js")

        throw Error("Module.locateFile() doesn't recognize" + s)
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
    emterpreterFile: "<if `using_emterpreter`, fetch() of %libr3.bytecode>"

    // The rest of these fields will be filled in by the boilerplate of the
    // Emterpreter.js file when %libr3.js loads (it looks for an existing
    // Module and adds to it, but this is also how you parameterize options.)
}


//=// CONVERTING CALLBACKS TO PROMISES /////////////////////////////////////=//
//
// https://stackoverflow.com/a/22519785
//

var dom_content_loaded_promise = new Promise(function(resolve, reject) {
    document.addEventListener('DOMContentLoaded', resolve)
})

var onGuiInitialized
var gui_init_promise = new Promise(function(resolve, reject) {
    //
    // The GUI has to be initialized (DOM initialization, etc.) before we can
    // even use HTML to show status text like "Running Mezzanine", etc.  When
    // all the GUI's services are available it will call onGuiInitialized().
    // This converts that into a promise so it can be used in a clearer-to-read
    // linear .then() sequence.
    //
    onGuiInitialized = resolve
})

var runtime_init_promise = new Promise(function(resolve, reject) {
    //
    // The load of %libr3.js will at some point will trigger a call to
    // onRuntimeInitialized().  We set it up so that when it does, it will
    // resolve this promise (used to trigger a .then() step).
    //
    Module.onRuntimeInitialized = resolve
})


// If we are using the emterpreter, Module.emterpreterFile must be assigned
// before the %libr3.js starts running.  And it will start running some time
// after the dynamic `<script>` is loaded.
//
// See notes on short_hash_promiser for why this is a "promiser", not a promise
//
var bytecode_promiser
if (!using_emterpreter)
    bytecode_promiser = () => {
        console.log("Not emterpreted libr3.js, not requesting bytecode")
        return Promise.resolve()
    }
else {
    bytecode_promiser = () => {
        let url = libRebolComponentURL(".bytecode")
        console.log("Emterpreted libr3.js, requesting bytecode from:" + url)

        return fetch(url)
          .then(function(response) {

            // https://www.tjvantoll.com/2015/09/13/fetch-and-errors/
            if (!response.ok)
                throw Error(response.statusText)  // handled by .catch() below

            return response.arrayBuffer()  // arrayBuffer() method is a promise

          }).then(function(buffer) {

            Module.emterpreterFile = buffer  // must load before emterpret()-ing
          })
    }
}


// %replpad.reb contains JS-NATIVE/JS-AWAITER declarations, so it can only
// run after the JavaScript extension has been loaded.
//
// When editing locally, one wants the local server to provide the replpad.reb
// file.  It's just an ordinary fetch.  But using the GitHub API to fetch
// files from elsewhere has the advantage of potentially letting people do
// their own development, push changes there, and ask (via some URL fragment)
// to run that.
//
var replpad_reb_promiser
if (is_localhost) {
    replpad_reb_promiser = () => {
        console.log("Fetching %replpad.reb from localhost (not GitHub)")
        console.log("(This is based on detection, see gui.js for override)")

        return fetch('replpad.reb')
          .then(function(response) {

            // https://www.tjvantoll.com/2015/09/13/fetch-and-errors/
            if (!response.ok)
                throw Error(response.statusText)  // handled by .catch() below

            return response.text()  // text() method a promise ("USVString")
          })
    }
}
else {
    // GitHub's response is a little weirder, as JSON, and you have to
    // extract the blob out of it.
    //
    replpad_reb_promiser = () => {
        console.log("Fetching %replpad.reb from GitHub (not localhost)")
        console.log("(This is based on detection, see gui.js for override)")

        let owner = "hostilefork"
        let repo = "replpad-js"
        let branch = "master"  // !!! look into API for branch choice here

        let url = "https://api.github.com/repos/" + owner + "/" + repo
            + "/contents/" + 'replpad.reb'

        return fetch(url)
          .then(function (response) {

            // https://www.tjvantoll.com/2015/09/13/fetch-and-errors/
            if (!response.ok)
                throw Error(response.statusText)  // handled by .catch() below

            return response.json()

          }).then(function (json) {
            //
            // The JSON request from GitHub comes back as Base64.  Rather than
            // include a JS base-64 decoder, use the one in Rebol, since it
            // is initialized at this point!
            //
            let decoded = rebSpell(
                "as text! debase/base", rebT(json.content), rebI(64)
            )
            return decoded
          })
    }
}


// Initialization is written as a series of promises for, uh, "simplicity".
//
// !!! Review use of Promise.all() for steps which could be run in parallel.
//
libr3_git_hash_promiser()  // don't ()-invoke other promisers, pass by value!
  .then(function (hash) {
    //
    // We set a global vs. chain it, because the hash needs to be used by the
    // Module.localFile() callback anyway.

    if (hash)
        libr3_git_short_hash = hash.substring(0,7)  // first 7 characters
    else
        libr3_git_short_hash = ""
  })
  .then(bytecode_promiser)  // needs short hash (now in global variable)
  .then(() => dom_content_loaded_promise)  // to add <script> to document.body
  .then(function() {

    // To avoid a race condition, we don't request the load of %libr3.js until
    // we have the Module declared and the onRuntimeInitialized handler set up.
    // Also, if we are using emscripten we need the bytecode.  Hence, we must
    // use a dynamic `<script>` element, created here--instead of a `<script>`
    // tag in the HTML.
    //
    let script = document.createElement('script')
    script.src = libRebolComponentURL(".js")  // full name includes short hash

    document.body.appendChild(script)

    // ^-- The above will eventually trigger runtime_init_promise, but don't
    // wait on that just yet.  Instead just get the loading process started,
    // then wait on the GUI (which 99.9% of the time should finish first) so we
    // can display a "loading %libr3.js" message in the browser window.
    //
    return gui_init_promise

  }).then(function() {  // our onGuiInitialized() message currently has no args

    console.log('Loading/Running %libr3.js...')
    return runtime_init_promise

  }).then(function() {  // emscripten's onRuntimeInitialized() has no args

    console.log('Executing Rebol boot code...')
    rebStartup()

    // There is currently no method to dynamically load extensions with
    // r3.js, so the only extensions you can load are those that are picked
    // to be built-in while compiling the lib.  The "JavaScript extension" is
    // essential--it contains JS-NATIVE and JS-AWAITER.
    //
    // !!! Upcoming changes hope to include the console extension, to offer
    // the same skinnable console logic...including debug behavior.  For now,
    // it is not built in, and a simple loop of Rebol code in %replpad.reb
    // just prints a prompt and does evaluations in a loop.
    //
    console.log('Initializing extensions')
    rebElide(
        "for-each collation builtin-extensions",
            "[load-extension collation]"
    )
  })
  .then(replpad_reb_promiser)
  .then(function(text) {

    console.log("Running %replpad.reb")
    rebElide(text)
    console.log("Finished running replpad.reb @ tick " + rebTick())

    return rebPromise("main")

  }).catch(function(error) {

    console.error(error)  // shows stack trace (if user opens console...)
    alert(error.toString())  // notifies user w/no console open

  })



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
    var param = e.data[1]  // can be any data type

    // !!! Currently the worker is not in use.
    //
    switch (id) {
    }
}


var splitter_sizes = [75, 25]
var splitter  // will be created by the JS-WATCH_VISIBLE command

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

replpad = document.getElementById('replpad')
replpad.onclick = OnClickReplPad


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
        let clone_children = true
        let temp = input.cloneNode(clone_children)
        temp.innerHTML = temp.innerHTML.replace(/<br\s*[\/]?>/gi, "\n")
        temp.innerHTML = temp.innerHTML.replace(/<div>/gi, "\n")
        temp.innerHTML = temp.innerHTML.replace(/<\/div>/gi, "\n")

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

        // !!! Due to limitations of the emterpreter, EXPORTED_FUNCTIONS may
        // not be called during an emscripten_sleep_with_yield().  This means
        // that resolving the promise that REPLPAD-INPUT is waiting on can't
        // be done with a rebText() value, because we can't call rebText()!
        // hence the resolver takes a function which is called to produce the
        // value at a time when it is no longer yielding, and it's safe to
        // call the libRebol API again.
        //
        input_resolve(function () {
            return rebText(text)
        })
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
    if (e.target !== this)  // make sure it's repl, not a child element
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


document.onkeydown = function(e) {
    // https://stackoverflow.com/a/3369743/211160
    let isEscape = false
    if ("key" in e)
        isEscape = (e.key == "Escape" || e.key == "Esc")
    else
        isEscape = (e.keyCode == 27)

    if (isEscape) {
        OnEscape()
        return
    }

    AbandonEscapeMode()
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

}) // lame to indent nearly this entire file, just to put it in the handler
