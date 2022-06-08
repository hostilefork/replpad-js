//
// %golden-interop.js
//
// This exports the Golden Layout as `golden` to the non-modularized ReplPad.
//

import { GoldenLayout } from './libs/golden/js/golden-layout.min.js';

var replcontainer = document.getElementById('replcontainer')
var container = replcontainer.parentNode
replcontainer.parentNode.removeChild(replcontainer)

var config = {
    content: [
      {
        type: 'row',
        content: [
          {
            type: 'stack',
            width: 50,  // 50% ?
            content: [
                // assume what spawned the golden layout goes here
                // (for now that's the CodeMirror editor)
            ]
          },{
            type: 'column',
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
