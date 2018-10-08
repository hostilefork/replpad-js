hello-js: js-native [
    {Demo of Rebol calling JavaScript, which in turn uses the JS libRebol API}
    x [integer!]
]{
    // Note the spec is a Rebol block, but the body is a string of JavaScript

    var x = rebArg('x');
    console.log('Hello from user native, x is ' + rebUnboxInteger(rebR(x)));
}
