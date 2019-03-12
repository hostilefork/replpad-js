'use strict'  // <-- FIRST statement! https://stackoverflow.com/q/1335851

// There are two possibilities for how the REPL can accomplish I/O in a way
// that appears synchronous: using pthreads or using the "Emterpreter":
//
// https://emscripten.org/docs/porting/pthreads.html
// https://github.com/kripken/emscripten/wiki/Emterpreter
//
// pthreads rely on SharedArrayBuffer and WASM threading, and hence aren't
// ready in quite all JS environments yet.  However, the resulting build
// products are half the size of what the emterpreter makes, and around
// THIRTY TIMES FASTER.  Hence, the emterpreter is not an approach that is
// likely to stick around any longer than it has to.
//
var use_emterpreter = false

var is_localhost = (  // helpful to put certain debug behaviors under this flag
    location.hostname === "localhost"
    || location.hostname === "127.0.0.1"
    || location.hostname.startsWith("192.168")
)
if (is_localhost) {
    var old_alert = window.alert
    window.alert = function(message) {
        console.error(message)
        old_alert(message)
        debugger
    }
}


// GitHub is queried for this hash if it is not already set, unless running
// on the local host.  (If you run locally and want to test the fetching,
// you'll have to edit the code.)
//
var libr3_git_short_hash = null

// We're able to ask GitHub what the latest build's commit ID is, and then use
// that to ask for the latest Travis build.  GitHub API returns responses via
// JSON, and supports CORS so we can legally do the cross domain request in
// the client (yay!)
//
// https://stackoverflow.com/a/15933109/211160
//
// Note these are "promiser" functions, because if they were done as a promise
// it would need to have a .catch() clause attached to it here.  This way, it
// can just use the catch of the promise chain it's put into.)

var libr3_git_hash_promiser
if (!libr3_git_short_hash && is_localhost)
    libr3_git_hash_promiser = () => Promise.resolve(null)
else {
    libr3_git_hash_promiser = () => {
        console.log("Making GitHub API CORS request for the latest commit ID")

        let owner = "metaeducation"
        let repo = "ren-c"
        let branch = "master"

        return fetch(
            "https://api.github.com/repos/" + owner + "/" + repo
                + "/git/refs/heads/" + branch

          ).then(function (response) {

            // https://www.tjvantoll.com/2015/09/13/fetch-and-errors/
            if (!response.ok)
                throw Error(response.statusText)  // handled by .catch() below

            return response.json();

          }).then(function (json) {

            let hash = json["object"]["sha"];
            console.log("GitHub says latest commit to master was " + hash)
            return hash
          })
    }
}

var lib_suffixes = [
    ".js", ".wasm",  // all builds
    ".wast", ".temp.asm.js",  // debug only
    ".bytecode",  // emterpreter builds only
    ".js.mem", ".worker.js"  // non-emterpreter builds only
]


// At this moment, there are 3 files involved in the download of the library:
// a .JS loader stub, a .WASM loader stub, and a large emterpreter .BYTECODE
// file.  See notes on the hopefully temporary use of the "Emterpreter",
// without which one assumes only a .wasm file would be needed.
//
// If you see files being downloaded multiple times in the Network tab of your
// browser's developer tools, this is likely because your webserver is not
// configured correctly to offer the right MIME type for the .wasm file...so
// it has to be interpreted by JavaScript.  See the README.md for how to
// configure your server correctly.
//
function libRebolComponentURL(suffix) {  // suffix includes the dot
    if (!lib_suffixes.includes(suffix))
        throw Error("Unknown libRebol component extension: " + suffix)

    if (use_emterpreter) {
        if (suffix == ".worker.js" || suffix == ".js.mem")
            throw Error(
                "Asking for " + suffix + " file "
                + " in an emterpreter build (should only be for pthreads)"
            )
    }
    else {
        if (suffix == ".bytecode")
            throw Error(
                "Asking for " + suffix + " file "
                + " in an emterpreter build (should only be for pthreads)"
            )
    }

    // Due to origin policy restrictions, you have to have the libr3.worker.js
    // in the same place your page is coming from.  Fortunately this is a
    // fixed file.
    //
    if (suffix == ".worker.js")
        return "libr3" + suffix

    // !!! These files should only be generated if you are debugging, and
    // are optional.  But it seems locateFile() can be called to ask for
    // them anyway--even if it doesn't try to fetch them (e.g. no entry in
    // the network tab that tried and failed).  Review build settings to
    // see if there's a way to formalize this better to know what's up.
    //
    if (false) {
        if (suffix == ".wast" || suffix == ".temp.asm.js")
            throw Error(
                "Asking for " + suffix + " file "
                + " in a non-debug build (only for debug builds)")
    }

    let dir = libr3_git_short_hash  // empty string ("") is falsey in JS
            ? "https://metaeducation.s3.amazonaws.com/travis-builds/0.16.1/"
            : "../ren-c/make/"  // assumes replpad-js/ is peer to ren-c/ dir

    let opt_dash = libr3_git_short_hash ? "-" : "";

    return dir + "libr3" + opt_dash + libr3_git_short_hash + suffix
}


var Module = {
    //
    // For errors like:
    //
    //    "table import 1 has a larger maximum size 37c than the module's
    //     declared maximum 890"
    //
    // The total memory must be bumped up.  These large sizes occur in debug
    // builds with lots of assertions and symbol tables.  Note that the size
    // may appear smaller than the maximum in the error message, as previous
    // tables (e.g. table import 0 in the case above) can consume memory.
    //
    // !!! Messing with this setting never seemed to help.  See the emcc
    // parameter ALLOW_MEMORY_GROWTH for another possibility.
    //
 /* TOTAL_MEMORY: 16 * 1024 * 1024, */

    locateFile: function(s) {
        //
        // function for finding %libr3.wasm  (Note: memoryInitializerPrefixURL
        // for bytecode was deprecated)
        //
        // https://stackoverflow.com/q/46332699
        //
        console.info("Module.locateFile() asking for .wasm address of " + s)

        let stem = s.substr(0, s.indexOf('.'))
        let suffix = s.substr(s.indexOf('.'))

        // Although we rename the files to add the Git Commit Hash before
        // uploading them to S3, it seems that for some reason the .js hard
        // codes the name the file was built under in this request.  :-/
        // So even if the request was for `libr3-xxxxx.js` it will be asked
        // in this routine as "Where is `libr3.wasm`
        //
        // For the moment, sanity check to libr3.  But it should be `rebol`,
        // or any name you choose to build with.
        //
        if (stem != "libr3")
            throw Error("Unknown libRebol stem: " + stem)

        return libRebolComponentURL(suffix)
    },

    // This is a callback that happens sometime after you load the emscripten
    // library (%libr3.js in this case).  It's turned into a promise instead
    // of a callback.  Sanity check it's not used prior by making it a string.
    //
    onRuntimeInitialized: "<mutated from a callback into a Promise>",

    // If you use the emterpreter, it balloons up the size of the javascript
    // unless you break the emterpreter bytecode out into a separate file.
    // You have to get the data into the Module['emterpreterFile'] before
    // trying to load the emscripten'd code.
    //
    emterpreterFile: "<if `use_emterpreter`, fetch() of %libr3.bytecode>"

    // The rest of these fields will be filled in by the boilerplate of the
    // Emterpreter.js file when %libr3.js loads (it looks for an existing
    // Module and adds to it, but this is also how you parameterize options.)
}


//=// CONVERTING CALLBACKS TO PROMISES /////////////////////////////////////=//
//
// https://stackoverflow.com/a/22519785
//

var dom_content_loaded_promise = new Promise(function(resolve, reject) {
    document.addEventListener('DOMContentLoaded', resolve)
})

var onGuiInitialized
var gui_init_promise = new Promise(function(resolve, reject) {
    //
    // The GUI has to be initialized (DOM initialization, etc.) before we can
    // even use HTML to show status text like "Running Mezzanine", etc.  When
    // all the GUI's services are available it will call onGuiInitialized().
    // This converts that into a promise so it can be used in a clearer-to-read
    // linear .then() sequence.
    //
    onGuiInitialized = resolve
})

var runtime_init_promise = new Promise(function(resolve, reject) {
    //
    // The load of %libr3.js will at some point will trigger a call to
    // onRuntimeInitialized().  We set it up so that when it does, it will
    // resolve this promise (used to trigger a .then() step).
    //
    Module.onRuntimeInitialized = resolve
})


// If we are using the emterpreter, Module.emterpreterFile must be assigned
// before the %libr3.js starts running.  And it will start running some time
// after the dynamic `<script>` is loaded.
//
// See notes on short_hash_promiser for why this is a "promiser", not a promise
//
var bytecode_promiser
if (!use_emterpreter)
    bytecode_promiser = () => {
        console.log("Not emterpreted libr3.js, not requesting bytecode")
        return Promise.resolve()
    }
else {
    bytecode_promiser = () => {
        let url = libRebolComponentURL(".bytecode")
        console.log("Emterpreted libr3.js, requesting bytecode from:" + url)

        return fetch(url)
          .then(function(response) {

            // https://www.tjvantoll.com/2015/09/13/fetch-and-errors/
            if (!response.ok)
                throw Error(response.statusText)  // handled by .catch() below

            return response.arrayBuffer()  // arrayBuffer() method is a promise

          }).then(function(buffer) {

            Module.emterpreterFile = buffer  // must load before emterpret()-ing
          })
    }
}


// Initialization is written as a series of promises for, uh, "simplicity".
//
// !!! Review use of Promise.all() for steps which could be run in parallel.
//
var r3_ready_promise = libr3_git_hash_promiser()  // don't ()-invoke other promisers, pass by value!
  .then(function (hash) {
    //
    // We set a global vs. chain it, because the hash needs to be used by the
    // Module.localFile() callback anyway.

    if (hash)
        libr3_git_short_hash = hash.substring(0,7)  // first 7 characters
    else
        libr3_git_short_hash = ""
  })
  .then(bytecode_promiser)  // needs short hash (now in global variable)
  .then(() => dom_content_loaded_promise)  // to add <script> to document.body
  .then(function() {

    // To avoid a race condition, we don't request the load of %libr3.js until
    // we have the Module declared and the onRuntimeInitialized handler set up.
    // Also, if we are using emscripten we need the bytecode.  Hence, we must
    // use a dynamic `<script>` element, created here--instead of a `<script>`
    // tag in the HTML.
    //
    let script = document.createElement('script')
    script.src = libRebolComponentURL(".js")  // full name includes short hash

    document.body.appendChild(script)

    // ^-- The above will eventually trigger runtime_init_promise, but don't
    // wait on that just yet.  Instead just get the loading process started,
    // then wait on the GUI (which 99.9% of the time should finish first) so we
    // can display a "loading %libr3.js" message in the browser window.
    //
    return gui_init_promise

  }).then(function() {  // our onGuiInitialized() message currently has no args

    console.log('Loading/Running %libr3.js...')
    return runtime_init_promise

  }).then(function() {  // emscripten's onRuntimeInitialized() has no args

    console.log('Executing Rebol boot code...')
    reb.Startup()

    // There is currently no method to dynamically load extensions with
    // r3.js, so the only extensions you can load are those that are picked
    // to be built-in while compiling the lib.  The "JavaScript extension" is
    // essential--it contains JS-NATIVE and JS-AWAITER.
    //
    console.log('Initializing extensions')
    reb.Elide(
        "for-each collation builtin-extensions",
            "[load-extension collation]"
    )
  })
