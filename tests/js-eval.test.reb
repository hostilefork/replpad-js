; JS-EVAL is able to recognize some value types and return them as their
; Rebol-valued equivalents.
;
(3 = js-eval "1 + 2")
("Hello" = js-eval --{"He" + "llo"}--)
(null? js-eval "null")
(void? js-eval "undefined")


; Using @ is a way of splicing handles into JS-EVAL or JS-DO expressions
; This ducks questions of escaping in strings, for instance.
(
    text: --{ ykcirT" a s'tI}--

    --{It's a "Tricky String"}--
    == js-eval [--{reb.Spell("reverse",}-- @text --{) + "String" + '"'}--]
)(
    o: make object! [i: 1020]
    1020 = js-eval [--{reb.Unbox(}-- @o.i --{)}--]
)(
    x: 1000
    y: 20
    1020 = js-eval [--{reb.Unbox(}-- @(x + y) --{)}--]
)

; SPELL and UNBOX are shorthands, saving some typing
(
    text: "Hello"
    "Hello World" = js-eval [spell @text --{+ " World"}--]
)(
    x: 1000
    1020 = js-eval [--{20 +}-- unbox @x]
)

; GROUP!-w/no-@ is run normally, so you get literal text in the string
(
    text: "gnirob"
    "boring group" = js-eval [--{"}-- (reverse text) --{ group"}--]
)
