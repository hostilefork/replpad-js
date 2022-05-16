Rebol [
    File: %main.reb

    Type: module
    Name: Main

    ; Things labeled with EXPORT in this module are IMPORT-ed to the user
    ; context due to inclusion in the %index.html via the <script> tag.
    ; They will not be added to LIB, but will be available in the console.
    ; That makes it nice for things like ABOUT and REDBOL, and the tricky
    ; WATCH loader command.
    ;
    ; If a module or script wishes to do something like add watches to
    ; variables, it should include <watchlist> itself, as opposed to trying
    ; to call things that were imported into the user context.
    ;
    ; It also exports MAIN, which isn't something the user should see.  A
    ; way should be figured out to remove its visibility.

    Description: {
        Over the long run, the desire would be that the ReplPad console could
        be a kind of "widget" that could be used in applications that had
        their own notion of a main loop.  Or multiple instances of the
        ReplPad, for instance, in a windowed environment like Golden Layouts:

          https://golden-layout.com/

        It's a long road to get to that point; but as a first step in
        separation the %main.reb is a distinct file from the %replpad.reb.
        The separation is mostly symbolic--as the two files are tightly
        coupled at the moment.  But having them separate lets us start
        thinking about what's part of the widget and what's part of this
        particular usage of the widget.

        The introduction text is a good example of something not all usages
        would want, so that goes here as a start.
    }
]

; We don't just IMPORT the ReplPad definitions for things like NOW and WAIT
; into this module.  Instead we use IMPORT* to put the definitions into lib.
; This makes them available to any script that's loaded.  Review.
;
sys.import* lib %replpad.reb

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

  HELP    - For starting information
  ABOUT   - Information about your Rebol
  REDBOL  - Experimental emulation of Rebol2/Red conventions}


; We don't want a deep stack when reporting errors or running user code.  So
; a reb.Promise("main") is run.  (If we called CONSOLE from inside main, then
; it would look like MAIN>CONSOLE in the stack...or worse, if the call was
; inside an IF, etc.)
;
; !!! Has to be an ADAPT of CONSOLE, for some reason--investigate:
; https://github.com/hostilefork/replpad-js/issues/10
;
export main: adapt :console [
    !! "MAIN executing (this should show in browser console log)"

    clear-screen  ; clears the progress messages displayed during load

    ; Note: There is a URLSearchParams() object we could use to parse the
    ; search location as well (may not be in all browsers?)
    ;
    autorun: _
    uparse system.options.args [while [
        start: <here>
        ||
        ; local, remote, tracing_on, git_commit not passed through by the
        ; %load-r3.js for easier processing.

        ['do:] autorun: text! (importing: false)
            |
        ['import:] autorun: text! (importing: true)
    ]] else [
        print ["** Bad `window.location.search` string in page URL"]
        print mold system.options.args
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
        ;
        ; !!! @gchiu wants to suppress the loading information for dependent
        ; modules, as well as not show any output from the import itself.
        ; While it seems like a reasonable default when running scripts in
        ; "release mode", a more holistic story for this is needed.
        ;
        ; https://forum.rebol.info/t/1801
        ;
        sys.script-pre-load-hook: _   ; !!! Would BLANK! allow no-op APPLY

        if importing [
            ;
            ; !!! There's a lot of nuance involved in "adding commands to the
            ; console", because it straddles the line between being a script
            ; and a module.  We have to do some hacking here to push the
            ; module exports from inside this %main.reb module out to where
            ; the console can see them.  Think through this more!
            ;
            ; https://forum.rebol.info/t/1802

            result: import as tag! autorun
            sys.import* system.contexts.user result
        ]
        else [
            result: do as tag! autorun  ; may be BAD-WORD!
        ]

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


=== ABOUT COMMAND ===

; !!! The ABOUT command was not made part of the console extension, since
; non-console builds might want to be able to ask it from the command line.
; But it was put in HOST-START and not the mezzanine/help in general.  This
; needs to be rethought, but including ABOUT doing *something* since it is
; mentioned when the console starts up.

export about: does [
    print [
        {This Rebol is running completely in your browser!  The evaluations}
        {aren't being sent to a remote server--the interpreter is client side!}
        newline newline

        {Please don't hesitate to submit any improvements, no matter how}
        {small...and come join the discussion on the forum and chat!}
    ]
]


=== WATCHLIST STUB (INVOKES MODULE ON FIRST RUN) ===

; We don't want to pay for loading the watchlist unless it's used.  Do a
; delayed-load that waits for the first use.
;
; Note: When it was being automatically loaded, it was observed that it
; could not be loaded before REPLPAD-WRITE/HTML.  Investigate.

export watch: func [:arg] [
    print "Loading watchlist extension for first use..."
    do %watchlist/main.reb
    let watch: :system.modules.Watchlist.watch
    system.contexts.user.watch: :watch

    ; !!! Watch hard quotes its argument...need some kind of variadic
    ; re-triggering mechanism (e.g. this WATCH shouldn't have any arguments,
    ; but be able to inline WATCH to gather args)
    ;
    do compose [watch (:arg)]
]


=== COMMAND FOR INVOKING REDBOL (Rebol2/Red Emulation) ===

export redbol: func [return: <none>] [
    print delimit LF [
        ""
        "Ren-C has many changes (e.g. replacing TYPE? with TYPE OF, where"
        "OF is an infix version of REFLECT that quotes its left argument to"
        "get the property to reflect!)  But nearly all of these changes can be"
        "'skinned' to provide alternative behaviors--including the old ones!"
        ""
        "REDBOL is an experimental emulation of Rebol2/Red conventions.  It"
        "uses module isolation so emulated code can run side-by-side with"
        "new code.  Scripts that wish to use it should `import @redbol`."
        "(But you just ran the REDBOL command which applies the change"
        "irreversibly to the console context, just for trying it out.)"
        ""
        "Note: Redbol PARSE is particularly slow right now because it's all"
        "usermode.  That will change as the parser-combinator-based 'UPARSE'"
        "is hardened into be the design for native PARSE.  Stay tuned."
        ""
        "Discuss this experiment on the forum--and help if you can!"
    ]
    print "Fetching %redbol.reb from GitHub..."

    ; !!! If we do just `import @redbol` here we will import it to this main
    ; (which will mess things up).  We want it to go to the user context.  This
    ; is a somewhat sloppy command...people should be doing their own imports.
    ; But it's just to demonstrate.
    ;
    sys.import* system.contexts.user @redbol

    system.console.prompt: "redbol>>"
]


=== OVERRIDE QUIT IN LIB ===

; Having QUIT exit the interpreter can be useful in some debug builds which
; check various balances of state.
; https://github.com/hostilefork/replpad-js/issues/17
;
; This is an overwrite of LIB's quit.  It's not clear where the right place
; for this is (should it be in %replpad.reb?) or what hook to use.  Put it
; here for now, as it seems different embeddings of the console might want
; to do different things when quitting.

lib.quit: adapt copy :lib.quit [
    replpad-write/html spaced [
        {<div class='note'>}
        {<p><b><i>Sorry to see you go...</i></b></p>}

        {<p><a href=".">click to restart interpreter</a></p>}
        </div>
    ]

    ; Fall through to normal QUIT handling
]
