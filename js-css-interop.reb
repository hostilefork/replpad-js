Rebol [
    File: %js-css-interop.reb
    Summary: "Functions for Invoking .js and .css by URL!, TEXT!, or dialect"
    Project: "JavaScript REPLpad for Ren-C branch of Rebol 3"
    Homepage: https://github.com/hostilefork/replpad-js/

    Type: module
    Name: JS-CSS-Interop  ; !!! seems needed to get into system/modules list

    Description: {
        This provides CSS-DO and JS-DO for running .js an .css files off of
        CORS-friendly URLs (or directly as TEXT!).

        JS-DO also has dialect for translating Rebol values into JavaScript
        values directly, without needing to go through strings:

        https://forum.rebol.info/t/js-eval-and-js-do/1504
    }

    Notes: {
        * It would technically be possible for DO to recognize a .js or .css
          file by extension.  But having DO be polymorphic in this way isn't
          necessarily a good idea...and that wouldn't answer how to handle
          direct text that didn't have any extension.

        * These routines aren't written as C in the JavaScript extension, so
          that the experiments can be edited without needing to recompile.
          Should they firm up enough to warrant speedy native implementations,
          then they could be added then.
    }
]


js-do-dialect-helper: func [
    {Allow Rebol to pass API handle values to JS-DO and JS-EVAL}

    return: [text!]
    b [block!]
][
    unspaced collect [
        let keep-transient: func [t /required [word!]] [
            switch type of t [
                meta-word! meta-path! [keep api-transient get t]
                meta-group! [keep api-transient reeval as group! t]

                assert [required]
                fail [required "must have its argument as ^^..., ^^(...)"]
            ]
        ]

        iterate b [
            switch type of b/1 [
                text! [keep b/1]
                group! [keep/only reeval b/1]

                meta-word! meta-path! meta-group! [keep-transient b/1]

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
                    fail ["Unknown JS-DO dialect keyword:" b/1]
                ]]

                fail [
                    {JS-DO dialect supports TEXT!, META-WORD!, META-GROUP!,}
                    {META-PATH!...plus the keywords SPELL and UNBOX}
                ]
            ]
        ]
    ]
]

js-do-url-helper: js-awaiter [  ; https://stackoverflow.com/a/14521482
    {Run JS URL via a <script> tag}

    url [url!] "URL or JavaScript code"
]{
    return new Promise(function(resolve, reject) {
        let script = document.createElement('script')

        script.src = reb.Spell(reb.ArgR('url'))
        script.onload = function() {
            script.parentNode.removeChild(script)  // !!! necessary for GC?
            resolve()  // can't take onload()'s arg directly
        }
        // HTML5 discourages use of .type field to redundantly specify JS

        document.head.appendChild(script)
    })
}

js-do: func [
    {Execute JavaScript file or evaluate a string of JavaScript source}

    return: [<opt> bad-word!]  ; What useful return result could there be?
    source "If BLOCK!, interpreted in JS-DO dialect (substitutes ^^-values)"
        [<blank> block! text! file! url! tag!]
    /automime "Subvert incorrect server MIME-type by requesting via fetch()"
    /local "Run code in a local scope, rather than global"
][
    if tag? source [
        source: join system.script.path as file! source
    ]

    if block? source [source: my js-do-dialect-helper]

    either text? source [
        js-eval*/(if local [/local]) source
    ][
        if file? source [  ; make absolute w.r.t. *current* script URL location
            source: join (ensure url! what-dir) source
        ]

        ; If URL is decorated source (syntax highlighting, etc.) get raw form.
        ;
        source: maybe sys.adjust-url-for-raw source

        any [automime, local] then [
            let code: as text! read source
            js-eval*/(if local [/local]) code
        ] else [
            js-do-url-helper source
        ]
    ]
]

; JS-DO runs scripts by URL and generically does not return an evaluative
; result (and can't, if it uses the `<script>` tag).  So JS-DO of a TEXT! is
; the preferred choice when you're not interested in getting back a result
; from that evaluation...even though it builds on the low-level JS-EVAL*
; functionality.  This higher-level JS-EVAL assumes you want a result back
; vs. the fire-and-forget JS-DO, and supports the JS-DO dialect.
;
js-eval: func [
    {Evaluate JavaScript expression in local environment and return result}

    return: [<opt> bad-word! integer! text!]
    expression "If BLOCK!, interpreted in JS-DO dialect (substitutes ^^-values)"
        [<blank> block! text!]
][
    if block? expression [expression: my js-do-dialect-helper]
    return js-eval*/local/value expression
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
}

js-head: func [
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
    url [url!]
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

css-do: func [
    {Incorporate a CSS file or a snippet of CSS source into the page}

    return: <none>  ; Could return an auto-generated ID for later removing (?)
    ; 'id [<skip> issue!]  ; Idea: what if you could `css-do #id {...}`
    source "TAG! interpreted as relative to currently running script"
        [text! file! url! tag!]
    /automime "Subvert incorrect server MIME-type by requesting via fetch()"
][
    if tag? source [
        source: join system.script.path as file! source
    ]
    if text? source [
        css-do-text-helper source
    ] else [
        if file? source [  ; make absolute w.r.t. *current* script URL location
            source: join (ensure url! what-dir) source
        ]

        ; If URL is decorated source (syntax highlighting, etc.) get raw form.
        ;
        source: maybe sys.adjust-url-for-raw source

        if automime [
            css-do-text-helper as text! read source
        ] else [
            css-do-url-helper source
        ]
    ]
]

export [
    js-do
    js-eval
    css-do
    js-head
]
