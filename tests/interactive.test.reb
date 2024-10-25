Rebol [
    Title: "ReplPad Guided Interactive Behavior Test"

    Type: Module

    Description: --{
        While automated testing can check some things, it is not necessarily
        feasible to check *everything* programmatically.  Questions of whether
        or not scroll bars show up, or if you can right click and get the right
        kind of menu, are details that get fixed...but then can wind up being
        broken now and again.

        The goal of this script is to provide a guided checklist--many for
        issues that have come up in the past as breaking.  If you get failures,
        and there's a bug already existing for it...it will guide you to the
        GitHub issue where it was previously discussed to reopen it.

        Each step is run as a function called OKAY.  The function advances a
        step and updates its state, but then returns control to ReplPad.  This
        leaves the user to interact with the UI in its "natural state"
        between the steps.
    }--

    Exports: [okay ok k nope]
]

; This may not be running from a console, e.g. it might be run via "?do=" on
; the URL line.  Hence `system.console` may not be set yet.  We have to let
; this script fall through to normal console processing, and let the first
; run of OKAY capture it.
;
saved-print-prompt: null

steps: [
    #EMPTY-LEFT-CLICK-TEST 39 ---{

    You should be able to select some text on the page, to where the input
    doesn't have the focus (so no blinking cursor).  Do that, and then try
    clicking in the empty input area below.  It should not be difficult to
    get the cursor to show up.. clicking pretty much anywhere at-or-below the
    prompt line should cause it to appear.

    }--- (
        ; !!! We could automatically select something, perhaps repeatedly,
        ; and ask the users to do some repeated clicking to get the focus.
        ; This would get them to test multiple spots.
    )

    #RIGHTCLICK-PASTE-TEST 37 ---{

    Similarly to how the blank input area should be willing to take left
    clicks, you should be able to right click...and get a useful menu that
    lets you paste content.  We've preloaded the clipboard with OKAY, so
    make sure you get the offer to paste when you click around in the empty
    area below.  (Note the menu should specifically offer you "Paste" and
    know it's a text input...not just give you the generic `View Source`/etc.
    that you get everywhere else).

    }--- (
        write clipboard:// "okay"
    )

    #KEYBOARD-PASTE-TEST ---{

    While we've got "OKAY" on the clipboard, why not make sure that you can
    paste that with the keyboard Ctrl-V shortcut too.

    }--- (
        write clipboard:// "okay"  ; in case they copied something else
    )

    #LONG-PROMPT-TEST 58 ---{

    There have been some issues with long prompts.  We're changing the prompt
    temporarily to a longer one, it should still line break normally.

    }--- (
        ; `system.console.prompt` is just inert data that may or may not be
        ; used by a hooked PRINT-PROMPT function.  So we override the function.
        ; (Restored by the next OKAY command.)
        ;
        system.console.print-prompt: does [
            write-stdout "How's this really long prompt working?>> "
        ]
    )

    #SCROLLBAR-PRESERVATION-TEST ---{

    While the interpreter is running a long operation that prints output,
    we want you to be able to scroll around and make selections--not having
    it disturb your scrolled-to position.  So when you are ready, hit enter
    and we will print a few lines of output.  Scroll up and make some
    selections, and confirm that neither your window position nor selection
    are disturbed by the output being added.

    }--- (
        write-stdout "Hit [Enter] when you're ready to scroll up..."
        ask text!
        repeat 16 [
            print "Scroll up and be sure this output isn't interfering!"
            wait 0.5
        ]
    )

    #KEYBOARD-JUMP-TEST ---{

    If you're scrolled up somewhere and want to jump to the input without
    needing to reach for the scroll bar, typing a printable key should get
    you there.  Give it a try--scroll up so the input isn't visible, and
    then when you type the `O` for OKAY it should jump you back down.

    }--- ()

    #KEYBOARD-NOJUMP-TEST ---{

    While printable keys should jump you down to the input for focus, things
    like Ctrl-C for copying (for example) should not.  Scroll up to one of
    the previous OKAYs, select it with the mouse, and copy it with Ctrl-C
    (or Command-C on Mac, whatever your copying shortcut is).  Sadly,
    paste won't make the console jump like a printable character would...
    we're looking into that.

    }--- (
        write clipboard:// "NOPE"  ; preload with bad input if copy fails
    )

    ; Ctrl-V doesn't act as a printable key and jump, might be nice if it could
    ; https://github.com/hostilefork/replpad-js/issues/59
]


label: description: bug: _  ; state we need to know about to report error

/k: /ok: /okay: function [
    return: [<nihil>]
    <with> steps label description bug saved-print-prompt
][
    ; Console must be started when first OKAY is run, so SYSTEM.CONSOLE should
    ; be set by that point.  But we only want to set it the first time (other
    ; times it could be purposefully changed by the test code)
    ;
    /saved-print-prompt: default [system.console.print-prompt/]

    print newline
    replpad-write:html "<hr>"
    print newline

    ; Always restore the prompt, in case a test changed it.
    ;
    system.console.print-prompt: :saved-print-prompt

    if tail? steps [
        print "CONGRATULATIONS, you are all done."
        print "Type OKAY to restart the checklist."
        steps: head steps
        return nihil
    ]

    steps: parse steps [
        label: issue!
        opt bug: integer!  ; optional GitHub issue number
        description: across [some text!] (print description)
        opt [code: group! (eval code)]
        accept <here>
    ] except [
        fail "Problem in STEPS parsing"
    ]

    print newline
    print "    (Type OKAY, K, or OK if it works, NOPE if there's a problem)"
    return nihil
]


/nope: function [
    return: [<nihil>]
][
    ; Always restore the prompt, in case a test changed it.
    ;
    if get $saved-print-prompt [  ; won't be set if NOPE was the first thing!
        system.console.print-prompt: saved-print-prompt/
    ]

    print ["O noes." if bug ["Broken, again?!!"] "(✖╭╮✖)"]

    print ["Please file your findings with any additional notes on GitHub."]
    print ["Mention the browser you're using and the platform, etc. etc."]

    if bug [
        print "Since the issue has happened before, add your findings here:"
        browse join https://github.com/hostilefork/replpad-js/issues/ bug
    ] else [
        print "This is a new issue, so please open it at:"
        browse https://github.com/hostilefork/replpad-js/issues/new
    ]

    print "    (Then type OKAY to continue)"
    return nihil
]


print [
    "Welcome to the ReplPad Guided Interactive Behavior Test!" LF
    LF
    "You will be asked to perform steps which test the functionality of the"
    "ReplPad, for things we can't (easily) make automated tests for.  This is"
    "a huge help, so thank you for taking the time!" LF
    LF
    "When you are ready, type OKAY (or OK, or simply K)"
]

; !!! This falls through to the console, so that we get things set up like
; `system.console` so we can tweak the prompt, etc. and have all the
; interactivity the user expects...even if they ran it from `?do=` vs.
; by having a console already and running `do`.  At the moment, there's no
; way to communicate back to the caller whether a console is desired or not,
; so it just assumes if your script terminates that you wanted one.
