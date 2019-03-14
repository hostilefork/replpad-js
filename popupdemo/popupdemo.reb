REBOL [
    Title: {Primordial Popup Window via libRebol in JavaScript}

    Description: {
       This is a proof-of-concept of how JavaScript UI concepts could
       be integrated with libRebol.js.  In order to not require a giant
       framework to do so, this very minimal plain JS example of a
       floating dialog box was picked:

       https://codepen.io/tovic/pen/XJEONy

       If someone really wanted to develop a VID-like system, they
       would likely benefit from a framework.  I just don't know what a
       good choice would be at the time of writing.

       What this is really for is just to explore fundamentals of a
       windowed UI and how it might be involved with things like
       infinite loops, halting, and other cross-cutting concerns.
    }
]

; !!! Issue: Right now what DO does is based on READ/STRING since the hook to
; fetch() => BINARY! has not been made.  This means the path is not known, and
; so it runs from wherever.  :-/  The startup "directory" of the JS app should
; be set to the URL of the page, so it knows where it is and can track DO-ing
; relative URLs.  Until then, JS-DO and CSS-DO are stuck being relative to
; the URL in the bar, not the URL of the script.
;
css-do %popupdemo/popupdemo.css
js-do %popupdemo/popupdemo.js

show-dialog: js-native [] {
    setDialog("open", {
        title: "Popup Demo",
        width: 400,
        height: 200,
        content: "Hello!",
        buttons: {
            "Delete": function() {
                setDialog("open", {
                    title: "Confirmation",
                    content: "Are you sure?",
                    overlay: true,
                    buttons: {
                        "Yes": function() {
                            setDialog("close")
                        },
                        "No": function() {
                            alert("Canceled!")
                            setDialog("close")
                        }
                    }
                })
            }
        }
    })
}

hide-dialog: js-native [] {
    setDialog("close")
}

print "Popup Demo (JavaScript/CSS from https://codepen.io/tovic/pen/XJEONy)"
print "Try SHOW-DIALOG and HIDE-DIALOG"
