REBOL [
    Title: {Primordial VID-in-Web-Browser Demo}

    Description: {
       This is a proof-of-concept of how JavaScript UI concepts could
       be integrated with libRebol.js.  In order to not require a giant
       framework to do so, this very minimal plain JS example of a
       floating dialog box was picked:

       https://codepen.io/tovic/pen/XJEONy

       If someone really wanted to develop a VID-like system, they
       would likely benefit from a framework.  I just don't know what a
       good choice would be at the time of writing.

       What this is really for is just to explore issues of a more
       complex UI and how it might be involved with things like
       infinite loops, halting, and other cross-cutting concerns.
    }
]

css-do %webvid.css
js-do %webvid.js

show-dialog: js-native [] {
    setDialog("open", {
        title: "The Dialog Box Title",
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

print "%webvid.reb load completed"
print "Try SHOW-DIALOG and HIDE-DIALOG"
