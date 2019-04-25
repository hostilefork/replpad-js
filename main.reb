replpad-git: https://github.com/hostilefork/replpad-js/blob/master/replpad.reb
console-git: https://github.com/metaeducation/ren-c/blob/master/extensions/console/ext-console-init.reb
chat: https://chat.stackoverflow.com/rooms/291/rebol
forum: https://forum.rebol.info

wasm-threads: https://developers.google.com/web/updates/2018/10/wasm-threads
instructions: https://github.com/hostilefork/replpad-js/wiki/Enable-WASM-Threads

link: [href label] => [
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
    {Discuss it on} (link chat {StackOverflow chat})
    {or join the} unspaced [(link forum {Discourse forum}) "."]
    {</p>}

    {<p><i>(Note: SHIFT-ENTER for multi-line code, Ctrl-Z to undo)</i></p>}
    {</div>}
]

greeting-text:
{Welcome to Rebol.  For more information please type in the commands below:

  HELP    - For starting information
  ABOUT   - Information about your Rebol
  REDBOL  - Experimental emulation of Rebol2/Red conventions}

emterpreter-warning-html: spaced [
    {<div>}
    {<p>!!! Heads Up 😮 !!!  Your browser is <i>not</i> configured for}
    unspaced [(link wasm-threads {WebAssembly with Threads}) "."</p>]

    {<p>Threads are used so side-effects like this PRINT statement show}
    {in the web browser without having to terminate the Rebol stack.}
    {What you're using now is a VERY slow and kludgey workaround.</p>}

    {<p>To run at speeds up to 30x faster, enable SharedArrayBuffer}
    {and WASM threads:} (link instructions {<b>INSTRUCTIONS HERE</b>}</p>)

    {<hr>}
    {<br>}
    {</div>}
]

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
        set/any 'result: do as tag! autorun

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

        if system/version = 2.102.0.16.1 [
            replpad-write/html emterpreter-warning-html
        ]
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

        print-halted: method [] [
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


