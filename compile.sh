# Simple command line for building %c-pump.o.js from a bash shell
#
# emcc command-line options:
# https://kripken.github.io/emscripten-site/docs/tools_reference/emcc.html
# Note environment variable EMCC_DEBUG for diagnostic output
#

# WASM does not have source maps, so disabling it to aid debugging
# However, WASM=0 does not work in VirtualBox shared folders by default:
# https://github.com/kripken/emscripten/issues/6813
# Building into a non-shared folder and copying back seems to work.
#
TEMPDIR=`mktemp -d`
echo "Building to $TEMPDIR"

# For larger projects, the emterpreter whitelist/blacklist is expected
# to be large, so it is broken out into a file.
#
# EXPORTED_FUNCTIONS is redundant with EMSCRIPTEN_KEEPALIVE annotations
# in the source.  It's not necessary to use it if you can put those
# annotations on--only libraries that you can't modify--but leaving it 
# here for documentation and awareness of its existence for libraries.
# Addtional hacks or helpers may be exported via EMSCRIPTEN_KEEPALIVE.
#
# SAFE_HEAP=1 does not work with WASM
# https://github.com/kripken/emscripten/issues/4474
#
emcc repl.c c-pump.c -o $TEMPDIR/c-pump.o.js \
    -O0 \
    -g \
    -s WASM=0 \
    -s EXPORTED_FUNCTIONS="['_init_c_pump', '_c_on_event','_repl']" \
    -s DISABLE_EXCEPTION_CATCHING=1 \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s EMTERPRETIFY=1 \
    -s EMTERPRETIFY_WHITELIST=@emterpreter_whitelist.json \
    -s EMTERPRETIFY_BLACKLIST="['_c_on_event','_malloc']" \
    -s EMTERPRETIFY_ASYNC=1 \
    -s ASSERTIONS=1 \
    -s SAFE_HEAP=1 \
    -s DEMANGLE_SUPPORT=1 \
    --profiling-funcs \
    --minify 0 \
    --memory-init-file 1

# Workaround Virtual Box shared folder with WASM=0 problem
echo "Copying build products from $TEMPDIR to build/"
cp $TEMPDIR/* build
rm -r $TEMPDIR

