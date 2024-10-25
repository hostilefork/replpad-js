Rebol [
    File: %eparse.reb
    Type: module
    Name: eparse
    Description: --{
        This demonstration is set up in a way so that it shows the modularity
        of the approach.  The %underline_extension.js is not loaded unless
        EPARSE is used.  More factoring should push the EPARSE codebase itself
        into something that is loaded on demand (like the watchlist, but the
        technique needs work)
    }--
]

replpad-dir: what-dir


=== CODEMIRROR EDITOR FUNCTIONS ===

; These expose JavaScript functionality for manipulating the codemirror editor

ed-text: js-native [] --{  // repeat of code exported by %main.reb
    return reb.Text(cm.state.doc.text.join('\n'))
}--

ed-clear-underlines: js-awaiter [  ; repeat of code exported by %main.reb
    "Clear all underlines from the last activated editor"
] --{
    CodeMirror.ClearUnderlines()
}--

ensure-underline-extension-loaded: func [
    return: [~]
    <static> loaded (false)
][
    if not loaded [
        js-do:module join replpad-dir %underline-extension.js
        loaded: true
    ]
]

ed-add-underline: js-native [
    "Add an underline to the last activated editor"
    from [integer!]
    to [integer!]
] --{
    CodeMirror.AddUnderline(
        reb.UnboxInteger("from"),
        reb.UnboxInteger("to")
    )
}--

ed-select: js-native [
    start [integer!]
    end [integer!]
] --{
    let start = reb.UnboxInteger("start")
    let end = reb.UnboxInteger("end")

    let EditorSelection = CodeMirror.state.EditorSelection
    cm.dispatch({
        selection: EditorSelection.create([
            EditorSelection.range(start, end),
            EditorSelection.cursor(end)
        ], 1)
    })
}--


eparse-combinators: copy default-combinators

eparse-combinators.('mark): combinator [
    "Run one rule and if it matches, draw a mark across that content"
    return: "Result of one evaluation step"
        [any-atom?]
    @pending [blank! block!]
    parser [action?]
    <local> subpending rest result'
][
    [^result' remainder subpending]: parser input except e -> [return raise e]

    pending: glom subpending make pair! :[
        (index of input) - 1
        (index of remainder) - 1
    ]

    return unmeta result'
]


; EPARSE is a PARSE variant that implicitly assumes you want to parse the
; content of the CodeMirror editor.
;
export eparse: func [rules [block!] :hook [<unrun> frame!]] [
    ensure-underline-extension-loaded

    ed-clear-underlines

    let [^synthesized' pending]: (
        parse*:combinators:hook ed-text rules eparse-combinators hook
    ) except e -> [
        return raise e
    ]

    for-each item maybe pending [
        if not pair? item [
            fail "residual non-PAIR! found in EPARSE pending list"
        ]
        ed-add-underline first item second item
    ]
    return unmeta synthesized'
]


=== PARSE DEBUG PANEL ===

; These functions implement a very simplistic panel with buttons for stepping
; and a list of parse stack frames.
;
; Each div representing a stack frame holds a Rebol API pointer to the FRAME!
; it represents in a `data-XXX` field named `data-frame` (which has to be a
; string, so it's a string representation of the integer value of the pointer).
;
; JavaScript accesses the Parse Debug panel through the global variable `pd`.
;

pdebug-loaded: false

ensure-debug-panel-loaded: func [
    "Create GoldenLayout panel with a toolbar and div for stack display"
] [
    if pdebug-loaded [return ~]

  css-do --{
    .pd-panel {  /* https://discuss.codemirror.net/t/2882 */
        height: 100% !important;
    }
    .pd-panel {
        overflow: auto;
    }
    .toolbar {
        position: sticky;
        top: 0em;
        overflow-y: hidden;

        background-color: #f4f4f4;
        padding: 4px;
        border-bottom-color: #ccc;
        border-bottom-width: 1px;
        border-bottom-style: solid;

        display: flex;
        flex-direction: row;
        column-gap: 4px;  /* only works if display: flex */
    }
    .pd-stack {
        margin: 4px;

        display: flex;
        flex-direction: column;
        row-gap: 4px;  /* only works if display: flex */
    }
    .pd-stack div:after {
        content: "";
        border: 0;
        clear: both;
        display: block;
        width: 100%;
        background-color: #e8e8e8;
        height: 1px;
        margin: 4px 0px 4px 0px;
    }
    .pd-stack .match-failed {
        color: #8B8000;  /* dark yellow (red looks too alarming) */
        font-size: smaller;
    }
    .pd-stack .match-succeeded {
        color: green;
        font-size: smaller;
    }
  }--

  js-eval --{
    golden.registerComponent('pdebug', function (container, gl_state) {

        let pd_view = load("<div class='pd-panel'>"
            + "<div class='toolbar'>"
                + "<button id='step-in' type='button'>Step In</button>"
                + "<button id='step-over' type='button'>Step Over</button>"
                + "<button id='step-out' type='button'>Step Out</button>"
                + "<button id='skip' type='button'>Skip</button>"
                + "<button id='run' type='button'>Run</button>"
                + "<button id='stop' type='button'>Stop</button>"
            + "</div>"
            + "<div class='pd-stack'></div>"
            + "</div>")

        container.getElement().append(pd_view)

        gl_state.cm_view = pd_view
        window.pd = {
            view: pd_view,
            stack: pd_view.getElementsByClassName("pd-stack")[0]
        }

        // https://stackoverflow.com/a/40569014
        // https://github.com/golden-layout/golden-layout/issues/173
        //
        // There is only one debugger view, but if there were more than
        // one this is where we'd capture the focused one.
        //
        container.on('shown', function () {
            pd.view = pd_view  // capture last debugger in pd
        })
    })
  }--

  js-eval --{
    let state = { something: 1 }
    golden.addComponent('pdebug', state, "DEBUG")
  }--

    pdebug-loaded: true
]

pd-stack-clear: js-native [
    "Empty the stack component of the parse debug panel"
] --{
    pd.stack.innerHTML = ""
}--

pd-stack-push: js-native [
    "Add a single line DIV to the parse debug stack"
    frame [frame!]
    line "Textual content of the DIV"
        [text! block!]
    :class "CSS class to give to the pushed DIV"
        [text!]
] --{
    let text = reb.Spell("spaced line")
    let classname = reb.TrySpell("spaced maybe class")
    let div = load("<div>" + text + "</div>")
    if (classname)
        div.classList.add(classname)
    div["data-frame"] = reb.Arg("frame").toString()
    pd.stack.insertBefore(div, pd.stack.firstChild)
}--

pd-get-frame: js-native [
    "Return FRAME! associated with given stack level in list (1 is topmost)"
    return: [~null~ frame!]
    index [integer!]
] --{
    let index = reb.Unbox("index")
    let div = pd.stack.firstChild
    if (div == null)
        return null
    while (index != 1) {
        index -= 1
        div = div.nextSibling
        if (div == null) { return null }
    }
    let frame = parseInt(div["data-frame"])
    return reb.Value(frame)  // duplicate API handle
}--

pd-stack-pop: js-native [] --{
    let div = pd.stack.firstChild
    let frame = parseInt(div["data-frame"])
    reb.Release(frame)
    div.remove()
}--

wait-for-step: js-awaiter [
    "Add listeners to each toolbar button, wait until one of them resolve()s"
    return: [text!]
] --{
    let buttons = [
        document.getElementById('step-in'),
        document.getElementById('step-out'),
        document.getElementById('step-over'),
        document.getElementById('skip'),
        document.getElementById('run'),
        document.getElementById('stop')
    ]

    let promise = new Promise(function(resolve, reject) {
        let handler = (event) => {
            buttons.forEach(b => {
                b.removeEventListener("click", handler)
            })

            resolve(reb.Text(event.target.id))
        }

        buttons.forEach(b => {
            b.addEventListener("click", handler)
        })
    })

    return promise  // WAIT-FOR-STEP only returns when resolve() is called
}--


=== EPARSE-DEBUG DEMO OF GENERALIZED PARSE HOOKING ===

; Ren-C's PARSE is based on parser combinators, where the implementation of
; each "keyword" (or datatype with behavior, like strings) is done as a
; function, that calls other functions generated as their "subparsers".
;
; As part of that process, each instance of a combinator has a hook baked into
; it which allows control of its execution.  The hook receives the FRAME! of
; the "combinated" parser function (a combinator with its parameterized parsers
; fully specialized with their arguments).  It's the responsibility of this
; hook to invoke the FRAME! with EVAL (unless it wants to skip it for some
; reason and return its own result--leveraged here as a "SKIP" button in the
; debugger).  But more benignly, it can run code before and after doing the
; delegation to the original frame.`
;
; Here we demonstrate the idea that before running the combinator, we push the
; source code from which the combinator was made into a list.  After running
; the combinator, we show the synthesized product and update a marker for how
; far the parse has progressed (shown as a selection in the editor), and we
; remove the source code from the list.
;
; Additionally, we pause and yield to the browser to see what button the user
; presses to control the process.  Due to the fact that we have FRAME! values
; in hand for identifying stack levels, we implement things like "step over".
; That tells the hook not to bother pushing or popping stack frames into the
; debug view until reaching the post-eval call of the frame that's in hand.

stop-frame: null  ; if set, debugger keeps running until it sees this FRAME!

eparse-debug-hook: func [
    "Called as the :HOOK function for each parser instantiation"
    return: [pack?]
    f [frame!]
][
    let state: f.state

    let pushed: false
    let skipping: false

    if (not stop-frame) and f.rule-start [
        ed-select 0 ((index of f.input) - 1)

        pd-stack-push f [mold spread copy:part f.rule-start f.rule-end]
        pushed: true

        let mode: either stop-frame = <run> ["run"] [wait-for-step]

        switch mode [
            "step-in" []
            "step-over" [
                stop-frame: f
            ]
            "step-out" [
                stop-frame: pd-get-frame 2
            ]
            "skip" [
                skipping: true
            ]
            "stop" [
                pd-stack-clear
                unwind state raise "EPARSE Stopped By User"
            ]
            "run" [
                stop-frame: <run>
            ]
        ]
    ]

    let result': either skipping [^ pack [null f.input null]] [^ eval f]

    if pushed [
        if f = stop-frame [stop-frame: null]

        if raised? unmeta result' [
            let e: unquasi result'
            pd-stack-push:class f [
                "**" spaced e.message
            ] "match-failed"
        ]
        else [
            let synthesized: first unquasi result'
            let is-antiform
            if quasi? synthesized [
                is-antiform: true
                synthesized: unquasi synthesized
            ] else [
                is-antiform: false
                synthesized: unquote synthesized
            ]
            pd-stack-push:class f [
                "=>" (mold synthesized) if is-antiform ["; anti"]
            ] "match-succeeded"

            ed-select 0 ((index of unmeta second unquasi result') - 1)
        ]

        let mode: either stop-frame = <run> ["run"] [wait-for-step]
        pd-stack-pop

        switch mode [
            "step-out" [
                stop-frame: pd-get-frame 2
            ]
            "stop" [
                pd-stack-clear
                unwind state raise "EPARSE Stopped By User"
            ]
            "run" [
                stop-frame: <run>
            ]
        ]

        pd-stack-pop
    ]

    return unmeta result'
]


export eparse-debug: func [
    "Call EPARSE with EPARSE-DEBUG-HOOK (and ensure debug panel is loaded)"
    rules [block!]
][
    ensure-debug-panel-loaded
    pd-stack-clear

    stop-frame: null

    return eparse:hook rules :eparse-debug-hook
]
