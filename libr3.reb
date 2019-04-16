Rebol [
    File: %replpad.reb
    Summary: "Read-Eval-Print-Loop implementation and JavaScript interop"
    Project: "JavaScript REPLpad for Ren-C branch of Rebol 3"
    Homepage: https://github.com/hostilefork/replpad-js/

    Type: Module
    Name: ReplPad  ; !!! seems needed to get into system/modules list
    Options: [isolate]  ; user redefinitions of IF, etc. can't break the REPL!

    Rights: {
        Copyright (c) 2018-2019 hostilefork.com
        See README.md and CREDITS.md for more information
    }

    License: {
        Licensed under the Lesser GPL, Version 3.0 (the "License");
        you may not use this file except in compliance with the License.
        You may obtain a copy of the License at

        https://www.gnu.org/licenses/lgpl-3.0.html
    }

    Description: {
        This file originated as the first .reb code file that was fetch()'d
        over the web and run in a browser.  It has been an ongoing process to
        try and start factoring the reusable bits out of this into some kind
        of library which other programs can use.

        HOWEVER--!--the *near-term* (2020) goal for this project is to improve
        the console itself into an online tutorial and demo for the system.
        This is not to say that making a web framework for arbitrary Ren-C
        programs in WebAssembly isn't interesting.  Just that it is a vast task
        which needs to be approached in a measured way.

        Hence improving the contents of this file and running other programs
        from it using DO is a preferable alternative to trying to factor its
        functionality out too early...
    }

    Notes: {
        * Use `debugger;` for programmatic breakpoints in JavaScript code.

        * This project uses contentEditable on purpose, in order to leave room
          in the future for richer formatting than a TEXTAREA would provide.
          It may seem annoying considering it generally does only monospace
          in the code parts...but that's just one application.
    }
]


!!: js-native [
    {Temporary debug helper, sends to browser console log instead of replpad}
    message
]{
    console.log(
        "@" + reb.Tick() + ": "
        + reb.Spell("spaced", reb.R(reb.Arg('message')))
    )
}


replpad-reset: js-awaiter [
    {Clear contents of the browser window}
]{
    replpad.innerHTML = ""

    // The output strategy for plain lines (a la PRINT) is to merge content
    // into the last div, until a newline is seen.  Originally this was kicked
    // off here with an empty line...but that meant leaving an empty line at
    // the top if the first thing inserted was a non-line <div> (e.g. a "Note")
    // So we now defer adding that first line until it is needed.
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

    if (html && replpad.innerHTML == "<div class='line'>&zwnj;</div>")
        replpad.innerHTML = ""

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

        // If we don't translate the spaces into `&nbsp;` then they'll get
        // collapsed by the div, but we have to do it after the escaping to
        // keep it from literally saying `&nbsp;`
        //
        param = param.replace(/ /gi, "&nbsp;");
    }

    if (note) {
        replpad.appendChild(load(
            "<div class='note'><p>"
            + param  // not escaped, so any TAG!-like things are HTML
            + "</p><div>"
        ))
        return
    }

    let line = replpad.lastChild  // want to add to last div *if* it's a "line"
    if (!line || line.className != 'line') {
        replpad.innerHTML += "<div class='line'>&zwnj;</div>"
        line = replpad.lastChild
    }

    // Split string into pieces.  Note that splitting a string of just "\n"
    // will give ["", ""].
    //
    // Each newline means making a new div, but if there's no newline (e.g.
    // only "one piece") then no divs will be added.
    //
    let pieces = param.split("\n")

    line.innerHTML += pieces.shift()  // Add FIRST line (shift() takes first)

    while (pieces.length)  // Add a div for each remaining line (if any)
        replpad.appendChild(
            load("<div class='line'>&zwnj;" + pieces.shift() + "</div>")
        )
}

write-stdout: function [
    {Writes just text to the ReplPad}
    text [text! char!]
    /html
][
    if char? text [text: my to-text]
    replpad-write/(html) text
]

print: function [
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


input: js-awaiter [
    {Read single-line or multi-line input from the user}
    return: [text!]
]{
    // The current prompt is always the last child in the last "line" div
    let prompt = replpad.lastChild.lastChild

    // The prompt is always a text node, and so we need to create a HTML
    // version of it to be able to adjust its layout next to the input
    var prompt_html = document.createElement("div")
    prompt_html.innerHTML = prompt.textContent
    prompt_html.className = "input-prompt"

    let new_input = load("<div class='input'></div>")

    // Add a container to place the prompt and input into. This will allow us to
    // adjust the width the input takes without causing it to drop to a new line
    var container = document.createElement("div")
    container.className = "input-container"
    container.appendChild(prompt_html)
    container.appendChild(new_input)

    // Add the new container before the old prompt
    prompt.parentNode.insertBefore(container, prompt)

    // Remove the old prompt
    prompt.parentNode.removeChild(prompt)

    ActivateInput(new_input)

    // This body of JavaScript ending isn't enough to return to the Rebol
    // that called REPLPAD-INPUT.  The resolve function must be invoked by
    // JavaScript.  We save it in a global variable so that the page's event
    // callbacks dealing with input can call it when input is finished.
    //
    return new Promise(function(resolve, reject) {
        input_resolve = function(text) {
            //
            // Note that the awaiter is still in effect when this resolve
            // function is called (it hasn't been resolved, hence not finished)
            // This means the emterpreted build still has the bytecode
            // interpreter tied up, so evaluative functions aren't available.
            // reb.Text() is legal, and resolving with a reb.Promise() should
            // also be legal eventually...
            //
            resolve(reb.Text(text))
        }
    })
}


wait: js-awaiter [
    {Sleep for the requested number of seconds}
    seconds [integer! decimal!]
]{
    return new Promise(function(resolve, reject) {
        setTimeout(resolve, 1000 * reb.UnboxDecimal(reb.ArgR('seconds')))
    })
}


copy-to-clipboard-helper: js-native [
    {https://hackernoon.com/copying-text-to-clipboard-with-javascript-df4d4988697f}
    data [any-value!]
]{
    // interface to clipboard is `execCommand` which copies a selection.  We
    // must preserve the current selection, make an invisible text area with
    // the data, select it, run execCommand(), and then restore the selection.
    //
    const el = document.createElement('textarea')
    el.value = reb.Spell(reb.ArgR('data'))
    el.setAttribute('readonly', '')
    el.style.position = 'absolute'
    el.style.left = '-9999px'
    document.body.appendChild(el)
    const selected = document.getSelection().rangeCount > 0
        ? document.getSelection().getRangeAt(0)
        : false
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
    if (selected) {
        document.getSelection().removeAllRanges()
        document.getSelection().addRange(selected)
    }
}

write: function [
    destination [any-value!]
    data [any-value!]
][
    if parse destination ["clipboard:"] [
        copy-to-clipboard-helper data
        return
    ]

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
    return reb.Binary(buffer)
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

read: function [
    source [any-value!]
][
    if match [file! url!] source [
        return read-url-helper as text! CORSify-if-gitlab-url source
    ]

    fail 'source [{Cannot READ value of type} mold type of source]
]


do: adapt copy :lib/do [
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
        <redbol> [https://raw.githubusercontent.com/metaeducation/ren-c/master/scripts/redbol.reb]
    ]
]


js-do-global-helper: js-awaiter [  ; https://stackoverflow.com/a/14521482
    {Run JS code via a <script> tag, effectively making it global in scope}

    source [text!] "URL or JavaScript code"
    /url "If true, source is a URL"
]{
    return new Promise(function(resolve, reject) {
        let script = document.createElement('script')

        let source = reb.Spell(reb.ArgR('source'))
        if (reb.Did(reb.ArgR('url'))) {
            script.src = source
            script.onload = function() {
                script.parentNode.removeChild(script)  // !!! necessary for GC?
                resolve()  // can't take onload()'s arg directly
            }
        }
        else {
            // Loading from a URL will give us an onload() event.  But there's
            // no standard "afterscriptexecute" event for if we are using text.
            // We have to add our resolve call to the code itself somehow.
            //
            // Make up a globally accessible ID for the resolver:
            // https://stackoverflow.com/q/1320568

            let num = Math.floor(Math.random() * 10000000000000001)
            let id = "js_do_global_" + num + "_after"

            let unpoke = new Function("delete window." + id)

            let after = function() {
                script.parentNode.removeChild(script)  // !!! necessary for GC?
                resolve()  // can't take onload()'s arg directly
                unpoke()  // get rid of globally visible resolve handler
            }

            let poke = new Function(
                'after',  // argument
                "window." + id + " = after"  // function body
            )
            poke(after)  // use eval to dynamically name global handler

            // Tack on a call to the global alias for the resolver in the code
            script.innerHTML = source + "\n" + "window." + id + "()\n"
        }
        // HTML5 discourages use of .type field to redundantly specify JS

        document.head.appendChild(script)
    })
}


js-do-dialect-helper: function [
    {Allow Rebol to pass API handle values to JS-DO and JS-EVAL}

    return: [text!]
    b [block!]
][
    unspaced collect [
        keep-transient: function [t /required [word!]] [
            switch type of t [
                sym-word! sym-path! [keep api-transient get t]
                sym-group! [keep api-transient eval as group! t]
                default [
                    assert [required]
                    fail [required "must have its argument as @..., @(...)"]
                ]
            ]
        ]

        iterate b [
            switch type of b/1 [
                text! [keep b/1]
                group! [keep/only eval b/1]

                sym-word! sym-path! sym-group! [keep-transient b/1]

                word! [switch b/1 [
                    'spell [
                        keep "reb.Spell("
                        b: next b
                        keep-transient/required try :b/1 'SPELL
                        keep ")"
                    ]
                    'unbox [
                        keep "reb.Unbox("
                        b: next b
                        keep-transient/required try :b/1 'UNBOX
                        keep ")"
                    ]
                    default [
                        fail ["Unknown JS-DO dialect keyword:" b/1]
                    ]
                ]]

                fail [
                    {JS-DO dialect supports TEXT!, SYM-WORD!, SYM-GROUP!,}
                    {SYM-PATH!...plus the keywords SPELL and UNBOX}
                ]
            ]
        ]
    ]
]

js-do: function [
    {Execute JavaScript file or evaluate a string of JavaScript source}

    return: [<opt> void!]  ; What useful return result could there be?
    source "If BLOCK!, interpreted in JS-DO dialect (substitutes @-values)"
        [<blank> block! text! file! url!]
    /automime "Subvert incorrect server MIME-type by requesting via fetch()"
    /local "Run code in a local scope, rather than global"
][
    if block? source [source: my js-do-dialect-helper]

    either text? source [
        either local [
            eval js-native [] source  ; !!! slightly inefficient, works for now
        ][
            js-do-global-helper source
        ]
    ][
        if file? source [  ; make absolute w.r.t. *current* script URL location
            source: join (ensure url! what-dir) source
        ]
        any [automime local] then [
            code: as text! read CORSify-if-gitlab-url source
            if local [
                eval js-native [] code  ; !!! again, slightly inefficient
            ] else [
                js-do-global-helper code
            ]
        ] else [
            js-do-global-helper/url as text! source
        ]
    ]
]

; Note: In order to accomplish what it does, JS-DO cannot return a result.
; (mechanically it must do things like add a <script> tag, to get global
; evaluative access).  Hence it doesn't try to translate a return value to
; the caller.  This routine wraps expressions in functions and tries to
; return a value.
;
js-eval: function [
    {Evaluate JavaScript expression in local environment and return result}

    return: [<opt> void! integer! text!]
    expression "If BLOCK!, interpreted in JS-DO dialect (substitutes @-values)"
        [<blank> block! text!]
][
    if block? expression [expression: my js-do-dialect-helper]

    eval js-native [] unspaced [{
        let js_eval_ugly_name_so_it_does_not_collide = (} expression {)

        if (null === js_eval_ugly_name_so_it_does_not_collide)
            return null  // bad typeof: https://stackoverflow.com/a/18808270/

        switch (typeof js_eval_ugly_name_so_it_does_not_collide) {
          case 'undefined':
            return reb.Void()

          case 'number':
            return reb.Integer(js_eval_ugly_name_so_it_does_not_collide)

          case 'string':
            return reb.Text(js_eval_ugly_name_so_it_does_not_collide)

          default:
            return reb.Void()
        }
    }]
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
        let obj = reb.Value("make object! []")
        headers.forEach(function(value, key) {
            reb.Elide(
                "append", obj, "[",
                    reb.V("as set-word!", reb.T(key)),
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


; We could use the "Time extension" built for POSIX, because Emscripten will
; emulate those APIs.  But we can interface with JavaScript directly and cut
; out the middleman.
;
now: js-native [
    {Returns current date and time with timezone adjustment}

    /year "Returns year only"
    /month "Returns month only"
    /day "Returns day of the month only"
    /time "Returns time only"
    /zone "Returns time zone offset from UCT (GMT) only"
    /date "Returns date only"
    /weekday "Returns day of the week as integer (Monday is day 1)"
    /yearday "Returns day of the year (Julian)"
    /precise "High precision time"
    /utc "Universal time (zone +0:00)"
    /local "Give time in current zone without including the time zone"
]{
    var d = new Date()

    if (reb.Did(reb.ArgR('year')))
        return reb.Integer(d.getFullYear())

    if (reb.Did(reb.ArgR('month')))
        return reb.Integer(d.getMonth() + 1)  // add 1 because it's 0-11

    if (reb.Did(reb.ArgR('day')))
        return reb.Integer(d.getDate())  // "date" (1-31), "day" is weekday

    if (reb.Did(reb.ArgR('time')))
        return reb.Value(
            "make time! [",
                reb.I(d.getHours()),
                reb.I(d.getMinutes()),
                reb.I(d.getSeconds()),
            "]"
        )

    if (reb.Did(reb.ArgR('weekday')))
        return reb.Integer(d.getDay() + 1)  // add 1 because it's 0-6

    if (reb.Did(reb.ArgR('yearday')))  // !!! not particularly important
        throw ("To implement /YEARDAY: https://stackoverflow.com/a/26426761/")

    // !!! For now, punt on timezone issues
    // https://stackoverflow.com/questions/1091372/

    return reb.Value("ensure date! (make-date-ymdsnz",
        reb.I(d.getFullYear()),  // year
        reb.I(d.getMonth() + 1),  // month (add 1 because it's 0-11)
        reb.I(d.getDate()),  // day
        reb.I(
            d.getHours() * 3600
            + d.getMinutes() * 60
            + d.getSeconds()
        ),  // secs
        "try all [",
            reb.ArgR('precise'), reb.I(d.getMilliseconds() * 1000),  // nano
        "]",
        "try all [",
            "not", reb.ArgR('local'), reb.I(0),  // zone
        "]",
    ")")
}


browse: function [
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

; Having QUIT exit the interpreter can be useful in some debug builds which
; check various balances of state.
; https://github.com/hostilefork/replpad-js/issues/17
;
quit: adapt copy :lib/quit [
    replpad-write/note/html spaced [
        {<b><i>Sorry to see you go...</i></b>}

        {<a href=".">click to restart interpreter</a>}
    ]

    ; Fall through to normal QUIT handling
]


redbol: function [return: <void>] [
    print [
        LF
        "Ren-C has many changes (e.g. replacing TYPE? with TYPE OF, where" LF
        "OF is an infix version of REFLECT that quotes its left argument to" LF
        "get the property to reflect!)  Not *all* changes can be easily" LF
        "'skinned' to provide old behavior, but many (most?) of them can." LF
        LF
        "REDBOL is a very experimental Rebol2 emulation.  Eventually it" LF
        "will use module isolation so emulated code runs side-by-side with" LF
        "new code.  But for today, it's an irreversible change to the user" LF
        "context...so you will have to reload the page to get Ren-C back." LF
        LF
        "Discuss this experiment on the chat/forum--and help if you can!" LF
    ]
    print "Fetching %redbol.reb from GitHub..."
    do <redbol>

    system/console/prompt: "redbol>>"
]


; !!! Being able to annotate declarations with `export` at their point of
; declaration is a planned module feature.  But currently they must be in the
; header or done like this.
;
sys/export [
    !!
    js-do
    js-eval
    css-do
    js-head
    redbol

    ; !!! These exports appear to overwrite LIB's definitions (e.g. the JS
    ; build does not include the EVENT extension, hence does not have WAIT,
    ; but the wait here seems to appear in both user and lib.)
    ;
    wait
    write-stdout
    print
    input
    read
    write
    do
    browse
    now
    quit

    replpad-reset  ; not originally exported, but some "apps" are using it
    replpad-write  ; for clients who want to write HTML, not just PRINT text
]
