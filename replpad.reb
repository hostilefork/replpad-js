Rebol [
    File: %replpad.reb
    Summary: "Read-Eval-Print-Loop implementation and JavaScript interop"
    Project: "JavaScript REPLpad for Ren-C branch of Rebol 3"
    Homepage: https://github.com/hostilefork/replpad-js/

    Type: Module
    Name: ReplPad  ; !!! seems needed to get into system/modules list
    Options: [isolate]  ; user redefinitions of IF, etc. can't break the REPL!

    Rights: {
        Copyright (c) 2018-2021 hostilefork.com
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

        HOWEVER--!--the *near-term* (2021) goal for this project is to improve
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


=== {REPLPAD CONSOLE OUTPUT (step 1)} ===

; While it's nice to be able to use PRINT statements to debug, the JS console
; is a good last resort...and the last resort should be defined right first.

!!: js-native [
    {Temporary debug helper, sends to browser console log instead of replpad}
    message
]{
    console.log(
        "@" + reb.Tick() + ": "
        + reb.Spell("mold", reb.R(reb.Arg('message')))
    )
}

use [
    form-error form-value write-console
][
    form-error: func [error [error!]] [
        unspaced [
            "** " form error/type " Error: " case [
                text? error/message [error/message]
                block? error/message [
                    collect [
                        for-each part error/message [
                            case [
                                text? part [keep part]
                                get-word? part [
                                    keep form get in :error to word! part
                                ]
                            ]
                        ]
                    ]
                ]
            ]
            newline "** Where: " error/where
            newline "** Near: " copy/part mold error/near 80
            newline "** File: " form error/file
            newline "** Line: " form error/line
        ]
    ]

    ; there's still some values that will trip this function up
    form-value: func [value] [
        switch type-of get/any 'value [
            null [
                "<NULL>"
            ]

            bad-word! [
                mold get/any 'value
            ]

            block! [
                spaced value
            ]

            error! [
                form-error :value
            ]

            port! [
                mold value/spec
            ]

            action! [
                spaced [
                    "func"
                    mold spec-of :value
                    switch type-of body-of :value [
                        block! [
                            mold body-of :value
                        ]

                        ({[^/    ... native ...^/]})
                    ]
                ]
            ]

            (form get/any 'value)
        ]
    ]

    write-console: js-awaiter [
        return: []
        type [text!]
        value [any-value!]
    ] {
        let type = reb.ArgR('type')
        let value = reb.ArgR('value')

        console[reb.Spell(type)](
            reb.Spell(value)
        )
    }

    sys/make-scheme [
        title: "Console.log Scheme"
        name: 'log

        init: func [port][
            port/spec/path: form find/match port/spec/ref log::
            assert [find ["info" "log" "warn" "error"] port/spec/path]
        ]

        actor: make object! [
            write: append: func [port value] [
                write-console port/spec/path form-value get/any 'value
                port
            ]
        ]
    ]
]

; establish endpoints for each log type, thus can be invoked using:
; WRITE LOG/INFO "MESSAGE"
; APPEND LOG/ERROR :ERROR
; writing to a log URL will still work from any context

log: collect [
    for-each endpoint [info log warn error] [
        keep endpoint
        keep make port! join copy log:: form endpoint
    ]
]


=== {REPLPAD CONSOLE OUTPUT (step 2)} ===

; Next we define basic output to the ReplPad, which empowers conventional
; PRINT.  This way non-JavaScript-aware Rebol code that has PRINT statements
; in it can show output.

cls: clear-screen: js-awaiter [
    {Clear contents of the browser window}
    return: []
]{
    replpad.innerHTML = ""

    // The output strategy for plain lines (a la PRINT) is to merge content
    // into the last div, until a newline is seen.  Originally this was kicked
    // off here with an empty line...but that meant leaving an empty line at
    // the top if the first thing inserted was a non-line <div> (e.g. a "Note")
    // So we now defer adding that first line until it is needed.

    return reb.None()  // tells console to suppress result
}

replpad-write-js: js-awaiter [
    {Output lines of text to the REPLPAD (no automatic newline after)}

    return: [<opt> bad-word!]
    param [<blank> text!]
    /html
]{
    let param = reb.Spell(reb.ArgR('param'))
    if (param == "")
        return reb.None()  // no-op if content is empty

    let html = reb.DidQ(reb.ArgR('html'))

    if (html) {
        replpad.insertAdjacentHTML('beforeend', param)
        return reb.None()
    }

    let line = replpad.lastChild  // want to add to last div *if* it's a "line"
    if (!line || line.className != 'line') {
        line = load("<div class='line'></div>")
        replpad.appendChild(line)
    }

    // We want each line in its own `<div>`.  Split string into lines first,
    // otherwise the `\n` gets translated into `<br>`.  Note that splitting a
    // string of just "\n" will give ["", ""].
    //
    // Each newline means making a new div, but if there's no newline (e.g.
    // only "one piece") then no divs will be added to the one we have
    // ensured already exists.
    //
    let pieces = param.split("\n")

    // Add each line to the current line, if not the last line then add a
    // new line
    //
    while (pieces.length > 1) {
        line.innerHTML += pieces.shift() + "\n"  // shift() is like Rebol's TAKE
        line = load("<div class='line'></div>")
        replpad.appendChild(line)
    }

    line.innerHTML += pieces.shift()
    return reb.None()
}

; There are several issues with escaping to be considered in trying to write
; console strings to a browser. If you want the console text to be boring, it
; is less of a problem...but if you might want hyperlinks or color, then it
; gets more complex.
;
; It's tempting to use the browser's knowledge of how to escape:
;
;     let escaper = document.createElement('p')
;     escaper.innerText = pre_escaped_stuff  // e.g. "<my-tag>"
;     post_escaped_stuff = escaper.innerHTML  // e.g. &lt;my-tag&gt;
;
; However, if one wants to do any interesting post-processing (like making
; links clickable) it has to be done after this, or `<a href="...">` would be
; escaped if done earlier.  We don't want to write any of that in JavaScript,
; and don't want to pay the performance cost of turning the JS-escaped lines
; back into a BLOCK! of Rebol strings just to apply post-processing.  So
; we implement the escaping ourselves.
;
replpad-write: func [
    {Output a string of text to the REPLPAD (no automatic newline after)}

    return: [<opt> bad-word!]
    param [<blank> text!]
    /html
][
    if html [
        replpad-write-js/html param
        return none
    ]

    ; Since we aren't using <pre> or a <textarea>, this initially had some
    ; laborious logic for transforming spaces to `&nbsp;`...because the div
    ; was collapsing it otherwise.  It was more complex than even this:
    ;
    ; https://stackoverflow.com/a/20134195
    ;
    ; That turned out to all be unnecessary due to the CSS `white-space`
    ; attribute:
    ;
    ; https://developer.mozilla.org/en-US/docs/Web/CSS/white-space

    let url-rule: [
        "http" opt "s" ":" to ["]" | ")" | {"} | "'" | space | end]
    ]

    let url: '~void~
    parse param: copy param [
        while [
            change '< "&lt;"
            | change '> "&gt;"
            | change '& "&amp;"

            ; Make all URL!s printed in the output show as clickable.
            ;
            | change [copy url url-rule] (
                unspaced [{<a href='} url {'>} url {</a>}]
            )

            ; This is a little tweak for the bridge code.  There should be
            ; some sort of post-processing hook for this, vs. hardcoding it.
            ;
            | change '♣ {<span class='club'>♣</span>}
            | change '♦ {<span class='diamond'>♦</span>}
            | change '♥ {<span class='heart'>♥</span>}
            | change '♠ {<span class='spade'>♠</span>}

            | skip
        ]
    ]

    replpad-write-js param
]

write-stdout: func [
    {Writes just text to the ReplPad}
    text [text! char!]
    /html
][
    if char? text [text: my to-text]
    replpad-write/(html) text
]

print: func [
    {Helper that writes data and a newline to the ReplPad}
    return: [<opt> bad-word!]
    line [<blank> text! block! char!]
    /html
][
    if char? line [
        if line <> newline [fail "PRINT only supports CHAR! of newline"]
        return write-stdout newline
    ]

    (write-stdout/(html) try spaced line) then [write-stdout newline]
]

read-line: js-awaiter [
    {Read single-line or multi-line input from the user}
    return: [text!]
]{
    // The current prompt is always the last child in the last "line" div
    //
    let prompt = replpad.lastChild.lastChild

    // The prompt is always a text node, and so we need to create a HTML
    // version of it to be able to adjust its layout next to the input.
    //
    var prompt_html = document.createElement("span")
    prompt_html.innerHTML = prompt.textContent
    prompt_html.className = "input-prompt"

    let new_input = load("<span class='input'></span>")

    // Add a container to place the prompt and input into.  This allows us to
    // adjust the width the input takes without making it drop to a new line.
    //
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
        input_resolve = function(js_text) {
            //
            // We make the resolve take a JavaScript string for convenience.
            //
            resolve(reb.Text(js_text))
        }
    })
}


=== {ENABLE HTTPS READ FROM CORS-FRIENDLY URLs (step 3)} ===

; In order to modularize the code into separate .reb files, we need to be able
; to DO those files.  That requires setting up a scheme for reading `http://`
; URLs via the JavaScript fetch() API.  Once this is done, other components
; can live in their own modules instead of growing this file indefinitely.
;
; NOTE: Gitlab URLs are adjusted at the port level; this is to get the CORS
; interface of the same data which was requested in a non-CORS fashion at the
; original URL.  Don't confuse this with adjust-url-for-raw, which gives you
; the adjustments removing the various HTML decorations that are known to be
; not what you meant *if* you're using DO (plain READ might have wanted them).

CORSify-gitlab-port: func [
    return: [port!]
    port [port!]
    <local> user repo branch file_path
][
    ; While raw.github.com links are offered via CORS, raw gitlab.com links
    ; (specified by a /raw/ in their URL) are not.  However, GitLab offers CORS
    ; via an API...so for our GitLab open source brothers & sisters we level
    ; the playing field by simulating raw url fetch() via API.
    ;
    ; (At the DO level, the "/blob" links to decorated HTML are proxied in both
    ; cases, since you presumably weren't DO'ing HTML...though you could have
    ; been trying to READ it)
    ;
    ; !!! Gitlab raw links started having an optional /-/ segment:
    ;
    ; https://gitlab.com/Zhaoshirong/nzpower/raw/master/nzpower.reb
    ; https://gitlab.com/Zhaoshirong/docx-templating/-/raw/master/gmdocx.reb
    ;
    ; TBD: research what that is and what the rule is on its appearance or not.

    assert [port/spec/host = "gitlab.com"]

    parse port/spec/path [
        "/"
        copy user: to "/" skip
        copy repo: to "/" skip
        [opt "-/"]  ; TBD: figure out what this is for, but skip for now
        "raw/" copy branch: to "/" skip  ; skip slash, file_path would %-encode
        copy file_path: to end
    ] then [
        ; https://docs.gitlab.com/ee/api/repository_files.html#get-file-from-repository

        replace/all file_path "/" "%2F"  ; API uses slashes for its delimiting

        if port/spec/scheme = 'http [
            port/spec/scheme: 'https
            write log:type=warn ["Converting non-HTTPS URL to HTTPS:" url]
        ]

        port/spec/path: join-all [
            "/api/v4/projects/"
            user "%2F" repo  ; surrogate for numeric id, use escaped `/`
            "/repository/files/" file_path "/raw?ref=" branch
        ]
    ]

    port
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

sys/make-scheme [
    title: "In-Browser HTTP Scheme"
    name: 'http

    actor: [
        ; could potentially fold in JS-HEAD around an INFO? wrapper

        read: func [port] [
            if port/spec/host = "gitlab.com" [
                CORSify-gitlab-port port
            ]

            read-url-helper unspaced [
                form port/spec/scheme "://" port/spec/host
                    if in port/spec 'port-id [unspaced [":" port/spec/port-id]]
                    port/spec/path
            ]
        ]

        write: func [port data] [
            fail [
                {WRITE is not supported in the web console yet, due to the browser's}
                {imposition of a security model (e.g. no local filesystem access).}
                {Features may be added in a more limited sense, for doing HTTP POST}
                {in form submissions.  Get involved if you know how!}
            ]
        ]
    ]
]

sys/make-scheme [
    title: "In-Browser HTTPS Scheme"
    name: 'https

    actor: [
        read: func [port] [
            if port/spec/host = "gitlab.com" [
                CORSify-gitlab-port port
            ]

            read-url-helper unspaced [
                form port/spec/scheme "://" port/spec/host port/spec/path
            ]
        ]

        write: func [port data] [
            fail [
                {WRITE is not yet supported, due to the browser's imposition}
                {of a security model (e.g. no local filesystem access).}
                {Features may be added in a more limited sense, for doing HTTP}
                {POST in form submissions.  Get involved if you know how!}
            ]
        ]
    ]
]

; File schemes permit relative file access to HTTP(S) resources

sys/make-scheme [
    title: "File Access"
    name: 'file

    init: func [port [port!]] [
        case [
            not all [
                in port/spec 'ref
                file? port/spec/ref
            ][
                ; port has been invoked using BLOCK! or FILE:// URL!
                fail "File scheme is only accessible through the FILE! datatype"
            ]

            equal? #"/" last port/spec/ref [
                fail "File scheme only accesses files, not folders"
            ]
        ]

        switch type-of port/spec/ref: clean-path port/spec/ref [
            file! [
                fail "No filesystem currently installed"
            ]

            url! [
                ; possibly some kind of check here to ensure a scheme exists
                ; and convert to FILE! if using FILE:// notation
            ]

            (fail "Cannot resolve file")
        ]
    ]

    actor: [
        read: func [port] [
            switch type-of port/spec/ref [
                file! []

                url! [
                    read port/spec/ref
                ]
            ]
        ]

        write: func [port data] [
            switch type-of port/spec/ref [
                file! []

                url! [
                    write port/spec/ref data
                ]
            ]
        ]

        delete: func [port] [
            switch type-of port/spec/ref [
                file! []

                url! [
                    delete port/spec/ref
                ]
            ]
        ]

        query: func [port] [
            switch type-of port/spec/ref [
                file! []

                url! [
                    query port/spec/ref
                ]
            ]
        ]
    ]
]

sys/make-scheme [
    title: "File Directory Access"
    name: 'dir

    init: func [port [port!]] [
        case [
            not all [
                in port/spec 'ref
                file? port/spec/ref
                ; equal? #"/" first port/spec/ref
            ][
                ; port has been invoked using BLOCK! or DIR:// URL!
                fail "File scheme is only accessible through the FILE! datatype"
            ]

            not equal? #"/" last port/spec/ref [
                fail "Directory scheme only accesses folders, not files"
            ]
        ]


        switch type-of port/spec/ref: clean-path port/spec/ref [
            file! [
                fail "No filesystem currently installed"
            ]

            url! [
                ; possibly some kind of check here to ensure a scheme exists
            ]

            (fail "Cannot resolve file")
        ]
    ]

    actor: [
        read: func [port] [
            switch type-of port/spec/ref [
                file! []

                url! [
                    read port/spec/ref
                ]
            ]
        ]

        delete: func [port] [
            switch type-of port/spec/ref [
                file! []

                url! [
                    delete port/spec/ref
                ]
            ]

        ]

        query: func [port] [
            switch type-of port/spec/ref [
                file! []

                url! [
                    query port/spec/ref
                ]
            ]
        ]
    ]
]


=== {OVERRIDE THE WAY `DO` HANDLES SOME URLS} (step 4) ===

; Some URLs that represent executable code have a HTML presentation layer on
; them.  This is why a GitHub link has a "raw" offering without all that extra
; stuff on it (line numbers, buttons, etc.)
;
; We don't want to hook at the READ level to redirect those UI pages to give
; back the raw data...because you might want to READ and process the UI
; decorations!  But if you ask to DO such a page, it's reasonable to assume
; that what you actually wanted was to DO the raw content implied by it.
;
; This performs that forwarding for GitLab and GitHub UI links.  The JS
; interop routines (like JS-DO and CSS-DO) want the same thing.

adjust-url-for-raw: func [
    return: [<opt> url!]
    url [<blank> url!]
][
    let text: to text! url  ; URL! may become immutable, try thinking ahead

    parse text [
        "http" opt "s" "://gitlab.com/"
        thru "/"  ; user name
        thru "/"  ; repository name
        opt "-/"  ; mystery thing (see remarks on CORSify-gitlab-port)
        change "blob/" "raw/"
        to end
    ] then text -> [
        return as url! text  ; The port will CORSIFY at a lower level
    ]

    ; Adjust a decorated GitHub UI to https://raw.githubusercontent.com
    let start
    parse text [
        "http" opt "s" "://github.com/"
        start: here
        thru "/"  ; user name
        thru "/"  ; repository name
        change "blob/" ""  ; GitHub puts the "raw" in the subdomain name
        to end
    ] then [
        return as url! unspaced [
            https://raw.githubusercontent.com/ start
        ]
    ]

    ; Adjust a Github Gist URL to https://gist.github.com/.../raw/
    parse text [
        "http" opt "s" "://gist.github.com/"
        start: here
        thru "/"  ; user name
        [
            to "#file="
            remove to end  ; ignore the file for now, id does not match filename
            |
            to end
        ]
        insert "/raw/"
    ] then [
        return as url! unspaced [
            https://gist.githubusercontent.com/ start
        ]
        return as url! text
    ]

    return null
]


lib/do: adapt copy :lib/do [
    ;
    ; We go ahead and update LIB's DO directly with an adaptation.  This way,
    ; the Redbol emulation layer keeps the URL interception.
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
    source: maybe switch :source [
        <popupdemo> [https://gitlab.com/hostilefork/popupdemo/raw/master/popupdemo.reb]
        <redbol> [https://raw.githubusercontent.com/metaeducation/ren-c/master/scripts/redbol.reb]
        <test-repl> [%tests/interactive.test.reb]
        <trello> [https://raw.githubusercontent.com/hostilefork/trello-r3web/master/trello.reb]
        <chess> [%create-board.reb]
        <uparse> [https://raw.githubusercontent.com/metaeducation/ren-c/master/scripts/uparse.reb]
    ]

    ; If URL is decorated source (syntax highlighting, etc.) get raw form.
    ;
    source: maybe adjust-url-for-raw try match url! :source
]


=== {JAVASCRIPT AND CSS INTEROPERABILITY (step 5)} ===

; Now that we can DO files, go ahead and import the JS interop.
;
; !!! In the initial conception of how the replpad worked, %js-css-interop.reb
; when passed to DO would be interpreted as a file on the web server (because
; it would be appended onto the current directory).  Switching to use schemes
; is not taking this interpretation.
;
sys/export [  ; no clear way to provide this to the interop otherwise
    adjust-url-for-raw
]
do ensure url! clean-path %js-css-interop.reb


=== STORAGE SCHEME ===

; Import scheme for file:// URLs as interpreted as meaning URL storage.
;
do ensure url! clean-path %js-css-interop.reb

system/contexts/user/change-dir:  ; need to override previously imported value
change-dir: func [
    {Changes the current path (where scripts with relative paths will be run)}
    path [file! url!]
    return: [file! url!]
][
    ; NOTE: The CHANGE-DIR function has to be aware of filesystems, but the
    ; core does not presume any particular filesystem implementation.  However
    ; it does do things like "save and restore the current directory" during
    ; a `DO` of a file in another directory.  What happens is that a stub
    ; CHANGE-DIR is defined and then overridden by the filesystem extension.
    ; But since the web build has no file extension, only the stub is present.
    ;
    ; This adjusts the stub to CLEAN-PATH to expand it fully and remove any
    ; `..` and such before setting the notion of what the "current" directory
    ; is.  That sounds like a step in the right direction, but the general
    ; organization of how these functions fit together needs work.
    ;
    ; Rather than update the stub we leave this override here for now.

    path: clean-path/dir path

    if all [
        file? path
        not exists? path
    ][
        fail "Path does not exist"
    ]

    system/options/current-path: path
]


=== DOWNLOAD SCHEME ===

download: js-native [  ; Method via https://jsfiddle.net/koldev/cW7W5/
    {Triggers a download of data to the user's local disk}

    filename [file!]
    data [text! binary!]
    /mime-type "MIME type (defaults to 'text/plain' or 'octet/stream')"
        [text!]
]{
    let filename = reb.Spell(reb.ArgR('filename'))
    let mime_type = reb.Spell(reb.Q(reb.ArgR('mime-type')))  // may be NULL

    // Blob construction takes *array* of ArrayBuffers (or ArrayBuffer views)
    // It can also include strings in that array.
    //
    let d = reb.Arg('data')
    let blob;
    if (reb.Did("binary?", d)) {
        let uint8_array = reb.Bytes(d)
        blob = new Blob([uint8_array], {type: mime_type || "octet/stream"})
    }
    else {
        let string = reb.Spell(d)
        blob = new Blob([string], {type: mime_type || "text/plain"})
    }
    reb.Release(d)

    let url = window.URL.createObjectURL(blob)

    // Trigger the download by simulating a click on an invisible anchor, with
    // a "download" property supplying the filename.
    //
    var a = document.createElement("a")  // `a` link, as in <a href="...">
    document.body.appendChild(a)
    a.style = "display: none"
    a.href = url
    a.download = filename
    a.click()
    a.parentNode.removeChild(a)

    window.URL.revokeObjectURL(url)
}

; An alternate interface to the DOWNLOAD function
; WRITE DOWNLOADS:///TARGET.TXT "SOME TEXT"

sys/make-scheme [
    title: "Downloads Scheme"
    name: 'downloads

    init: func [port][
        assert [match text! port/spec/path]
        port/spec/path: last split-path port/spec/path
    ]

    actor: [
        write: func [port data][
            download port/spec/path data
            port
        ]
    ]
]


=== {IMPLEMENT `NOW` FUNCTION USING JAVASCRIPT CALLS} ===

; We could use the "Time extension" built for POSIX, because Emscripten will
; emulate those APIs.  But we can interface with JavaScript directly and cut
; out the middleman.
;
; Note MAKE TIME! and MAKE DATE! weren't historically defined to give the
; full granularity NOW needs.  Until a full philosophy for those kinds of
; constructors is articulated, we use MAKE-TIME-SN and MAKE-DATE-YMDSNZ.
;
; !!! Review why a time has to be part of a date to have a time zone (?)

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

    if (reb.DidQ(reb.ArgR('year')))
        return reb.Integer(d.getFullYear())

    if (reb.DidQ(reb.ArgR('month')))
        return reb.Integer(d.getMonth() + 1)  // add 1 because it's 0-11

    if (reb.DidQ(reb.ArgR('day')))
        return reb.Integer(d.getDate())  // "date" (1-31), "day" is weekday

    var seconds = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()
    var nanoseconds = d.getMilliseconds() * 1000000

    if (reb.DidQ(reb.ArgR('time')))
        return reb.ValueQ("make-time-sn",
            reb.I(seconds),
            "try all [",
                reb.ArgR('precise'), reb.I(nanoseconds),
            "]"
        )

    if (reb.DidQ(reb.ArgR('weekday')))
        return reb.Integer(d.getDay() + 1)  // add 1 because it's 0-6

    if (reb.DidQ(reb.ArgR('yearday')))  // !!! not particularly important
        throw ("To implement /YEARDAY: https://stackoverflow.com/a/26426761/")

    // !!! For now, punt on timezone issues
    // https://stackoverflow.com/questions/1091372/

    return reb.ValueQ("ensure date! (make-date-ymdsnz",
        reb.I(d.getFullYear()),  // year
        reb.I(d.getMonth() + 1),  // month (add 1 because it's 0-11)
        reb.I(d.getDate()),  // day
        reb.I(seconds),
        "try all [",
            reb.ArgR('precise'), reb.I(nanoseconds),
        "]",
        "try all [",
            "not", reb.ArgR('local'), reb.I(0),  // zone
        "]",
    ")")
}


=== {PROVIDE CLICKABLE LINK FOR USER TO OPEN IN BROWSER} ===

browse: func [
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
        <div class="browse">
        {Click here: <a href="} url {" target="_blank">} url {</a>}
        </div>
    ]
]


=== {WAIT FUNCTION FOR SLEEPING BASED ON JS setTimeout} ===

wait: js-awaiter [
    {Sleep for the requested number of seconds}
    seconds [integer! decimal!]
]{
    return new Promise(function(resolve, reject) {
        setTimeout(resolve, 1000 * reb.UnboxDecimal(reb.ArgR('seconds')))
    })
}


=== {CLIPBOARD SCHEME} ===

; For security reasons, web applications can't read the clipboard.  But they
; can write to it if you provoke the app with sufficient interactivity.

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

sys/make-scheme [  ; no URL form dictated
    title: "In-Browser Clipboard Scheme"
    name: 'clipboard

    actor: [
        read: func [port] [
            fail {READ is not supported in the web console}
        ]

        write: func [port data] [
            if binary? data [
                data: either invalid-utf8? data [
                    enbase/base data 64
                ][
                    to text! data
                ]
            ]

            copy-to-clipboard-helper form data
            port
        ]
    ]
]

; establish an endpoint for the clipboard, thus can be invoked using
; WRITE CLIPBOARD "CONTENT"
; writing to a clipboard URL will still work from any context

clipboard: make port! clipboard::general


=== {ABOUT COMMAND} ===

; !!! The ABOUT command was not made part of the console extension, since
; non-console builds might want to be able to ask it from the command line.
; But it was put in HOST-START and not the mezzanine/help in general.  This
; needs to be rethought, but including ABOUT doing *something* since it is
; mentioned when the console starts up.

about: does [
    print [
        {This Rebol is running completely in your browser!  The evaluations}
        {aren't being sent to a remote server--the interpreter is client side!}
        newline newline

        {Please don't hesitate to submit any improvements, no matter how}
        {small...and come join the discussion on the forum and chat!}
    ]
]


=== {WATCHLIST STUB (INVOKES MODULE ON FIRST RUN)} ===

; We don't want to pay for loading the watchlist unless it's used.  Do a
; delayed-load that waits for the first use.
;
; Note: When it was being automatically loaded, it was observed that it
; could not be loaded before REPLPAD-WRITE/HTML.  Investigate.

watch: func [:arg] [
    print "Loading watchlist extension for first use..."
    do %watchlist/main.reb
    let watch: :system/modules/Watchlist/watch
    system/contexts/user/watch: :watch

    ; !!! Watch hard quotes its argument...need some kind of variadic
    ; re-triggering mechanism (e.g. this WATCH shouldn't have any arguments,
    ; but be able to inline WATCH to gather args)
    ;
    do compose [watch (:arg)]
]


=== {COMMAND FOR INVOKING REDBOL (Rebol2/Red Emulation)} ===

redbol: func [return: <none>] [
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
        "Note: Redbol PARSE is particularly slow right now because it's all" LF
        "usermode.  That will change as the parser-combinator-based 'UPARSE'" LF
        "is hardened into be the design for native PARSE.  Stay tuned." LF
        LF
        "Discuss this experiment on the chat/forum--and help if you can!" LF
    ]
    print "Fetching %redbol.reb from GitHub..."
    do <redbol>

    system/console/prompt: "redbol>>"
]


=== {EXPORT APPLICABLE ROUTINES TO USER CONTEXT} ===

; All new definitions are by default isolated to the ReplPad module.  This
; appends them to the `user` context.
;
; !!! R3-Alpha's notion of how modules/bindings/etc. interop was basically
; never thought out and demonstrated coherently on any significant project.
; So how this all would ever work correctly is very much up in the air.
;
sys/export [
    !!
    watch
    about
    redbol

    ; !!! These exports appear to overwrite LIB's definitions (e.g. the JS
    ; build does not include the EVENT extension, hence does not have WAIT,
    ; but the wait here seems to appear in both user and lib.)
    ;
    change-dir
    wait
    write-stdout
    print
    read-line
    browse
    download
    now

    ; these are endpoints for objects in ReplPad's environs
    log
    clipboard

    clear-screen  ; not originally exported, but some "apps" are using it
    cls

    replpad-write  ; for clients who want to write HTML, not just PRINT text
]

; !!! Anything the user context has already pulled in before this runs will
; not pick up the updated definitions from lib.  Since DO was used to run this
; module by %load-js.r3, that means the user context still has the old
; definition...regardless of what we push with EXPORT here.  This is a big
; design area that R3-Alpha did not solve, which needs thinking:
;
; https://forum.rebol.info/t/the-real-story-about-user-and-lib-contexts/764
;
; As a workaround for now, manually override the user context's DO
;
system/contexts/user/do: :lib/do
