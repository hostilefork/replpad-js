var splitter_sizes = [75, 25]
var splitter  // will be created by the JS-WATCH-VISIBLE command

var right_div = load(
  `<div id='right' class='split split-horizontal'>
    <table id='watchlist' class='watchlist'>
      <thead>
        <tr>
          <th><!-- empty is fine, don't need # --></th>
          <th>Watch</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        <!--
         ! Rows in this table are of the form:
         !
         !     <tr onmousedown="RowClick(this,false);">
         !       <td>2</td>         (Row number)
         !       <td>(x + 4)</td>   (Expression)
         !       <td>304</td>       (Value)
         !     </tr>
         !-->
      </tbody>
    </table>
  </div>
)

replcontainer.parentNode.insertBefore(right_div, replcontainer.nextSibling)

var js_watch_visible = function(visible) {
    //
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


//=//// ROW CLICK WITH MULTI-SELECT ////////////////////////////////////////=//
//
// Taken from:
// https://stackoverflow.com/a/17966381
//

var lastSelectedRow
var watchlist = document.getElementById('watchlist')
var trs = document.getElementById('watchlist')
    .tBodies[0]
    .getElementsByTagName('tr')

RowClick = function(currenttr, lock) {
    if (window.event.ctrlKey)
        toggleRow(currenttr)

    if (window.event.button === 0) {
        if (!window.event.ctrlKey && !window.event.shiftKey) {
            clearAll()
            toggleRow(currenttr)
        }

        if (window.event.shiftKey) {
            selectRowsBetweenIndexes(
                [lastSelectedRow.rowIndex, currenttr.rowIndex]
            )
        }
    }
}

function toggleRow(row) {
    row.className = (row.className == 'selected') ? '' : 'selected'
    lastSelectedRow = row
}

function selectRowsBetweenIndexes(indexes) {
    indexes.sort(function(a, b) {
        return a - b
    })

    for (var i = indexes[0]; i <= indexes[1]; i++)
        trs[i - 1].className = 'selected'
}

function clearAll() {
    for (var i = 0; i < trs.length; i++)
        trs[i].className = ''
}


//=//// RIGHT-CLICK MENU ///////////////////////////////////////////////////=//
//
// Taken from:
// https://stackoverflow.com/a/35730445
//
// Overriding the right click menu is generally not very clean in browsers, but
// it's pretty useful when working with things like watchlists.  Review what
// the best way of doing this is.

/*
var i = document.getElementById("menu").style
document.addEventListener('contextmenu', function(e) {
    var posX = e.clientX
    var posY = e.clientY
    menu(posX, posY)
    e.preventDefault()
}, false)

document.addEventListener('click', function(e) {
    i.opacity = "0"
    setTimeout(function() {
      i.visibility = "hidden"
    }, 501)
}, false)

function menu(x, y) {
    i.top = y + "px"
    i.left = x + "px"
    i.visibility = "visible"
    i.opacity = "1"
}

OnMenuCut = function() {
    clipboard = window.getSelection().toString()
    document.execCommand('cut')
}

OnMenuCopy = function() {
    clipboard = window.getSelection().toString()
    document.execCommand('copy')
}

OnMenuPaste = function() {
    if (!clipboard)
        alert("For security reasons, paste is only allowed from within page")
    else
        replaceSelectedText(clipboard)
}
*/

