//
// %golden-interop.js
//
// This exports the Golden Layout as `golden` to the non-modularized ReplPad.
//

import { GoldenLayout } from './libs/golden/js/golden-layout.min.js';

var replcontainer = document.getElementById('replcontainer')
var container = replcontainer.parentNode
replcontainer.parentNode.removeChild(replcontainer)

// We decide to split either horizontally or vertically, based on whether the
// viewport is wider than it is tall or not.  This means a cell phone will
// typically split two windows one on top of the other...while a desktop/laptop
// will typically do them side-by-side.
//
// https://stackoverflow.com/a/8876069
//
const vw = Math.max(
    document.documentElement.clientWidth || 0, window.innerWidth || 0
)
const vh = Math.max(
    document.documentElement.clientHeight || 0, window.innerHeight || 0
)

let side_by_side = (vw > vh)

var config = {
    content: [
      {
        type: side_by_side ? 'row' : 'column',
        content: [
          {
            type: 'stack',
            width: 50,  // 50% ?
            content: [
                // assume what spawned the golden layout goes here
                // (for now that's the CodeMirror editor)
            ]
          },{
            type: side_by_side ? 'column' : 'row',
            content:[
              {
                type: 'component',
                componentName: 'replComponent',
                title:'Ren-C'
              }
            ]
        }]
    }]
};

window.golden = new GoldenLayout( config, container );

// The GoldenLayout gets generated with fixed size panels.  But it has a method
// called updateSize() that will recalculate.
//
// It's not called automatically, so you have to hook it to when the window or
// other containing element get resized.
//
// https://github.com/golden-layout/golden-layout/issues/456
//
window.addEventListener('resize', function(event) {
    golden.updateSize()
}, true)

golden.registerComponent(
    'testComponent',
    function(container, state) {
    }
);

golden.registerComponent(
    'replComponent',
    function(container, state) {
        container.getElement().appendChild(replcontainer)

        container.on('shown', function () {
            setTimeout(function () {replpad.focus()}, 1)
        })
    }
);

golden.init();
