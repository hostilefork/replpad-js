REBOL [
    Title: {Watchlist}
;    Type: Module  ; !!! Can't be a module yet, working on it...

    Description: {
        This is a web-based remake of a feature demonstrated in the Qt-Based
        Ren Garden.  It is a Rebol-dialected form of a debugger "watchlist"
        which updates a table of monitored evaluations each time an
        evaluation step returns you to the console prompt:

            https://youtu.be/0exDvv5WEv4?t=474
    }

;    Exports: [watch]  ; !!! Can't be a module yet, working on it...
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
            <tr onmousedown="RowClick(this,false);">
              <td>1</td>
              <td>x</td>
              <td>300</td>
            </tr>
            <tr onmousedown="RowClick(this,false);">
              <td>2</td>
              <td>(x + 4)</td>
              <td>304</td>
            </tr>
            <tr onmousedown="RowClick(this,false);">
              <td>3</td>
              <td>&lt;before&gt;</td>
              <td>[a b c]</td>
            </tr>
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
    switch arg [
        /on [js-watch-visible true]
        /off [js-watch-visible false]

        fail ["Bad command:" arg]
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