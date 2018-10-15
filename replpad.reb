;;
;; File: %replpad.reb
;; Summary: "Read-Eval-Print-Loop implementation and JavaScript interop"
;; Project: "JavaScript REPLpad for Ren-C branch of Rebol 3"
;; Homepage: https://github.com/hostilefork/replpad-js/
;;
;;=;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;=;;
;;
;; Copyright (c) 2018 hostilefork.com
;;
;; See README.md and CREDITS.md for more information
;;
;; This program is free software: you can redistribute it and/or modify
;; it under the terms of the GNU Affero General Public License as
;; published by the Free Software Foundation, either version 3 of the
;; License, or (at your option) any later version.
;;
;; https://www.gnu.org/licenses/agpl-3.0.en.html
;;
;; This program is distributed in the hope that it will be useful,
;; but WITHOUT ANY WARRANTY; without even the implied warranty of
;; MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
;; GNU Affero General Public License for more details.
;;


!!: js-native [
    {Temporary debug helper, sends to browser console log instead of replpad}
    message
]{
    console.log(
        "@" + rebTick() + ": "
        + rebSpell("form", rebR(rebArg('message')))
    )
}


replpad-reset: js-awaiter [
    {Clear contents of the browser window}
]{
    // The output strategy is to merge content into the last div, until
    // a newline is seen.  Kick it off with an empty div, so there's
    // always somewhere the first output can stick to.
    //
    replpad.innerHTML = "<div class='line'>&zwnj;</div>"
    setTimeout(resolve, 0) // to see result synchronously, yield to browser
}


replpad-write: js-awaiter [
    {Print a string of text to the REPLPAD (no newline)}
    param [text!]
    /note "Format with CSS yellow sticky-note class"
]{
    var param = rebSpell(rebR(rebArg('param')))
    var note = rebDid(rebR(rebArg('note')))

    if (note) {
        replpad.appendChild(load(
            "<div class='note'><p>"
            + param
            + "</p><div>"
        ))
        replpad.appendChild(
            load("<div class='line'>&zwnj;</div>")
        )
        setTimeout(resolve, 0) // to see result synchronously, yield to browser
        return
    }

    var line = replpad.lastChild

    // Split string into pieces.  Note that splitting a string of just "\n"
    // will give ["", ""].
    //
    // Each newline means making a new div, but if there's no newline (e.g.
    // only "one piece") then no divs will be added.
    //
    var pieces = param.split("\n")
    line.innerHTML += pieces.shift() // shift() takes first element
    while (pieces.length)
        replpad.appendChild(
            load("<div class='line'>&zwnj;" + pieces.shift() + "</div>")
        )

    // !!! scrollIntoView() is supposedly experimental.
    replpad.lastChild.scrollIntoView()

    setTimeout(resolve, 0) // to see result synchronously, yield to browser
}

lib/write-stdout: write-stdout: function [
    {Writes just text to the ReplPad}
    text [text!]
][
    replpad-write text
]

lib/print: print: function [
    {Helper that writes data and a newline to the ReplPad}
    line [blank! text! block!]
][
    text: switch type of line [
        blank! [return null]
        text! [line]
        block! [spaced line]
        default [fail]
    ]

    ; Performance-wise, it's better to go ahead and build the string with the
    ; newline, vs pay for multiple JS-AWAITER calls to REPLPAD-WRITE.
    ;
    write-stdout (append text newline)
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

    var new_input = load("<div class='input'></div>")
    replpad.lastChild.appendChild(new_input)

    ActivateInput(new_input)

    // This body of JavaScript ending isn't enough to return to the Rebol
    // that called REPLPAD-INPUT.  The resolve function must be invoked by
    // JavaScript.  We save it in a global variable so that the page's event
    // callbacks dealing with input can call it when input is finished.
    //
    input_resolve = resolve
}


lib/wait: wait: js-awaiter [
    {Sleep for the requested number of seconds}
    seconds [integer! decimal!]
]{
    setTimeout(resolve, 1000 * rebUnboxDecimal(rebR(rebArg("seconds"))))
}


lib/write: write: lib/read: read: function [
    source [any-value!]
][
    print [
        {For various reasons (many of them understandable) there are some}
        {pretty strict limitations on web browsers being able to make HTTP}
        {requests or read local files.  There are workarounds but none are}
        {implemented yet for this demo.  But see: https://enable-cors.org/}
    ]
]


main: function [
    {The Read, Eval, Print Loop}
    return: [] ;-- at the moment, an infinite loop--does not return
][
    !! "MAIN executing (this should show in browser console log)"

    replpad-reset

    git: https://github.com/hostilefork/replpad-js/blob/master/replpad.reb
    chat: https://chat.stackoverflow.com/rooms/291/rebol
    forum: https://forum.rebol.info

    replpad-write/note spaced [
        {<b><i>Guess what...</i></b> this REPL is actually written in Rebol!}
        {Check out the} unspaced [{<a href="} git {">source on GitHub</a>.}]

        {While the techniques are still in early development, they show a}
        {lot of promise for JavaScript/Rebol interoperability.}

        {Discuss it on} unspaced [{<a href="} chat {">StackOverflow chat</a>}]
        {or join the} unspaced [{<a href="} forum {">Discourse forum</a>.}]
    ]

    forever [
        replpad-write {<b>&gt;&gt;</b>&nbsp;} ;-- the bolded >> prompt
        text: input
        trap/with [
            set* (quote result:) do text
            switch type of :result [
                null [print [";-- null"]]
                void! []
            ] else [
                print ["==" mold :result]
            ]
        ] error => [
            print form error
        ]
        print []
    ]
]