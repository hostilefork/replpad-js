; test accessing relative files on the HTTP(S) scheme
(
    all [
        url? system.options.current-path
        binary? read %storage.reb
    ]
)

; check to see if the storage module has been loaded
(did find system.modules 'ReplStorage)
(did find read %/ %tmp/)
(port? write %/test.txt "A Test")
(#{412054657374} = read %/test.txt)

; a handful of CLEAN-PATH tests
(equal? (join what-dir %foo) (clean-path %foo))
(equal? http://rebol.info/ (clean-path http://rebol.info/.././foo/../..))
(equal? %/ clean-path %/../)
(equal? %/tmp/ (clean-path/dir %/abc/../def/../../tmp))

; don't know a way to test these, but they shouldn't create an error:
(port? write log::error "An Error Message")
(port? write log::info "Information")
(port? write log::info "Information")
(port? append make port! log::warn 123456)
