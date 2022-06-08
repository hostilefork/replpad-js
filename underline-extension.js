//
// %underline-extension.js
//
// This is an early test for CodeMirror's integration with the ReplPad.  It is
// based on a sample of how to use markers given in the documentation:
//
// https://codemirror.net/6/examples/decoration/
//
// That sample lets you use a key binding (Ctrl-H) to make a red underline of
// text in the editor.  Here we adapt that to give a hook to the ReplPad to
// add markers to the last activated editor, but leave the key binding and
// command around for reference.
//


// While CodeMirror is modular, the assumption of many browser usage scenarios
// is that people are packaging a specific set of extensions together to use
// in their app.  This assumption either goes too narrow (building an editor
// with only a few features) or too broad (building a package that is over
// a megabyte in size *minified*, which has things like syntax highlighters
// that will never be used).
//
// Partially as a learning experience--the ReplPad takes a middle-of-the-road
// approach, building bundles from the Codemirror 6 sources themselves, that
// can be selectively loaded.  But the syntax "@codemirror/view" is not
// supported by browsers outside of "import maps":
//
//   https://caniuse.com/import-maps
//
// This means both the module bundles themselves and the import statements here
// have to be tweaked from:
//
//    import { EditorView, Decoration, keymap } from "@codemirror/view"
//    import { StateField, StateEffect } from "@codemirror/state"
//
// Adding `.js` is a choice (and extra work bundling), but helps identify the
// file type to the server so it knows to serve the correct MIME type.

import { EditorView, Decoration, keymap } from './libs/@codemirror/view.js'
import { StateField, StateEffect } from './libs/@codemirror/state.js'



//=//// DECORATION AND THEME ///////////////////////////////////////////////=//
//
// The underlineMark is a carrier for a `from` and `to` range.  This isn't
// TypeScript, so we just implicitly know that's what it holds.

const underlineMark = Decoration.mark({ class: "cm-underline" })

const underlineTheme = EditorView.baseTheme({
  ".cm-underline": {
    textDecoration: "underline 3px red",
    textDecorationSkipInk: "none"  // https://discuss.codemirror.net/t/3745/4
  }
})


//=//// THE EFFECT AND "STATE FIELD" ///////////////////////////////////////=//
//
// In CodeMirror's mostly-read-only model, each transaction is supposed to
// map from the old world to the new world.  This means there aren't obvious
// mutating operations to the data structure like "clearAllMarks()".  Instead,
// you have to create state effects that respond to transaction requests by
// morphing or filtering the existing list of marks into a new one.

const addUnderline = StateEffect.define()  // {from, to}
const clearUnderlines = StateEffect.define()  // {from, to}

const underlineField = StateField.define({
  create() {
    return Decoration.none
  },

  update(underlines, tr) {  // underlines : RangeSet
    underlines = underlines.map(tr.changes)

    for (const e of tr.effects)  {
      try {
        if (e.is(addUnderline)) {
          underlines = underlines.update({
            add: [underlineMark.range(e.value.from, e.value.to)]
          })
        }
        else if (e.is(clearUnderlines)) {
          //
          // Instead of doing a mapping you can supply a filter that returns
          // a boolean.  If false is returned, the item is dropped.  We are
          // dropping all underlines, but demonstrate that if there were some
          // different kinds of marks in this field we could discern them.
          //
          // https://discuss.codemirror.net/t/3809/3
          //
          underlines = underlines.update({
            filter: (f, t, value) => {
              return value.class !== "cm-underline"  // always false, but demo
            }
          })
        }
      } catch (err) {
        console.log(err)
      }
    }

    return underlines
  },

  provide: (f) => EditorView.decorations.from(f)
})


//=//// FUNCTIONS EXPORTED TO REPLPAD /////////////////////////////////////=//
//
// Here we do our poor-man's export of adding and removing underlines to the
// last activated editor.  ReplPad itself is not modularized, so we make these
// things available through the CodeMirror global object.

window.CodeMirror.AddUnderline = function(from, to) {
  let effects = [addUnderline.of({ from, to })]

  if (!cm.state.field(underlineField, false))
    effects.push(StateEffect.appendConfig.of([underlineField, underlineTheme]))

  cm.dispatch({ effects })
  return true
}

window.CodeMirror.ClearUnderlines = function() {
  if (cm.state.field(underlineField, false)) {
    let effects = [clearUnderlines.of()]
    cm.dispatch({ effects })
  }
}


//=//// ORIGINAL COMMAND AND KEYMAP ////////////////////////////////////////=//
//
// This is from the original demo, that ties Ctrl-H to a command that will
// add an underline to the page--based on the current selection.  It's not
// used right now, but the method will probably be useful at some point.
//
// The command is opportunistic, in that if it notices an editing view does
// not have a state field for the underlines, it adds one.

export function underlineSelection(view) {
  let effects = view.state.selection.ranges
    .filter((r) => !r.empty)
    .map(({ from, to }) => addUnderline.of({ from, to }))

  if (!effects.length)
    return false

  if (!view.state.field(underlineField, false))
    effects.push(StateEffect.appendConfig.of([underlineField, underlineTheme]))

  view.dispatch({ effects })

  return true
}

export const underlineKeymap = keymap.of([
  {
    key: "Mod-h",
    preventDefault: true,
    run: underlineSelection
  }
])
