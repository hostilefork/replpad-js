; We don't want a deep stack when reporting errors or running user code.  So
; a reb.Promise("main") is run.  (If we called CONSOLE from inside main, then
; it would look like MAIN>CONSOLE in the stack...or worse, if the call was
; inside an IF, etc.)
;
; !!! Has to be an ADAPT of CONSOLE, for some reason--investigate:
; https://github.com/hostilefork/replpad-js/issues/10
;
main: adapt 'console [
    !! "MAIN executing (this should show in browser console log)"

    replpad-reset  ; clears the progress messages displayed during load

    ; Note: There is a URLSearchParams() object we could use to parse the
    ; search location as well (may not be in all browsers?)
    ;
    search: js-eval "window.location.search"
    autorun: _
    parse search [
        any ["?" [
            ["do=" copy autorun: to ["?" | end]]
            | ["local"]  ; instruction to %load-r3.js, already had effect
        ]]
        end
    ] else [
        print ["** Bad `window.location.search` string in page URL:" search]
        print newline
        print trim/auto mutable {
            OPTIONS ARE:

            ?local
            ?do=scriptname

            They may be combined together, e.g.:

            ?local?do=scriptname
        }
        return 1
    ]

    if autorun [  ; `?do=foo` suppresses banner and runs `do <foo>`
        do as tag! autorun
        return 0  ; never actually fall through to console, so no REPL session
    ]

    replpad-git: https://github.com/hostilefork/replpad-js/blob/master/replpad.reb
    console-git: https://github.com/metaeducation/ren-c/blob/master/extensions/console/ext-console-init.reb
    chat: https://chat.stackoverflow.com/rooms/291/rebol
    forum: https://forum.rebol.info

    wasm-threads: https://developers.google.com/web/updates/2018/10/wasm-threads
    instructions: https://github.com/hostilefork/replpad-js/wiki/Enable-WASM-Threads

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

    if system/version = 2.102.0.16.1 [
        replpad-write/html spaced [
            {!!! Heads Up 😮 !!!  Your browser is <i>not</i> configured for}
            unspaced [(link wasm-threads {WebAssembly with Threads}) "."]

            {Threads are used so side-effects like this PRINT statement show}
            {in the web browser without having to terminate the Rebol stack.}
            {What you're using now is a VERY slow and kludgey workaround.}

            {<br><br>}

            {To run at speeds up to 30x faster, enable SharedArrayBuffer}
            {and WASM threads:} (link instructions {<b>INSTRUCTIONS HERE</b>})

            {<hr>}
            {<br>}
        ]
    ]

    ; Fall through to normal CONSOLE loop handling, but use a skin that gives
    ; a custom message (other customizations could be done here, prompt/etc.,
    ; and it's hoped the tutorial itself would be done with such hooks)

    skin: make console! [  ; /SKIN is a refinement to CONSOLE
        greeting:
{Welcome to Rebol.  For more information please type in the commands below:

  HELP    - For starting information
  ABOUT   - Information about your Rebol
  REDBOL  - Experimental emulation of Rebol2/Red conventions}

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


watch: function [:arg] [
    ;
    ; We don't want to pay for loading the watchlist unless it's used.  So
    ; delayed-load it on first use.
    ;
    ; Note: When it was being automatically loaded, it was observed that it
    ; could not be loaded before REPLPAD-WRITE/HTML.  Investigate.
    ;
    print "Loading watchlist extension for first use..."
    do %watchlist/main.reb
    watch: :system/modules/Watchlist/watch
    system/contexts/user/watch: :watch

    ; !!! Watch hard quotes its argument...need some kind of variadic
    ; re-triggering mechanism (e.g. this WATCH shouldn't have any arguments,
    ; but be able to inline WATCH to gather args)
    ;
    do compose [watch (:arg)]
]


