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
        "@" + reb.Tick() + ": "
        + reb.Spell("form", reb.R(reb.Arg('message')))
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
}


replpad-write: js-awaiter [
    {Print a string of text to the REPLPAD (no newline)}
    param [text!]
    /note "Format with CSS yellow sticky-note class"
    /html
]{
    let param = reb.Spell(reb.ArgR('param'))
    let note = reb.Did(reb.ArgR('note'))
    let html = reb.Did(reb.ArgR('html'))

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

    (write-stdout/(html) try spaced line) then [write-stdout newline]
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
    return new Promise(function(resolve, reject) {
        input_resolve = resolve
    })
}


lib/wait: wait: js-awaiter [
    {Sleep for the requested number of seconds}
    seconds [integer! decimal!]
]{
    return new Promise(function(resolve, reject) {
        setTimeout(resolve, 1000 * reb.UnboxDecimal(reb.ArgR('seconds')))
    })
}


lib/write: write: function [
    source [any-value!]
    data [any-value!]
][
    fail 'source [
        {WRITE is not supported in the web console yet, due to the browser's}
        {imposition of a security model (e.g. no local filesystem access).}
        {Features may be added in a more limited sense, for doing HTTP POST}
        {in form submissions.  Get involved if you know how!}
    ]
]


read-url-helper: js-awaiter [
    return: [binary!]
    url [text!]
]{
    let url = reb.Spell(reb.ArgR('url'))

    let response = await fetch(url)  // can be relative

    // https://www.tjvantoll.com/2015/09/13/fetch-and-errors/
    if (!response.ok)
        throw Error(response.statusText)

    let buffer = await response.arrayBuffer()

    return function () {
        return reb.Binary(buffer)
    }  // if using emterpreter, need callback to use APIs in resolve()
}


; While raw.github.com links are offered via CORS, raw gitlab.com links
; (specified by a /raw/ in their URL) are not.  However, GitLab offers CORS via
; an API...so for our GitLab open source brothers & sisters we level the
; playing field by simulating raw url fetch() via API.
;
; (At the DO level, the "/blob" links to decorated HTML are proxied in both
; cases, since you presumably weren't DO'ing HTML...though you could have been
; trying to READ it)
;
CORSify-if-gitlab-url: function [
    return: [file! url!]
    url [file! url!]
][
    parse url [
        "http" opt ["s" (secure: true) | (secure: false)] "://gitlab.com/"
        copy user: to "/" skip
        copy repo: to "/" skip
        "raw/" copy branch: to "/" skip  ; skip slash, file_path would %-encode
        copy file_path: to end
    ] then [
        ; https://docs.gitlab.com/ee/api/repository_files.html#get-file-from-repository

        replace/all file_path "/" "%2F"  ; API uses slashes for its delimiting

        if not secure [
            print ["Converting non-HTTPS URL to HTTPS:" url]
        ]
        join-all [
            https://gitlab.com/api/v4/projects/
            user "%2F" repo  ; surrogate for numeric id, use escaped `/`
            "/repository/files/" file_path "/raw?ref=" branch
        ]
    ] else [
        url
    ]
]

lib/read: read: function [
    source [any-value!]
][
    if match [file! url!] source [
        return read-url-helper as text! CORSify-if-gitlab-url source
    ]

    fail 'source [{Cannot READ value of type} mold type of source]
]


hijack 'do adapt copy :do [
    ;
    ; !!! A Ren-C convention is to use DO <TAG> as a way of looking up scripts
    ; by name in a registry.  This is an experimental concept (which was in
    ; line with changing DO to always mean "do code you get from a source" and
    ; not something that should just fall through generically such that
    ; DO <TAG> would be <TAG>)
    ;
    ; The tag registry is maintained remotely, but hook with a few exceptions
    ; here to shorten calling demos and get them out of the root directory.
    ;
    source: maybe switch source [
        <popupdemo> [https://gitlab.com/hostilefork/popupdemo/raw/master/popupdemo.reb]
    ]
]


js-do-url-helper: js-awaiter [  ; https://stackoverflow.com/a/14521482
    url [text!]
]{
    let script = document.createElement('script')
    script.src = reb.Spell(reb.ArgR('url'))

    return new Promise(function(resolve, reject) {
        script.onload = function() {
            resolve()  // needs REBVAL, can't accept onload()'s arg directly
        }
        document.head.appendChild(script)
    })
}

js-do: function [
    {Execute a JavaScript file or evaluate a string of JavaScript source}

    return: <void>  ; What useful return result could there be?
    source [text! file! url!]
    /automime "Subvert incorrect server MIME-type by requesting via fetch()"
][
    if text? source [
        eval js-native [] source  ; !!! slightly inefficient, works for now
    ] else [
        if file? source [  ; make absolute w.r.t. *current* script URL location
            source: join (ensure url! what-dir) source
        ]
        if automime [
            eval js-native [] as text! read CORSify-if-gitlab-url source
        ] else [
            js-do-url-helper as text! source
        ]
    ]
]


js-head-helper: js-awaiter [
    return: [object!]
    url [text!]
]{
    let url = reb.Spell(reb.ArgR('url'))

    let response = await fetch(url, {method: 'HEAD'})  // can be relative

    // https://www.tjvantoll.com/2015/09/13/fetch-and-errors/
    if (!response.ok)
        throw Error(response.statusText)

    let headers = response.headers

    return function () {
        let obj = reb.Run("make object! []")
        headers.forEach(function(value, key) {
            reb.Elide(
                "append", obj, "[",
                    reb.R(reb.Run("as set-word!", reb.T(key))),  // !!! reb.V
                    reb.T(value),
                "]"
            )
        })
        return obj
    }  // if using emterpreter, need callback to use APIs in resolve()
}

js-head: function [
    {Perform an HTTP HEAD request of an absolute URL! or relative FILE! path}
    return: "OBJECT! of key=>value response header strings"
        [object!]
    source [url! file!]
][
    either file? source [
        source: unspaced [what-dir source]
    ][
        source: as text! source
    ]
    return js-head-helper source
]


css-do-text-helper: js-native [  ; https://stackoverflow.com/a/707580
    text [text!]
]{
    let css = document.createElement('style')
    /* css.id = ... */  // could be good for no duplicates, deleting later
    css.type = 'text/css'
    css.innerHTML = reb.Spell(reb.ArgR('text'))
    document.head.appendChild(css)
}

css-do-url-helper: js-native [  ; https://stackoverflow.com/a/577002
    url [text!]
]{
    let link = document.createElement('link')
    /* link.id = ... */  // could be good for no duplicates, deleting later
    link.id = 'testing'
    link.rel = 'stylesheet'
    link.type = 'text/css'
    link.href = reb.Spell(reb.ArgR('url'))
    link.media = 'all'
    document.head.appendChild(link)
}

css-do: function [
    {Incorporate a CSS file or a snippet of CSS source into the page}

    return: <void>  ; Could return an auto-generated ID for later removing (?)
    ; :id [<skip> issue!]  ; Idea: what if you could `css-do #id {...}`
    source [text! file! url!]
    /automime "Subvert incorrect server MIME-type by requesting via fetch()"
][
    if text? source [
        css-do-text-helper source
    ] else [
        if file? source [  ; make absolute w.r.t. *current* script URL location
            source: join (ensure url! what-dir) source
        ]
        if automime [
            css-do-text-helper as text! read CORSify-if-gitlab-url source
        ] else [
            css-do-url-helper as text! source
        ]
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
        let url = reb.Spell(rebArgR('url'))

        if (false) {
            let win = window.open(url, '_blank')
            win.focus()
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
    let visible = reb.Did(reb.R(reb.Arg('visible')))

    let right_div = document.getElementById('right')

    // Suggestion from author of split.js is destroy/recreate to hide/show
    // https://github.com/nathancahill/Split.js/issues/120#issuecomment-428050178
    //
    if (visible) {
        if (!splitter) {
            replcontainer.classList.add('split-horizontal')
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
            replcontainer.classList.remove('split-horizontal')
            splitter_sizes = splitter.getSizes()
            right_div.style.display = 'none'
            splitter.destroy()
            splitter = undefined
        }
    }
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

        {Please don't hesitate to submit any improvements, no matter how}
        {small...and come join the discussion on the forum and chat!}
    ]
]

; We don't want a deep stack when reporting errors or running user code.  So
; a reb.Promise("main") is run.
;
; !!! Has to be an ADAPT of CONSOLE, for some reason--investigate:
; https://github.com/hostilefork/replpad-js/issues/10
;
main: adapt 'console [
    !! "MAIN executing (this should show in browser console log)"

    replpad-reset

    replpad-git: https://github.com/hostilefork/replpad-js/blob/master/replpad.reb
    console-git: https://github.com/metaeducation/ren-c/blob/master/src/extensions/console/ext-console-init.reb
    chat: https://chat.stackoverflow.com/rooms/291/rebol
    forum: https://forum.rebol.info

    link: [href label] => [
        unspaced [{<a href="} href {" target="_blank">} label {</a>}]
    ]

    replpad-write/note/html spaced [
        {<b><i>Guess what...</i></b> this REPL is actually written in Rebol!}
        {Check out the} (link replpad-git {bridge to JavaScript})
        {as well as the} unspaced [(link console-git {Console Module}) "."]

        {While the techniques are still in early development, they show a}
        {lot of promise for JavaScript/Rebol interoperability.}

        {Discuss it on} (link chat {StackOverflow chat})
        {or join the} unspaced [(link forum {Discourse forum}) "."]

        {<br><br>}

        {<i>(Note: SHIFT-ENTER to type in multi-line code, Ctrl-Z to undo)</i>}
    ]

    ; Fall through to normal CONSOLE loop handling
]


; Having QUIT exit the interpreter can be useful in some debug builds which
; check various balances of state.
; https://github.com/hostilefork/replpad-js/issues/17
;
hijack 'quit adapt copy :quit [
    replpad-write/note/html spaced [
        {<b><i>Sorry to see you go...</i></b>}

        {<a href=".">click to restart interpreter</a>}
    ]

    ; Fall through to normal QUIT handling
]
