# ReplPad Storage

The ReplPad Storage module provides an API to the [**localStorage** and **sessionStorage**](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API) objects in JavaScript. It has two main interfaces:

1. Through schemes specific to getting and setting to each object directly,

2. Through a filesystem scheme that attempts to simulate a desktop filesystem.

On initiating the module, these schemes are immediately available:

```plain
do %storage.r
```

## Storage Scheme

The Storage scheme maps each storage object to its own port. A **port!** for each object is created upon initiating the Storage module:

```plain
storage.local  ; maps to localStorage
storage.session  ; maps to sessionStorage
```

The storage scheme supports the following methods:

<table>
<th align="left">Method<th align="left">Description<th align="left">Example
<tr><td>

**poke**

<td>

Used to set a key's value

<td>

```plain
poke storage.session "Key" "Value"
````

<tr><td>

**select**

<td>

Used to retrieve a key's value

<td>

```plain
select storage.session "Key"
````

<tr><td>

**query**

<td>

Returns a listing of an object's keys

<td>

```plain
query storage.session
````

<tr><td>

**clear**

<td>

Clears all stored values of a given obect

<td>

```plain
clear storage.session
````

</table>

## File Scheme

The File/Dir schemes replaces the inbuilt File/Dir schemes (which are redundant within the browser context) simulating the functionality of those schemes using **localStorage** and **sessionStorage** objects in place of the local filesystem. Upon initiating the Storage module, File/Dir schemes are ready to use:

```plain
probe read %/
change-dir %/tmp/
write %my-file.txt "Some Text"
probe read %my-file.txt
make-dir %dir/
change-dir %dir/
probe what-dir
probe read %../
write %hello.r {Rebol [] print "Hello!"}
do %hello.r
```

The **localStorage** object is mounted as `%/` and the **sessionStorage** object is mounted as `%/tmp/`. Any files stored to `%/tmp` will be lost once the current browser session is closed.

The storage scheme supports the following methods, amongst others:

<table>
<th align="left">Method<th align="left">Description<th align="left">Example
<tr><td>

**create %folder/**

<td>

Creates a new folder

<td>

```plain
; MAKE-DIR wraps CREATE
make-dir %/folder/
````

<tr><td>

**write %file**

<td>

Writes content to a given file

<td>

```plain
write %/folder/file.txt "Some Text"
````

<tr><td>

**read %file**

<td>

Read a file's content (returns **binary!**)

<td>

```plain
read %/folder/file.txt
````

<tr><td>

**read %folder/**

<td>

Read a folder's content (returns **block!**)

<td>

```plain
read %/folder/
````

<tr><td>

**delete %file**

<td>

Deletes a file (returns the full path to a deleted file)

<td>

```plain
delete %/folder/file.txt
````
<tr><td>

**delete %folder/**

<td>

Deletes a folder (so long as the folder is empty)

<td>

```plain
delete %/folder/
````

</table>
