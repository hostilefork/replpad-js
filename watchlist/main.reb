REBOL [
    Title: {Watchlist}

    Type: module
    Name: Watchlist

    Description: {
        This is a web-based remake of a feature demonstrated in the Qt-Based
        Ren Garden.  It is a Rebol-dialected form of a debugger "watchlist"
        which updates a table of monitored evaluations each time an
        evaluation step returns you to the console prompt:

            https://youtu.be/0exDvv5WEv4?t=474

        !!! As with pretty much all of the Web/WASM-based code, it is an
        experimental work in progress.

        https://github.com/hostilefork/replpad-js/wiki/WATCH-Dialect-Notes
    }

    Exports: [watch]
]

import <../replpad.reb>

; https://github.com/nathancahill/Split.js
;
js-do %split.js
css-do %split.css

css-do %watchlist.css
js-do %watchlist.js


; Easiest to hold onto the values being watched via Rebol.  Order matches the
; order of the watches in the JavaScript table.  Trying to associate objects
; with DOM nodes is tough...the `data-xxx` attributes are only strings, and
; assigning properties directly is a minefield:
;
; http://perfectionkills.com/whats-wrong-with-extending-the-dom/
;
watches: []

delete-watch: function [
    return: [~]
    n [integer!]
][
    if n > length of watches [
        fail ["There is no watch in slot" n]
    ]
    js-do/local [{
        let tr = document.querySelectorAll("#watchlist tr")[} (n) {]
        tr.parentNode.removeChild(tr)
    }]
    remove at watches n
]

watch: function [
    {See https://github.com/hostilefork/replpad-js/wiki/WATCH-Dialect-Notes}

    :arg [
        word! get-word! path! get-path!
        block! group!
        integer! tag! refinement!
    ]
][
    case [
        arg = /on [js-eval {js_watch_visible(true)}]
        arg = /off [js-eval {js_watch_visible(false)}]

        ; !!! Would look better in a GROUP!
        ; https://github.com/metaeducation/ren-c/issues/982
        ;
        elide js-eval {js_watch_visible(true)}  ; other commands show watchlist

        integer? arg [
            case [
                positive? arg [  ; request to fetch the material
                    return get (pick watches arg else [
                        fail ["There is no watch in slot" arg]
                    ])
                ]
                negative? arg [  ; request to delete a watch
                    delete-watch negate arg
                ]
                fail "WATCH 0 has no assigned meaning"
            ]
        ]

        word? arg [
            append watches arg  ; e.g. length is 1 after first addition

            js-do/local [{
                let tbody = document.querySelector("#watchlist > tbody")
                let tr = load(
                   '<tr onmousedown="RowClick(this,false);"></tr>'
                )

                // The CSS `counter-increment` feature virtually fills in the
                // counter for this first column, see %watchlist.css
                //
                tr.appendChild(load("<td></td>"))

                // Rebol WORD!s can have chars like `<`, which would not be
                // good when making HTML from strings.  Use innerText assign.
                //
                let td_name = load("<td></td>")
                td_name.innerText = } spell @(quote arg) {
                tr.appendChild(td_name)

                tr.appendChild(load("<td></td>"))  // UPDATE-WATCHES fills in

                tbody.appendChild(tr)
            }]
        ]

        fail ["Not-yet-implemented WATCH command:" arg]
    ]
]


update-watches: function [] [
    n: 1
    for-each w watches [
        result: case [
            ;
            ; The edge-case states for the watches would ideally be in some
            ; different color to call attention to them.
            ;
            '~attached~ = binding of w [
                ">attached<"
            ]
            bad-word? ^ get/any w [
                spaced [mold ^ get/any w space space "; isotope"]
            ]
            null? get w ["\null\"]

            true [mold/limit get w 1000]
        ]

        ; We update the result, in the 3rd column.  Because the content can
        ; be arbitrary UTF-8, we set the innerText property via a string
        ; generated via `reb.Spell()` (convenient in the JS-DO dialect)
        ;
        js-do/local [{
            let tr = document.querySelectorAll("#watchlist tr")[} (n) {]
            let td = tr.childNodes[2]  // 1-based indexing, so 2 is 3rd column

            td.innerText = } spell @result {
        }]
        n: n + 1
    ]
]


; The right click menu was an experiment which was initially in the ReplPad to
; support the watchlist.  It was a frustratingly ugly replacement for the
; browser's menu, so it was abandoned as a general facility.  Research better
; menu mechanisms.
;
; This was the HTML that was in index.html for ReplPad which was taken out.
;
rightclick-menu-html: {
    <div id="menu">
      <a href="https://chat.stackoverflow.com/rooms/291/">
        <img src="https://rebolsource.net/favicon.ico" />
        Rebol Chat
        <span>Ctrl + ?!</span>
      </a>
      <hr />
      <a href="#" onclick="OnMenuCut();">
        Cut
        <span>Ctrl + ?!</span>
      </a>
      <a href="#" onclick="OnMenuCopy();">
        Copy
        <span>Ctrl + ?!</span>
      </a>
      <a href="#" onclick="OnMenuPaste();">
        Paste
        <span>Ctrl + ?!</span>
      </a>
    </div>
}

; Add in the hook to the console so that when the result is printed, we do
; an update of the watches.

system.console.print-result: enclose :system.console.print-result func [f] [
    do f  ; let the evaluation result get printed first

    ; Only update the watches if the watchlist is currently displayed
    ;
    if "none" <> js-eval {document.getElementById('right').style.display} [
        update-watches
    ]
    return ~
]
