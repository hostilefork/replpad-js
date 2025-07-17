Rebol [
    file: %main.reb

    type: module
    name: Main

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

    description: --[
        The ReplPad console is a "widget" that tries to have few dependencies,
        but can be integrated into bulkier contexts.  One of those is as a
        panel in Golden Layouts:

          https://golden-layout.com/

        Hence this %main.reb file is an attempt at separating functionality
        for containers from the %replpad.reb.

        The introduction text is a good example of something not all usages
        would want, so that's an example of something that belongs here.
    ]--
]

replpad-dir: what-dir  ; %load-r3.js sets directory to URL bar path by default

; We don't just IMPORT the ReplPad definitions for things like NOW and WAIT
; into this module.  Instead we use IMPORT* to put the definitions into lib.
; This makes them available to any script that's loaded.  Review.
;
sys.util/import* lib %replpad.reb

replpad-git: https://github.com/hostilefork/replpad-js/blob/master/replpad.reb
console-git: https://github.com/metaeducation/ren-c/blob/master/extensions/console/ext-console-init.reb
chat: https://chat.stackoverflow.com/rooms/291/rebol
forum: https://forum.rebol.info

wasm-threads: https://developers.google.com/web/updates/2018/10/wasm-threads
instructions: https://github.com/hostilefork/replpad-js/wiki/Enable-WASM-Threads

link: [href label] -> [
    unspaced [--[<a href=']-- href --[' target='_blank'>]-- label --[</a>]--]
]

intro-note-html: spaced [
    "<div class='note'>"

    "<p>"
    "<b><i>Guess what...</i></b> this REPL is actually written in Rebol!"
    "Check out the" (link replpad-git "bridge to JavaScript")
    "as well as the" unspaced [(link console-git "Console Module") "."]
    "While the techniques are still in early development, they show a"
    "lot of promise for JavaScript/Rebol interoperability."
    "Discuss it on the" unspaced [(link forum "Discourse forum") "."]
    "</p>"

    "<p><i>(Note: SHIFT-ENTER for multi-line code, Ctrl-Z to undo)</i></p>"
    "</div>"
]

greeting-text:
--[Welcome to Rebol.  For more information please type in the commands below:

  HELP    - For starting information
  ABOUT   - Information about your Rebol
  REDBOL  - Experimental emulation of Rebol2/Red conventions]--


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
    let autorun: null
    let importing: null
    parse system.options.args [opt some [
        ;
        ; local, remote, tracing_on, git_commit not passed through by the
        ; %load-r3.js for easier processing.
        ;
        ['do:] autorun: text! (importing: null)
            |
        ['import:] autorun: text! (importing: okay)
    ]] except [
        print ["** Bad `window.location.search` string in page URL"]
        print mold system.options.args
        print newline
        print trim:auto mutable --[
            OPTIONS ARE:

            ?do=scriptname

            DEBUG OPTIONS ARE:

            ?local
            ?remote
            ?tracing_on
            ?git_commit=<shorthash>

            They may be combined together, e.g.:

            ?local&do=scriptname
        ]--
        return 1
    ]

    if autorun [  ; `?do=foo` suppresses banner and runs `do @foo`
        ;
        ; !!! @gchiu wants to suppress the loading information for dependent
        ; modules, as well as not show any output from the import itself.
        ; While it seems like a reasonable default when running scripts in
        ; "release mode", a more holistic story for this is needed.
        ;
        ; https://forum.rebol.info/t/1801
        ;
        sys.util.script-pre-load-hook: ~

        if importing [
            ;
            ; !!! There's a lot of nuance involved in "adding commands to the
            ; console", because it straddles the line between being a script
            ; and a module.  We have to do some hacking here to push the
            ; module exports from inside this %main.reb module out to where
            ; the console can see them.  Think through this more!
            ;
            ; https://forum.rebol.info/t/1802

            result: import as the-word! autorun
            sys.util/import* system.contexts.user result
        ]
        else [
            result: do as the-word! autorun  ; may be BAD-WORD!
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
        replpad-write:html intro-note-html
    ]

    ; Fall through to normal CONSOLE loop handling, but use a skin that
    ; gives a custom message (other customizations could be done here,
    ; prompt, etc., and it's hoped the tutorial itself would be done with
    ; such hooks)

    skin: make console! compose [  ; :SKIN is a refinement to CONSOLE
        (spread either autorun [
            [print-greeting: does []]
        ][
            [greeting: greeting-text]
        ])

        print-halted: method [return: []] [
            print "[interrupted by Escape key or HALT instruction]"
        ]
    ]

    change-dir %/  ; switch to local filesystem as "current directory"
]


=== ABOUT COMMAND ===

; !!! The ABOUT command was not made part of the console extension, since
; non-console builds might want to be able to ask it from the command line.
; But it was put in HOST-START and not the mezzanine/help in general.  This
; needs to be rethought, but including ABOUT doing *something* since it is
; mentioned when the console starts up.

export about: does [
    print [
        "This Rebol is running completely in your browser!  The evaluations"
        "aren't being sent to a remote server--the interpreter is client side!"
        newline newline

        "Please don't hesitate to submit any improvements, no matter how"
        "small...and come join the discussion on the forum and chat!"
    ]
]


=== WATCHLIST STUB (INVOKES MODULE ON FIRST RUN) ===

; We don't want to pay for loading the watchlist unless it's used.  Do a
; delayed-load that waits for the first use.
;
; Note: When it was being automatically loaded, it was observed that it
; could not be loaded before REPLPAD-WRITE:HTML.  Investigate.

export /watch: func [@arg] [
    print "Loading watchlist extension for first use..."
    import join replpad-dir %watchlist/main.reb

    /watch: system.modules.Watchlist.watch/  ; replace this stub

    extend system.contexts.user [
        /watch: watch/
    ]

    ; WATCH hard quotes its argument...use APPLY to pass arg we hard-quoted
    ;
    return apply watch/ [arg]
]


=== COMMAND FOR INVOKING REDBOL (Rebol2/Red Emulation) ===

export /redbol: func [return: []] [
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
    sys.util.import* system.contexts.user @redbol

    system.console.prompt: "redbol>>"
]


=== GOLDEN LAYOUTS DEMO ===

export /ensure-golden-layouts-loaded: func [
    return: []
]
bind construct [
    loaded: null
][
    if loaded [return ~]

    css-do join replpad-dir %libs/golden/css/goldenlayout-base.css
    css-do join replpad-dir %libs/golden/css/themes/goldenlayout-replpad-theme.css
    css-do --[
        h2 {  /* this was in the golden layout simple demo */
            font: 14px Arial, sans-serif;
            color: #fff;
            padding: 10px;
            text-align: center;
        }
    ]--

    ; The interop is a module that makes `window.golden` available to this
    ; non-modularized code.
    ;
    js-do:module join replpad-dir %golden-interop.js

    loaded: okay
]


=== CODEMIRROR 6 EDITOR DEMO ===

export /edit: func [
    return: []
    source [url! text! file!]
    :marks
]
bind construct [
    codemirror-loaded: null
][
    ensure-golden-layouts-loaded

    if not codemirror-loaded [
        ;
        ; The interop is a module that makes `window.CodeMirror` available to
        ; this non-modularized code.
        ;
        js-do:module join replpad-dir %codemirror-interop.js

        css-do --[
            .cm-editor {  /* https://discuss.codemirror.net/t/2882 */
                height: 100% !important
            }
            .cm-scroller {
                overflow-y: scroll !important;  /* always show */
                overflow-x: auto
            }
        ]--

        codemirror-loaded: okay

        js-eval --[
            const { EditorState } = CodeMirror.state
            const { EditorView } = CodeMirror.view

            const {
                lineNumbers,

                highlightActiveLine, highlightActiveLineGutter,

                highlightSpecialChars,

                drawSelection, rectangularSelection,

                dropCursor, crosshairCursor,

                keymap
            } = CodeMirror.view

            const { Extension } = CodeMirror.state

          golden.registerComponent('mirror', function (container, gl_state) {

            // https://codemirror.net/6/docs/ref/#state
            let cm_state = EditorState.create({
                doc: gl_state.text,
                extensions: [
                    lineNumbers(),

                    highlightActiveLine(),
                    highlightActiveLineGutter(),

                    highlightSpecialChars(),

                    drawSelection(),
                    rectangularSelection(),

                    dropCursor(),
                    crosshairCursor()
                ]
            })

            // https://codemirror.net/6/docs/ref/#view
            let cm_view = new EditorView({
                state: cm_state,
                parent: container.getElement()
            })

            gl_state.cm_view = cm_view
            window.cm = cm_view

            // https://stackoverflow.com/a/40569014
            // https://github.com/golden-layout/golden-layout/issues/173
            //
            let first_show = true
            container.on('shown', function () {
                if (!first_show)
                    cm_view.focus()
                first_show = false
                cm = cm_view  // capture last editor in cm
            })
          })
        ]--
    ]

    let [text title]: switch:type source [
        text! [
            pack [source, "TEXT!"]
        ]
        url! file! [
            pack [as text! read source, split-path source]
        ]
    ]

    js-eval [
        --[let text =]-- spell @text --[;]--
        --[let title =]-- spell @title --[;]--
        --[
            let state = { text: text }
            golden.addComponent('mirror', state, title)
        ]--
    ]
]

export /ed-text: js-native [] --[  // repeated in %eparse.reb
    return reb.Text(cm.state.doc.text.join('\n'))
]--

/ed-clear-underlines: js-awaiter [  ; repeated in %eparse.reb
    "Clear all underlines from the last activated editor"
] --[
    CodeMirror.ClearUnderlines()
]--



=== "EPARSE" INTEGRATION DEMO OF UPARSE AND CODEMIRROR ===

import ensure url! clean-path %eparse.reb

export [eparse eparse-debug]


=== OVERRIDE QUIT IN LIB ===

; Having QUIT exit the interpreter can be useful in some debug builds which
; check various balances of state.
; https://github.com/hostilefork/replpad-js/issues/17
;
; !!! QUIT is now definitional, scripts and modules can only quit themselves.
; The console offers up its own QUIT, but it's not clear what that should
; do in the browser or how to hook it.  Review.

comment [
    /lib.quit: adapt copy lib.quit/ [  ; LIB/QUIT a stub saying "too late"
        replpad-write:html spaced [
            "<div class='note'>"
            "<p><b><i>Sorry to see you go...</i></b></p>"

            "<p><a href='.'>click to restart interpreter</a></p>"
            </div>
        ]

        ; Fall through to normal QUIT handling
    ]
]
