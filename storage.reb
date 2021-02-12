Rebol [
    File: %storage.reb
    Summary: {File "Scheme" for Persistent Browser Storage}
    Project: "JavaScript REPLpad for Ren-C branch of Rebol 3"
    Homepage: https://github.com/hostilefork/replpad-js/

    Type: Module
    Name: ReplStorage  ; !!! seems needed to get into system/modules list
    Options: [isolate]

    Rights: {
        Copyright (c) 2021 Christopher Ross-Gill
        See README.md and CREDITS.md for more information
    }

    License: {
        Licensed under the Lesser GPL, Version 3.0 (the "License");
        you may not use this file except in compliance with the License.
        You may obtain a copy of the License at

        https://www.gnu.org/licenses/lgpl-3.0.html
    }

    Description: {
        In the terminology of URL handling, a "scheme" is the part of the URL
        that precedes the initial colon (e.g. the `http` in `http://whatever`).

        Because Rebol has a separate data type for URLs, it allows hooks to be
        installed for handling READ and WRITE of different schemes.  This
        gives a handler for `file://` style URLs that speaks to the browser
        storage API.
    }

    Notes: {
        "This currently is a very spongey filesystem. Probably better to
        create entries for directories and manage them through MAKE-DIR, etc."

        Per-web-app browser storage is limited, and since it stores strings
        and not binaries it's further limited by the fact that we encode the
        data as Base64.

        https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API

        Long term, it may be desirable to somehow fuse the file:// API with
        the %xxx style of FILE!, so that you can `mount` local storage into
        a virtual hierarchy that coexists with resources on web servers.
    }
]

storage-enabled?: js-native [] {
    return reb.Logic(
        typeof Storage !== 'undefined'
    )
}

storage-set: js-native [
    store [text!]
    path [text! file!]
    value [text!]
] {
    let store = reb.ArgR('store')
    let path = reb.ArgR('path')
    let value = reb.ArgR('value')

    store = reb.Spell(store) == 'temporary'
        ? sessionStorage
        : localStorage

    store.setItem(
        reb.Spell(path),
        reb.Spell(value)
    )
}

storage-get: js-native [
    store [text!]
    path [text! file!]
] {
    let store = reb.ArgR('store')
    let path = reb.ArgR('path')
    let value

    store = reb.Spell(store) == 'temporary'
        ? sessionStorage
        : localStorage

    value = store.getItem(
        reb.Spell(path)
    )

    return (typeof value !== 'undefined' && value !== null)
        ? reb.Text(value)
        : null
}

storage-unset: js-native [
    store [text!]
    path [text! file!]
] {
    let store = reb.ArgR('store')
    let path = reb.ArgR('path')
    let value

    store = reb.Spell(store) == 'temporary'
        ? sessionStorage
        : localStorage

    store.removeItem(
        reb.Spell(path)
    )

    return null
}

storage-list: js-native [
    store [text!]
    path [text! file!]
] {
    let store = reb.ArgR('store')
    let path = reb.ArgR('path')
    let test
    let parts
    let listing = []
    let mark

    store = reb.Spell(store) == 'temporary'
        ? sessionStorage
        : localStorage

    test = new RegExp(
        '\x5E'  // starting caret -- lost when used literally
        + reb.Spell(path).replace(  // convert path as text to regex blob
            /[|\\\/{}()[\]\x5E)$+*?.]/g,
            '\\$&'
        )
        + '([\x5E\/]+\/?)$'  // only match non-slash characters
    )

    listing.push('[')

    for (mark = 0; mark < store.length; mark++) {
        parts = store.key(mark).match(test)  // match each key against our pattern

        if (parts && listing.indexOf(parts[1]) == -1) {
            listing.push('%' + parts[1])
        }
    }

    listing.push(']')

    console.log(listing)

    return reb.Value.apply(
        null, listing
    )
}

storage-exists?: js-native [
    store [text!]
    path [text! file!]
] {
    let store = reb.ArgR('store')
    let path = reb.ArgR('path')

    store = reb.Spell(store) == 'temporary'
        ? sessionStorage
        : localStorage

    return reb.Logic(
        store.hasOwnProperty(
            reb.Spell(path)
        )
    )
}


either storage-enabled? [  ; Browser reported that it is storage-capable

    sys/make-scheme [
        title: "Browser Storage API"
        name: 'storage

        actor: [
            read: func [port] [
                storage-get "persistent" port/spec/host
            ]

            write: func [port value] [
                storage-set "persistent" port/spec/host value
            ]
        ]
    ]

    sys/make-scheme [
        title: "File Access"
        name: 'file

        init: func [port [port!]] [
            case [
                not all [
                    in port/spec 'ref
                    file? port/spec/ref
                ][
                    fail "File access is only available through the FILE! datatype"
                ]

                equal? #"/" last port/spec/ref [
                    fail "File scheme only accesses files, not folders"
                ]

                url? port/spec/ref: clean-path port/spec/ref [
                    fail "Cannot currently access files relative to URLs"
                ]
            ]

            extend port/spec 'target either find/match port/spec/ref %/tmp/ [
                "temporary"
            ][
                "persistent"
            ]
        ]

        actor: [
            read: func [port] [
                either storage-exists? port/spec/target form port/spec/ref [
                    any [
                        attempt [debase/base storage-get port/spec/target form port/spec/ref 64]
                        as binary! storage-get port/spec/target form port/spec/ref
                    ]
                ][
                    fail "No such file or directory"
                ]
            ]

            write: func [port data] [
                ensure [binary! text!] data

                if text? data [
                    data: to binary! data  ; could use AS ?
                ]

                either exists? first split-path port/spec/ref [
                    storage-set port/spec/target form port/spec/ref enbase/base data 64
                    port
                ][
                    fail "No such file or directory"
                ]
            ]

            delete: func [port] [
                either storage-exists? port/spec/target form port/spec/ref [
                    storage-unset port/spec/target form port/spec/ref
                ][
                    fail "No such file or directory"
                ]

                port
            ]

            query: func [port] [
                if storage-exists? port/spec/target form port/spec/ref [
                    make system/standard/file-info [
                        name: port/spec/ref
                        size: 0
                        date: lib/now  ; we're in a module in a module
                        type: 'file
                    ]
                ]
            ]
        ]
    ]

    sys/make-scheme [
        title: "File Directory Access"
        name: 'dir

        init: func [port [port!]] [
            case [
                not all [
                    in port/spec 'ref
                    file? port/spec/ref
                    ; equal? #"/" first port/spec/ref
                ][
                    fail "File access is only available through the FILE! datatype"
                ]

                not equal? #"/" last port/spec/ref [
                    fail "Directory scheme only accesses folders, not files"
                ]

                url? port/spec/ref: clean-path port/spec/ref [
                    fail "Cannot currently access files relative to URLs"
                ]

                extend port/spec 'target either find/match port/spec/ref %/tmp/ [
                    "temporary"
                ][
                    "persistent"
                ]
            ]
        ]

        actor: [
            read: func [port] [
                ; [%nothing-here-yet]
                either any [
                    did find [%/ %/tmp/] port/spec/ref
                    storage-exists? port/spec/target form port/spec/ref
                ][
                    collect [
                        if port/spec/ref = %/ [
                            keep %tmp/
                        ]

                        keep storage-list port/spec/target form port/spec/ref
                    ]
                ][
                    fail "No such file or directory"
                ]
            ]

            create: func [port] [
                if any [
                    did find [%/ %/tmp/] port/spec/ref
                    storage-exists? port/spec/target form port/spec/ref
                ][
                    fail "Directory already exists"
                ]

                    storage-set port/spec/target form port/spec/ref ""
                    port
                ]

            delete: func [port] [
                case [
                    did find [%/ %/tmp/] port/spec/ref [
                        port
                    ]

                    not storage-exists? port/spec/target form port/spec/ref [
                        fail "No such file or directory"
                    ]

                    not empty? read port/spec/ref [
                        fail "Directory not empty"
                    ]

                    <else> [
                        storage-unset port/spec/target form port/spec/ref
                        port
                    ]
                ]
            ]

            query: func [port] [
                if any [
                    did find [%/ %/tmp/] port/spec/ref
                    storage-exists? port/spec/target form port/spec/ref
                ][
                    make system/standard/file-info [
                        name: port/spec/ref
                        size: 0
                        date: lib/now  ; we're in a module in a module
                        type: 'dir
                    ]
                ]
            ]
        ]
    ]

    use [err][
        if error? err: trap [change-dir %/][
            write log:type=error mold err
        ]
   ]

][
    ; If the browser reported it was not capable of doing storage operations,
    ; set up some stubs that will error if the schemes are used.
    ;
    ; Note that any browser modern enough to have Wasm is probably capable of
    ; doing storage.  So the more likely case of it being unavailable is if it
    ; is running in a context where the feature has been disabled.

    sys/make-scheme [
        title: "Browser Storage API"
        name: 'storage

        init: func [port [port!]] [
            fail "Local Storage Not Supported (or Disabled by Browser)"
        ]

        actor: []
    ]

    sys/make-scheme [
        title: "File Access"
        name: 'file

        init: func [port [port!]] [
            fail "Local Storage Not Supported (or Disabled by Browser)"
        ]

        actor: []
    ]

    sys/make-scheme [
        title: "File Directory Access"
        name: 'dir

        init: func [port [port!]] [
            fail "Local Storage Not Supported (or Disabled by Browser)"
        ]

        actor: []
    ]
]
