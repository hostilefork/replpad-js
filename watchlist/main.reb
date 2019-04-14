REBOL [
    Title: {Watchlist}
    Type: Module
    Name: 'Watchlist
    Options: [isolate]

    Description: {
        This is a web-based remake of a feature demonstrated in the Qt-Based
        Ren Garden.  It is a Rebol-dialected form of a debugger "watchlist"
        which updates a table of monitored evaluations each time an
        evaluation step returns you to the console prompt:

            https://youtu.be/0exDvv5WEv4?t=474

        !!! As with pretty much all of the Web/WASM-based code, it is an
        experimental work in progress.
    }

    Exports: [watch]
]

; https://github.com/nathancahill/Split.js
;
js-do %split.js
css-do %split.css

; https://github.com/irhc/table-resize
;
js-do %table-resize.js

; Just putting a table here with the splitter to get a feel for how compatible
; the approach is in various browsers; there's a bunch of more important things
; to get in place before making the watchlist actually work...
;
make-splitter-helper: js-native [html [text!]] {
    right = load(reb.Spell(reb.ArgR('html')))
    replcontainer.parentNode.insertBefore(right, replcontainer.nextSibling)
}

make-splitter: function [] [
    html: trim/auto mutable {
      <div id="right" class="split split-horizontal" style='display: none;'>
        <table id='watchlist' class='watchlist'>
          <thead>
            <tr>
              <th></th><!-- superfluous to label this with # or similar -->
              <th>Watch</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            <!--
             ! <tr onmousedown="RowClick(this,false);">
             !     <td>2</td>         (Row number)
             !     <td>(x + 4)</td>   (Expression)
             !     <td>304</td>       (Value)
             ! </tr>
             !-->
          </tbody>
        </table>
      </div>}

    make-splitter-helper html
]

make-splitter


css-do %watchlist.css
js-do %watchlist.js

js-watch-visible: js-awaiter [
    visible [logic!]
]{
    let visible = reb.Did(reb.R(reb.Arg('visible')))

    let right_div = document.getElementById('right')

    // Suggestion from author of split.js is destroy/recreate to hide/show
    // https://github.com/nathancahill/Split.js/issues/120#issuecomment-428050178
    //
    if (visible) {
        if (!splitter) {
            replcontainer.classList.add('split-horizontal')
            right_div.style.display = 'block'
            splitter = Split(['#replcontainer', '#right'], {
                sizes: splitter_sizes,
                minSize: 200
            })
        }
    }
    else {
        // While destroying the splitter, remember the size ratios so that the
        // watchlist comes up the same percent of the screen when shown again.
        //
        if (splitter) {
            replcontainer.classList.remove('split-horizontal')
            splitter_sizes = splitter.getSizes()
            right_div.style.display = 'none'
            splitter.destroy()
            splitter = undefined
        }
    }
}

; Easiest to hold onto the values being watched via Rebol.  Order matches the
; order of the watches in the JavaScript table.  Trying to associate objects
; with DOM nodes is tough...the `data-xxx` attributes are only strings, and
; assigning properties directly is a minefield:
;
; http://perfectionkills.com/whats-wrong-with-extending-the-dom/
;
watches: []

watch: function [
    :arg [
        word! get-word! path! get-path!
        block! group!
        integer! tag! refinement!
    ]
        {word to watch or other legal parameter, see documentation)}
][
    ; REFINEMENT!s are treated as instructions.  `watch /on` seems easy...
    ;
    case [
        arg = /on [js-watch-visible true]
        arg = /off [js-watch-visible false]

        ; !!! Would look better in a GROUP!
        ; https://github.com/metaeducation/ren-c/issues/982
        ;
        elide js-watch-visible true  ; all other commands show the watchlist

        word? arg [
            append watches arg  ; e.g. length is 1 after first addition

            html: unspaced [
              {<tr data-handle="3423490" onmousedown="RowClick(this,false);">}
                {<td>} (length of watches) {</td>}  ; starts at 1
                {<td>} arg {</td>}
                {<td>...</td>}  ; filled in by UPDATE-WATCHES
              {</tr>}
            ]

            js-do/local [{
              let tbody = document.querySelector("#watchlist > tbody")
              let tr = load(} spell @html {)
              tbody.appendChild(tr)
            }]
        ]

        fail ["Bad command:" arg]
    ]
]


update-watches: function [] [
    n: 1
    for-each w watches [
        js-do/local [{
            let td = document.querySelector(
                "#watchlist > tbody :nth-child(} (n) {) :nth-child(3)"
            )
            td.innerHTML = } spell @(if set? w [mold get w] else ["\null\"]) {
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

system/console/print-result: enclose :system/console/print-result func [f] [
    do f  ; let the evaluation result get printed first
    update-watches
]
