replpad-git: https://github.com/hostilefork/replpad-js/blob/master/replpad.reb
console-git: https://github.com/metaeducation/ren-c/blob/master/extensions/console/ext-console-init.reb
chat: https://chat.stackoverflow.com/rooms/291/rebol
forum: https://forum.rebol.info

wasm-threads: https://developers.google.com/web/updates/2018/10/wasm-threads
instructions: https://github.com/hostilefork/replpad-js/wiki/Enable-WASM-Threads

link: [href label] -> [
    unspaced [{<a href="} href {" target="_blank">} label {</a>}]
]

intro-note-html: spaced [
    {<div class='note'>}

    {<p>}
    {<b><i>Guess what...</i></b> this REPL is actually written in Rebol!}
    {Check out the} (link replpad-git {bridge to JavaScript})
    {as well as the} unspaced [(link console-git {Console Module}) "."]
    {While the techniques are still in early development, they show a}
    {lot of promise for JavaScript/Rebol interoperability.}
    {Discuss it on the} unspaced [(link forum {Discourse forum}) "."]
    {</p>}

    {<p><i>(Note: SHIFT-ENTER for multi-line code, Ctrl-Z to undo)</i></p>}
    {</div>}
]

greeting-text:
{Welcome to Rebol.  For more information please type in the commands below:

  help    - For starting information
  about   - Information about your Rebol
  redbol  - Experimental emulation of Rebol2/Red conventions}


; We don't want a deep stack when reporting errors or running user code.  So
; a reb.Promise("main") is run.  (If we called CONSOLE from inside main, then
; it would look like MAIN>CONSOLE in the stack...or worse, if the call was
; inside an IF, etc.)
;
; !!! Has to be an ADAPT of CONSOLE, for some reason--investigate:
; https://github.com/hostilefork/replpad-js/issues/10
;
main: adapt :console [
    !! "MAIN executing (this should show in browser console log)"

    clear-screen  ; clears the progress messages displayed during load

    ; Note: There is a URLSearchParams() object we could use to parse the
    ; search location as well (may not be in all browsers?)
    ;
    autorun: _
    parse system/options/args [any [
        start: here

        ; local, remote, tracing_on, git_commit not passed through by the
        ; %load-r3.js for easier processing.

        'do: set autorun text!
    ] end] else [
        print ["** Bad `window.location.search` string in page URL"]
        print mold system/options/args
        print newline
        print trim/auto mutable {
            OPTIONS ARE:

            ?do=scriptname

            DEBUG OPTIONS ARE:

            ?local
            ?remote
            ?tracing_on
            ?git_commit=<shorthash>

            They may be combined together, e.g.:

            ?local&do=scriptname
        }
        return 1
    ]

    if autorun [  ; `?do=foo` suppresses banner and runs `do <foo>`
        result: do as tag! autorun  ; may be VOID!

        ; !!! Right now, all modules return void.  This is a limitation of
        ; having DO be based on IMPORT:
        ;
        ; https://github.com/rebol/rebol-issues/issues/2373
        ;
        ; So if *any* modules require falling through to the console, we have
        ; to make all of them do it.  This should be revisited, but for now
        ; any script that isn't supposed to drop to the console should never
        ; terminate.
        ;
        comment [if result = ... [return 0]]
    ]
    else [
        replpad-write/html intro-note-html
    ]

    ; Fall through to normal CONSOLE loop handling, but use a skin that
    ; gives a custom message (other customizations could be done here,
    ; prompt/etc., and it's hoped the tutorial itself would be done with
    ; such hooks)

    skin: make console! compose [  ; /SKIN is a refinement to CONSOLE
        ((either autorun [
            [print-greeting: does []]
        ][
            [greeting: greeting-text]
        ]))

        print-halted: meth [] [
            print "[interrupted by Escape key or HALT instruction]"
        ]
    ]
]


; Having QUIT exit the interpreter can be useful in some debug builds which
; check various balances of state.
; https://github.com/hostilefork/replpad-js/issues/17
;
quit: adapt copy :lib/quit [
    replpad-write/html spaced [
        {<div class='note'>}
        {<p><b><i>Sorry to see you go...</i></b></p>}

        {<p><a href=".">click to restart interpreter</a></p>}
        </div>
    ]

    ; Fall through to normal QUIT handling
]


