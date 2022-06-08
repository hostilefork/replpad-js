//
// %codemirror-interop.js
//
// Because the ReplPad is not itself modularized, it cannot use `import`.
// This module is used as a trick to do its own imports, and then poke that
// into global visibility as `window.CodeMirror`.
//

import * as state from './libs/@codemirror/state.js'
import * as view from './libs/@codemirror/view.js'

// The initial attempt at getting CodeMirror working was to find out the
// minimum that it took to get an editor window up.  Then consider what to
// build after that--possibly even seeing if Ren-C code could be used instead
// of pure JavaScript (at least for non-performance-critical parts).
//
// The minimum is basically `state` and `view`.  But if you want features like
// highlighting matching braces and other such things, they are in language.
// Many commands are in `commands.js` ranging from simple cursoring to a full
// behavior of acting like Emacs, and it's the size of state and view combined.
// So we'll bring things in here on an as-needed basis.
//
//   import * as language from './libs/@codemirror/language.js'
//   import * as commands from './libs/@codemirror/commands.js'

window.CodeMirror = { view, state /*, language, commands */ }
