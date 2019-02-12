;
; File: %replpad.reb
; Summary: "Read-Eval-Print-Loop implementation and JavaScript interop"
; Project: "JavaScript REPLpad for Ren-C branch of Rebol 3"
; Homepage: https://github.com/hostilefork/replpad-js/
;
; Copyright (c) 2018-2019 hostilefork.com
;
; See README.md and CREDITS.md for more information
;
; This program is free software: you can redistribute it and/or modify
; it under the terms of the GNU Affero General Public License as
; published by the Free Software Foundation, either version 3 of the
; License, or (at your option) any later version.
;
; https://www.gnu.org/licenses/agpl-3.0.en.html
;
; This program is distributed in the hope that it will be useful,
; but WITHOUT ANY WARRANTY; without even the implied warranty of
; MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
; GNU Affero General Public License for more details.
;


!!: js-native [
    {Temporary debug helper, sends to browser console log instead of replpad}
    message
]{
    console.log(
        "@" + rebTick() + ": "
        + rebSpell("form", rebR(rebArg('message')))
    )
}


replpad-reset: js-awaiter [
    {Clear contents of the browser window}
]{
    replpad.innerHTML = ""

    // !!! This used to say:
    //
    // "The output strategy is to merge content into the last div, until
    // a newline is seen.  Kick it off with an empty div, so there's
    // always somewhere the first output can stick to."
    //
    // But that was leaving a blank line before the first output note, so the
    // note wasn't at the top of the screen.  Leaving it out seems to work;
    // review invariants.
    //
    /* replpad.innerHTML = "<div class='line'>&zwnj;</div>" */

    setTimeout(resolve, 0)  // yield to browser to see result synchronously
}


replpad-write: js-awaiter [
    {Print a string of text to the REPLPAD (no newline)}
    param [text!]
    /note "Format with CSS yellow sticky-note class"
    /html
]{
    let param = rebSpell(rebR(rebArg('param')))
    let note = rebDid(rebR(rebArg('note')))
    let html = rebDid(rebR(rebArg('html')))

    // If not /HTML and just code, for now assume that any TAG-like things
    // should not be interpreted by the browser.  So escape--but do so using
    // the browser's internal mechanisms.
    //
    // https://stackoverflow.com/q/6234773/
    //
    if (!html) {
        let escaper = document.createElement('p')
        escaper.innerText = param  // assignable property, assumes literal text
        param = escaper.innerHTML  // so <my-tag> now becomes &lt;my-tag&gt;
    }

    if (note) {
        replpad.appendChild(load(
            "<div class='note'><p>"
            + param  // not escaped, so any TAG!-like things are HTML
            + "</p><div>"
        ))
        replpad.appendChild(
            load("<div class='line'>&zwnj;</div>")
        )
        setTimeout(resolve, 0)  // yield to browser to see result synchronously
        return
    }

    let line = replpad.lastChild

    // Split string into pieces.  Note that splitting a string of just "\n"
    // will give ["", ""].
    //
    // Each newline means making a new div, but if there's no newline (e.g.
    // only "one piece") then no divs will be added.
    //
    let pieces = param.split("\n")
    line.innerHTML += pieces.shift()  // shift() takes first element
    while (pieces.length)
        replpad.appendChild(
            load("<div class='line'>&zwnj;" + pieces.shift() + "</div>")
        )

    setTimeout(resolve, 0)  // yield to browser to see result synchronously
}

lib/write-stdout: write-stdout: function [
    {Writes just text to the ReplPad}
    text [text! char!]
][
    if char? text [text: my to-text]
    replpad-write text
]

lib/print: print: function [
    {Helper that writes data and a newline to the ReplPad}
    line [<blank> text! block! char!]
    /html
][
    if char? line [
        if line <> newline [fail "PRINT only supports CHAR! of newline"]
        return write-stdout newline
    ]

    (write-stdout/(html) spaced line) then [write-stdout newline]
]


lib/input: input: js-awaiter [
    {Read single-line or multi-line input from the user}
    return: [text!]
]{
    // !!! It seems that an empty div with contenteditable will stick
    // the cursor to the beginning of the previous div.  :-/  This does
    // not happen when the .input CSS class has `display: inline-block;`,
    // but then that prevents the div from flowing naturally along with
    // the previous divs...it jumps to its own line if it's too long.
    // Putting a (Z)ero (W)idth (N)on-(J)oiner before it seems to solve
    // the issue, so the cursor will jump to that when the input is empty.
    //
    replpad.lastChild.appendChild(load("&zwnj;"))

    let new_input = load("<div class='input'></div>")
    replpad.lastChild.appendChild(new_input)

    ActivateInput(new_input)

    // This body of JavaScript ending isn't enough to return to the Rebol
    // that called REPLPAD-INPUT.  The resolve function must be invoked by
    // JavaScript.  We save it in a global variable so that the page's event
    // callbacks dealing with input can call it when input is finished.
    //
    input_resolve = resolve
}


lib/wait: wait: js-awaiter [
    {Sleep for the requested number of seconds}
    seconds [integer! decimal!]
]{
    setTimeout(resolve, 1000 * rebUnboxDecimal(rebR(rebArg("seconds"))))
}


lib/write: write: lib/read: read: function [
    source [any-value!]
][
    print [
        {For various reasons (many of them understandable) there are some}
        {pretty strict limitations on web browsers being able to make HTTP}
        {requests or read local files.  It's possible to read from GitHub URLs}
        {or other things that use CORS.  Such features are already used by the}
        {REPL and will be added to READ, see: https://enable-cors.org/}
    ]
]

lib/browse: browse: function [
    {Provide a clickable link to the user to open in the browser}
    url [url!]
][
    comment {
        // !!! This is how we would open a window in a JS-AWAITER, but it will
        // say popups are blocked.  The user has to configure accepting those,
        // or click on the link we give them.
        //
        // https://stackoverflow.com/a/11384018/
        //
        let url = rebSpell(rebR(rebArg('url')))

        if (false) {
            let win = window.open(url, '_blank');
            win.focus();
        }
    }

    ; Our alternative is we give a link in the console they can click.  Not
    ; very useful if they typed BROWSE literally, but if a command tried to
    ; open a window it's the sort of thing that would give them an option.
    ;
    replpad-write/html unspaced [
        {Click here: <a href="} url {" target="_blank">} url {</a>}
    ]
]


js-watch-visible: js-awaiter [
    visible [logic!]
]{
    let visible = rebDid(rebR(rebArg('visible')))

    let right_div = document.getElementById('right')

    // Suggestion from author of split.js is destroy/recreate to hide/show
    // https://github.com/nathancahill/Split.js/issues/120#issuecomment-428050178
    //
    if (visible) {
        if (!splitter) {
            replcontainer.classList.add("split-horizontal")
            right_div.style.display = 'block'
            splitter = Split(['#replcontainer', '#right'], {
                sizes: splitter_sizes,
                minSize: 200
            })
        }
    }
    else {
        // While destroying the splitter, remember the size ratios so that the
        // watchlist comes up the same percent of the screen when shown again.
        //
        if (splitter) {
            replcontainer.classList.remove("split-horizontal")
            splitter_sizes = splitter.getSizes()
            right_div.style.display = 'none'
            splitter.destroy()
            splitter = undefined
        }
    }

    setTimeout(resolve, 0)
}

watch: function [
    :arg [
        word! get-word! path! get-path!
        block! group!
        integer! tag! refinement!
    ]
        {word to watch or other legal parameter, see documentation)}
][
    ; REFINEMENT!s are treated as instructions.  `watch /on` seems easy...
    ;
    switch arg [
        /on [js-watch-visible true]
        /off [js-watch-visible false]

        fail ["Bad command:" arg]
    ]
]

; !!! The ABOUT command was not made part of the console extension, since
; non-console builds might want to be able to ask it from the command line.
; But it was put in HOST-START and not the mezzanine/help in general.  This
; needs to be rethought, but including ABOUT doing *something* since it is
; mentioned when the console starts up.
;
about: does [
    print [
        {This Rebol is running completely in your browser!  The evaluations}
        {aren't being sent to a remote server--the interpreter is client side!}
        newline newline

        {To accomplish the feat of synchronous I/O you are seeing to do the}
        {console, it's currently having to do some circuitous stuff.  It is}
        {using the "Emterpreter" from the Emscripten project--a bytecode}
        {interpreted by JavaScript, as opposed to running WebAssembly direct.}
        {This means it's bigger and slower than it needs to be, so switching}
        {it over to use another model (e.g. SharedArrayBuffer and pthreads)}
        {is high on the agenda.}
        newline newline

        {Please don't hesitate to submit any improvements, no matter how}
        {small...and come join the discussion on the forum and chat!}
    ]
]

; We don't want a deep stack when reporting errors or running user code.  So
; a rebPromise("main") is run.
;
; !!! Has to be an ADAPT of CONSOLE, for some reason--investigate:
; https://github.com/hostilefork/replpad-js/issues/10
;
main: adapt 'console [
    !! "MAIN executing (this should show in browser console log)"

    replpad-reset

    git: https://github.com/hostilefork/replpad-js/blob/master/replpad.reb
    chat: https://chat.stackoverflow.com/rooms/291/rebol
    forum: https://forum.rebol.info

    replpad-write/note/html spaced [
        {<b><i>Guess what...</i></b> this REPL is actually written in Rebol!}
        {Check out the} unspaced [{<a href="} git {">source on GitHub</a>.}]

        {While the techniques are still in early development, they show a}
        {lot of promise for JavaScript/Rebol interoperability.}

        {Discuss it on} unspaced [{<a href="} chat {">StackOverflow chat</a>}]
        {or join the} unspaced [{<a href="} forum {">Discourse forum</a>.}]

        {<br><br>}

        {<i>(Note: SHIFT-ENTER to type in multi-line code, Ctrl-Z to undo)</i>}
    ]

    ; Fall through to normal CONSOLE loop handling
]
