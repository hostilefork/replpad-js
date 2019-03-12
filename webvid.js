
(function(win, doc) {  // "module" pattern

// Simple Dialog Box Plugin by Taufik Nurrohman
// URL: http://www.dte.web.id + https://plus.google.com/108949996304093815163/about
// "License: none"

let uniqueId = new Date().getTime()

// Create the dialog box markup
let div = doc.createElement('div')
div.className = 'dialog-box'
div.id = 'dialog-box-' + uniqueId
div.innerHTML =
    '<h3 class="dialog-title">&nbsp;</h3>'
    + '<a href="javascript:;" class="dialog-minmax" title="Minimize">&ndash;</a>'
    + '<a href="javascript:;" class="dialog-close" title="Close">&times;</a>'
    + '<div class="dialog-content">&nbsp;</div>'
    + '<div class="dialog-action"></div>'
doc.body.appendChild(div)

let ovr = doc.createElement('div')
ovr.className = 'dialog-box-overlay'
doc.body.appendChild(ovr)

let maximize = false
let dialog = doc.getElementById('dialog-box-' + uniqueId)  // HTML of dialog
let dialog_title = dialog.children[0]
let dialog_minmax = dialog.children[1]
let dialog_close = dialog.children[2]
let dialog_content = dialog.children[3]
let dialog_action = dialog.children[4]
let dialog_overlay = dialog.nextSibling

win.setDialog = function(set, config) {

	let selected = null  // Object of the element to be moved
	let x_pos = 0
	let y_pos = 0  // Stores x & y coordinates of the mouse pointer
	let x_elem = 0
	let y_elem = 0  // Stores top, left values (edge) of the element
	let defaults = {
		title: dialog_title.innerHTML,
		content: dialog_content.innerHTML,
		width: 300,
		height: 150,
		top: false,
		left: false,
		buttons: {
			"Close": function() {
				setDialog('close')
			}
		},
		specialClass: "",
		fixed: true,
		overlay: false
	}

	for (var i in config) {
        defaults[i] = (typeof(config[i])) ? config[i] : defaults[i]
    }

	// Will be called when user starts dragging an element
	function _drag_init(elem) {
		selected = elem  // Store object of the element which needs moving
		x_elem = x_pos - selected.offsetLeft
		y_elem = y_pos - selected.offsetTop
	}

	// Will be called when user is dragging an element
	function _move_elem(e) {
		x_pos = doc.all ? win.event.clientX : e.pageX
		y_pos = doc.all ? win.event.clientY : e.pageY
		if (selected !== null) {
			selected.style.left =
                !defaults.left
                    ? ((x_pos - x_elem) + selected.offsetWidth/2) + 'px'
                    : ((x_pos - x_elem) - defaults.left) + 'px'
			selected.style.top =
                !defaults.top
                    ? ((y_pos - y_elem) + selected.offsetHeight/2) + 'px'
                    : ((y_pos - y_elem) - defaults.top) + 'px'
		}
	}

	// Destroy the object when we are done
	function _destroy() {
		selected = null
	}

	dialog.className =
        "dialog-box "
        + (defaults.fixed ? 'fixed-dialog-box ' : '')
        + defaults.specialClass

	dialog.style.visibility = (set == "open") ? "visible" : "hidden"
	dialog.style.opacity = (set == "open") ? 1 : 0
	dialog.style.width = defaults.width + 'px'
	dialog.style.height = defaults.height + 'px'
	dialog.style.top = (!defaults.top) ? "50%" : '0px'
	dialog.style.left = (!defaults.left) ? "50%" : '0px'

	dialog.style.marginTop = (!defaults.top)
        ? '-' + defaults.height/2 + 'px'
        : defaults.top + 'px'

	dialog.style.marginLeft = (!defaults.left)
        ? '-' + defaults.width/2 + 'px'
        : defaults.left + 'px'

	dialog_title.innerHTML = defaults.title
	dialog_content.innerHTML = defaults.content
	dialog_action.innerHTML = ""
	dialog_overlay.style.display =
        (set == "open" && defaults.overlay)
            ? "block"
            : "none"

	if (defaults.buttons) {
		for (var j in defaults.buttons) {
			let btn = doc.createElement('a')
			btn.className = 'btn'
			btn.href = 'javascript:;'
			btn.innerHTML = j
			btn.onclick = defaults.buttons[j]
			dialog_action.appendChild(btn)
		}
	} else {
		dialog_action.innerHTML = '&nbsp;'
	}

	// Bind the draggable function here...
	dialog_title.onmousedown = function() {
		_drag_init(this.parentNode)
		return false
	}

	dialog_minmax.innerHTML = '&ndash;'
	dialog_minmax.title = 'Minimize'
	dialog_minmax.onclick = dialogMinMax

	dialog_close.onclick = function() {
		setDialog("close", {content:""})
	}

	win.onmousemove = _move_elem
	win.onmouseup = _destroy

	maximize = (set == "open") ? true : false
}

// Maximized or minimized dialog box
function dialogMinMax() {
	if (maximize) {
		dialog.className += ' minimize'
		dialog_minmax.innerHTML = '+'
		dialog_minmax.title = dialog_title.innerHTML.replace(/<.*?>/g,"")
		maximize = false
	} else {
		dialog.className = dialog.className.replace(/(^| )minimize($| )/g, "")
		dialog_minmax.innerHTML = '&ndash;'
		dialog_minmax.title = 'Minimize'
		maximize = true
	}
}

// End module pattern

})(window, document);
