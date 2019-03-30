var splitter_sizes = [75, 25]
var splitter  // will be created by the JS-WATCH-VISIBLE command

// !!! TableResize component is flaky and doesn't seem to work here, but
// there does not seem to be much in the way of viable non-jQuery codebases
// that do this.  So taking ownership and cleaning it up is one option, or
// just including jQuery is another...but the one table resize widget that
// worked wasn't just jQuery but it involved a build process... so that was
// a double-whammy.  Review the issue as the ground rules for this evolve.
//
new TableResize(
    document.getElementById('example'),
    {distance: 100, minWidth: 60, restoreState: true, fixed: true}
)

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

