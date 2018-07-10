//
// pump.h
//

#include <string.h>
#include <stdlib.h>
#include <assert.h>
#include <iso646.h> // for `#define not !`, `#define and &&`, etc.
#include <stdint.h>
#include <stdbool.h> // adds C99's `bool`, `true`, `false` to global scope
#include <stdarg.h> // for va_list (implementing variadics like printf)

// Emscripten builds a .js file that contains some amount of code for detecting
// what kind of environment that JS is running in.  `printf("...\n")` is set
// up to go to console.log, hence is useful for debugging--but not for normal
// user interaction.
//
#include <stdio.h>

#if !defined(__cplusplus)
    #define nullptr ((void*)0)
#endif

// Similar to POSIX getline()
// To have it malloc for you, pass lineptr as null
// To get an arbitrary length, pass n as pointer to a value of 0.
//
extern char *js_getline_unless_halt(char **lineptr, size_t *n);

// Similar to C standard library printf()
//
extern void js_printf(const char *fmt, ...);

bool js_sleep_halts(int msec);

// Similar to C's exit()
//
extern void js_exit(int status);
