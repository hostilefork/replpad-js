Rebol [
    File: %storage.reb
    Summary: "File Scheme for Persistent Browser Storage"
    Project: "JavaScript REPLpad for Ren-C branch of Rebol 3"
    Homepage: https://github.com/hostilefork/replpad-js/

    Type: module
    Name: ReplStorage  ; !!! seems needed to get into system/modules list
    Exports: [storage]

    Rights: --{
        Copyright (c) 2021 Christopher Ross-Gill
        See README.md and CREDITS.md for more information
    }--

    License: --{
        Licensed under the Lesser GPL, Version 3.0 (the "License");
        you may not use this file except in compliance with the License.
        You may obtain a copy of the License at

        https://www.gnu.org/licenses/lgpl-3.0.html
    }--

    Description: --{
        In the terminology of URL handling, a "scheme" is the part of the URL
        that precedes the initial colon (e.g. the `http` in `http://whatever`).

        Because Rebol has a separate data type for URLs, it allows hooks to be
        installed for handling READ and WRITE of different schemes.  This
        gives a handler for `file://` style URLs that speaks to the browser
        storage API.
    }--

    Notes: --{
        "This currently is a very spongey filesystem. Probably better to
        create entries for directories and manage them through MAKE-DIR, etc."

        Per-web-app browser storage is limited, and since it stores strings
        and not binaries it's further limited by the fact that we encode the
        data as Base64.

        https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API

        Long term, it may be desirable to somehow fuse the file:// API with
        the %xxx style of FILE!, so that you can `mount` local storage into
        a virtual hierarchy that coexists with resources on web servers.
    }--
]

/storage-enabled?: js-native [] --{
    return reb.Logic(
        typeof Storage !== 'undefined'
    )
}--

/storage-set: js-native [
    store [text!]
    path [text! file!]
    value [text!]
] --{
    let store = (reb.Spell("store") == 'session')
        ? sessionStorage
        : localStorage

    store.setItem(
        reb.Spell("path"),
        reb.Spell("value")
    )
}--

/storage-get: js-native [
    store [text!]
    path [text! file!]
] --{
    let store = reb.Spell("store") == 'session'
        ? sessionStorage
        : localStorage

    let value = store.getItem(reb.Spell("path"))

    return (typeof value !== 'undefined' && value !== null)
        ? reb.Text(value)
        : null
}--

/storage-unset: js-native [
    store [text!]
    path [text! file!]
] --{
    let store = reb.Spell("store") == 'session'
        ? sessionStorage
        : localStorage

    store.removeItem(reb.Spell("path"))

    return null
}--

/storage-clear: js-native [
    store [text!]
] --{
    let store = reb.Spell("store") == 'session'
        ? sessionStorage
        : localStorage

    console.log(store)

    store.clear()

    return null
}--

; STORAGE-LIST and STORAGE-LIST-DIR are very similar, it may be desirable to
; combine the two with some type of generic filter refinement

/storage-list: js-native [
    store [text!]
] --{
    let store = reb.Spell("store") == 'session'
        ? sessionStorage
        : localStorage

    console.log(store)

    let listing = []
    listing.push('[')

    let offset
    for (
        offset = 0;
        offset < store.length;
        offset++
    ) {
        // TODO: need to escape carets
        listing.push('"' + store.key(offset) + '"')
    }

    listing.push(']')

    return reb.Value.apply(
        null, listing
    )
}--

/storage-list-dir: js-native [
    store [text!]
    path [text! file!]
] --{
    let store = reb.Spell("store") == 'session'
        ? sessionStorage
        : localStorage

    let test = new RegExp(
        '\x5E'  // starting caret -- lost when used literally
        + reb.Spell("path").replace(  // convert path as text to regex blob
            /[|\\\/{}()[\]\x5E)$+*?.]/g,
            '\\$&'
        )
        + '([\x5E\/]+\/?)$'  // only match non-slash characters
    )

    let listing = []
    listing.push('[')

    let offset
    for (
        offset = 0;
        offset < store.length;
        offset++
    ) {
        // match each key against our pattern
        let parts = store.key(offset).match(test)

        if (parts && listing.indexOf(parts[1]) == -1) {
            // TODO: need to escape carets
            listing.push('%"' + parts[1] + '"')
        }
    }

    listing.push(']')

    console.log(listing)

    return reb.Value.apply(
        null, listing
    )
}--

/storage-exists?: js-native [
    store [text!]
    path [text! file!]
] --{
    let store = reb.Spell("store") == 'session'
        ? sessionStorage
        : localStorage

    return reb.Logic(
        store.hasOwnProperty(
            reb.Spell("path")
        )
    )
}--

storage: [
    local _
    session _
]

if storage-enabled? [  ; Browser reported that it is storage-capable
    sys.util/make-scheme [
        title: "Browser Storage API"
        name: 'storage

        /init: func [return: [~] port [port!]] [
            if not all [
                has port.spec 'ref
                url? port.spec.ref
                [# port.spec.path]: find:match form port.spec.ref form storage::
                find ["local" "session"] port.spec.path
            ][
                fail "Could not initiate storage port"
            ]
        ]

        actor: make object! [
            /pick: /select: lambda [port key] [
                storage-get port.spec.path form key
            ]

            /poke: lambda [port key value] [
                either null? :value [
                    storage-unset port.spec.path form key
                ][
                    storage-set port.spec.path form key form value
                ]
            ]

            /query: /copy: lambda [port] [
                storage-list port.spec.path
            ]

            /clear: func [port] [
                storage-clear port.spec.path
                return port
            ]
        ]
    ]

    storage.local: make port! storage::local
    storage.session: make port! storage::session

    sys.util/make-scheme [
        title: "File Access"
        name: 'file

        /init: func [return: [~] port [port!]] [
            case [
                not all [
                    has port.spec 'ref
                    file? port.spec.ref
                ][
                    fail "File scheme is only accessible through the FILE! datatype"
                ]

                equal? #"/" last port.spec.ref [
                    fail "File scheme only accesses files, not folders"
                ]
            ]

            switch type of port.spec.ref: clean-path port.spec.ref [
                file! [
                    extend port.spec 'target either find/match port.spec.ref %/tmp/ [
                        "session"
                    ][
                        "local"
                    ]
                ]

                url! [
                    ; possibly some kind of check here to ensure a scheme exists
                    ; and convert to FILE! if using file:// notation
                ]

                (fail "Cannot resolve file")
            ]
        ]

        actor: [
            /read: lambda [port] [
                switch type of port.spec.ref [
                    file! [
                        either storage-exists? port.spec.target form port.spec.ref [
                            any [
                                attempt [debase:base storage-get port.spec.target form port.spec.ref 64]
                                as binary! storage-get port.spec.target form port.spec.ref
                            ]
                        ][
                            fail "No such file or directory"
                        ]
                    ]

                    url! [
                        read port.spec.ref
                    ]
                ]
            ]

            /write: lambda [port data <local> dir] [
                switch type of port.spec.ref [
                    file! [
                        ensure [binary! text!] data

                        if text? data [
                            data: to binary! data  ; could use AS ?
                        ]

                        either exists? dir split-path port.spec.ref [
                            storage-set port.spec.target form port.spec.ref enbase:base data 64
                            port
                        ][
                            fail "No such file or directory"
                        ]
                    ]

                    url! [
                        write port.spec.ref data
                    ]
                ]
            ]

            /delete: lambda [port] [
                switch type of port.spec.ref [
                    file! [
                        either storage-exists? port.spec.target form port.spec.ref [
                            storage-unset port.spec.target form port.spec.ref
                        ][
                            fail "No such file or directory"
                        ]

                        port.spec.ref
                    ]

                    url! [
                        delete port.spec.ref
                    ]
                ]
            ]

            /query: func [return: [~null~ object!] port [port!]] [
                switch type of port.spec.ref [
                    file! [
                        let store: port.spec.target
                        let path: form port.spec.ref

                        if not storage-exists? store path [return null]

                        return make system.standard.file-info [
                            name: port.spec.ref
                            size: 0
                            date: lib/now  ; we're in a module in a module
                            type: 'file
                        ]
                    ]

                    url! [
                        return query port.spec.ref
                    ]
                ]
                return null
            ]
        ]
    ]

    sys.util/make-scheme [
        title: "File Directory Access"
        name: 'dir

        /init: func [return: [~] port [port!]] [
            case [
                not all [
                    has port.spec 'ref
                    file? port.spec.ref
                    ; equal? #"/" first port.spec.ref
                ][
                    fail "File scheme is only accessible through the FILE! datatype"
                ]

                not equal? #"/" last port.spec.ref [
                    fail "Directory scheme only accesses folders, not files"
                ]
            ]


            switch type of port.spec.ref: clean-path port.spec.ref [
                file! [
                    extend port.spec 'target either find:match port.spec.ref %/tmp/ [
                        "session"
                    ][
                        "local"
                    ]
                ]

                url! [
                    ; possibly some kind of check here to ensure a scheme exists
                    ; and convert to FILE! if using file:// notation
                ]

                fail "Cannot resolve file"
            ]
        ]

        actor: [
            /read: lambda [port] [
                switch type of port.spec.ref [
                    file! [
                        either any [
                            find [%/ %/tmp/] port.spec.ref
                            storage-exists? port.spec.target form port.spec.ref
                        ][
                            collect [
                                if port.spec.ref = %/ [
                                    keep %tmp/
                                ]

                                keep spread (
                                    storage-list-dir port.spec.target form port.spec.ref
                                )
                            ]
                        ][
                            fail "No such file or directory"
                        ]
                    ]

                    url! [
                        read port.spec.ref
                    ]
                ]
            ]

            /create: lambda [port] [
                switch type of port.spec.ref [
                    file! [
                        if any [
                            find [%/ %/tmp/] port.spec.ref
                            storage-exists? port.spec.target form port.spec.ref
                        ][
                            fail "Directory already exists"
                        ]

                        storage-set port.spec.target form port.spec.ref ""
                        port.spec.ref
                    ]

                    url! [
                        create port.spec.ref
                    ]
                ]

            ]

            /delete: lambda [port] [
                switch type of port.spec.ref [
                    file! [
                        case [
                            find [%/ %/tmp/] port.spec.ref [
                                port
                            ]

                            not storage-exists? port.spec.target form port.spec.ref [
                                fail "No such file or directory"
                            ]

                            not empty? read port.spec.ref [
                                fail "Directory not empty"
                            ]

                            <else> [
                                storage-unset port.spec.target form port.spec.ref
                                port
                            ]
                        ]
                    ]

                    url! [
                        delete port.spec.ref
                    ]
                ]

            ]

            /query: lambda [port] [
                switch type of port.spec.ref [
                    file! [
                        if any [
                            find [%/ %/tmp/] port.spec.ref
                            storage-exists? port.spec.target form port.spec.ref
                        ][
                            make system.standard.file-info [
                                name: port.spec.ref
                                size: 0
                                date: lib/now  ; we're in a module in a module
                                type: 'dir
                            ]
                        ]
                    ]

                    url! [
                        query port.spec.ref
                    ]
                ]
            ]
        ]
    ]
]
