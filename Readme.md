muffin.js
=========

A set of handy helpers for your Cakefiles.

## What you get

A set of generic high level file operations you don't want to implement yourself, like copying files, CoffeeScript compilation and compile time requiring, minification, and SLOC counting.

## Installation

Using `npm`, do

    npm install muffin

and then require in your file using

```coffeescript
muffin = require 'muffin'
```


## General use

`muffin.js`

  + allows you to define a map of actions to take using certain files, making making Makefile style Cakefiles a bit easier
  + takes this map from you as a set of file to action pairs, where you specify the file as a regex pattern (then run on the source tree), and the action as a Javascript function.
  + provides a bunch of high level functions to use within those map actions to do real work, like compiling trees of CoffeeScript files
  + includes free goodies like file system watching, so that when a file changes the action is re run, the ability to operate on the git stage instead of the current state in the file system, and handy callbacks sprinkled about which deal with weird asynchronous race conditions for you.

## Reference

First, the main entry point, `muffin.run`:

```coffeescript
muffin.run(options)
```

Call this function in your Cake task and pass it some `options`. `options` is an object containing the keys:

  + `files`: a `String` or `Array` thereof of files (relative to the Cakefile) which muffin will look at. The string or strings can be single file paths or `glob(3)` style paths with `*` and `**` style wildcards and such.
  + `options`: another `Object`, containing any options passed in from Cake (so you don't have to extend the first object)
  + `map`: another `Object`, who's keys are `String`s and values are `Function`s.
    + Each `key`, `value` pair in the `map` gets uses as a pattern -> action pair upon the files passed in as `options.files`. For any files matching the pattern (converted to a `RegExp` from the string), the function is called with the `RegExp` matches as its only argument.
  + `before`: accepts a `Function` to be called before any actions are run.
  + `after`: accepts a `Function` to be called after all actions have been run the first time, or after a watched file triggers its own action.

### An example

Take a look at this example from the `muffin.js` Cakefile itself:

```coffeescript
# Define a Cake task called build
task 'build', 'compile muffin', (options) ->
  # Run a map on all the files in the src directory
  muffin.run
    files: './src/**/*'
    options: options
    # For any file matching 'src/muffin.coffee', compile it to 'lib/muffin.js'
    map:
      'src/muffin.coffee' : (matches) -> muffin.compileScript(matches[0], 'lib/muffin.js', options)
```

We define a `build` task, and in it we run `muffin` on all the files anywhere within the `src` dir. For all of these files who's filenames match `src/muffin.coffee`, which is really just one I guess, we get `muffin` to compile it to `lib/muffin.js`, according to the options passed to the Cake task.

From a more complex project:

```coffeescript
task 'test', 'compile project.js and the tests and run them on the command line', (options) ->
  # Require a library for making temporary directories and the qunit command line runner
  temp    = require 'temp'
  runner  = require 'qunit'

  tmpdir = temp.mkdirSync()

  # Track weather or not this is the first time the map has been run
  first = false

  # Run a map on both the source files and the test files
  muffin.run
    files: ['./src/**/*.coffee', './tests/**/*.coffee']
    options: options
    # Compile the project coffeescript and all the tests into a temporary directory
    map:
     'src/project.coffee'               : (matches) -> muffin.compileTree(matches[0], "#{tmpdir}/project.js", muffin.extend {notify: first}, options)
     'tests/project/(.+)_test.coffee'   : (matches) -> muffin.compileScript(matches[0], "#{tmpdir}/#{matches[1]}_test.js", muffin.extend {notify: first}, options)
     'tests/project/test_helper.coffee' : (matches) -> muffin.compileScript(matches[0], "#{tmpdir}/test_helper.js", muffin.extend {notify: first}, options)
    after: ->
      # After successfull compilation, run the tests in this temporary directory. Note that this after callback
      # gets fired after all the actions have completed the first time, and then if in watch mode, after any action
      # completes a second time.
      first = true
      runner.run
        code:  "#{tmpdir}/project.js"
        deps: ["jsdom", "#{tmpdir}/test_helper.js", "./tests/lib/jquery.js"]
        tests: glob.globSync("#{tmpdir}/*_test.js")
```

## Reference

Below are some notes on the helper functions available for use in the map actions. Note that `muffin` internally uses [`q`](https://github.com/kriskowal/q "q on github"), a JavaScript promise library which makes it really easy to interface with the asynchronous scheduling piece of `muffin`. If your action function is asynchronous, which it almost always will be, you must return a `q.Promise` from your action function. By doing this, `muffin` can ensure the `after` callbacks do in fact run after all the actions have been completed.

All the functions below return 'q.Promise' objects, so using them as they are used in the examples above works quite well.

If you want to use compound actions (such as reading to a file, transforming it, and then writing it or something equivalently non trivial), have a look at the [`q` readme](https://github.com/kriskowal/q#readme). Kris explains the benefits of using promises, and explains how to join, intersect, and chain them so your Cakefiles look simply sublime.

All the methods below accept an `options` parameter, which you can just pass in from the Cake task or modify as in the second example. Common options to all methods:

  + `notify`: Wheather or not to notify the user (growl and command line) about the result of the action

The methods:

    muffin.readFile(source, options = {})

Reads a file in from the source, returning a promise which resolves to the contents of the file.

    muffin.writeFile(target, data, options = {})

Writes the `data` to the `target` file. Accepts a `mode` option, which the file will be `chmod`ed to after successful writing if passed.`mode` defaults to 644, and must be passed in as a decimal (644) as opposed to octal (0644) number.

    muffin.copyFile(source, target, options = {})

Copies the file at `source` to `target` according to options, which gets passed straight in to `readFile` and `writeFile`.

    muffin.compileScript(source, target, options = {})

Compiles a CoffeeScript file at `source` to JavaScript at `target`. Accepts `bare` as an option, which if true excludes the default closure around the generated JavaScript. `bare` is false by default and it's recommended it remains that way.

    muffin.compileTree(source, target, options = {})

Compiles a set of CoffeeScript files with a root at `source` to JavaScript at `target`. This uses the [snockets](https://github.com/TrevorBurnham/snockets) library which allows you to specify dependencies among files using the `#= require otherfile` syntax. See the [snockets documentation](https://github.com/TrevorBurnham/snockets) for more information.

    muffin.minifyScript(source, options = {})

Minifies a JavaScript file at `source` into a `min.js` file in the same directory using [Uglify.js](https://github.com/mishoo/UglifyJS).

    muffin.statFiles(files, options = {})

Logs SLOC counts to the console for all the files included in the `files` (`Array`) option. Plays nice with both CoffeeScript and JavaScript. Needs (and checks) for a valid Perl > 5.3 installation to count lines. Accepts a `fields` option, which is a declarative array of string names of fields to be included in the output. Available fields are `filename`, `filetype`, `sloc`, `blank`, `comment`, size`, and `modified`. `statFiles` can also compare the given files across refs in git by passing it the `compare` and `compareFields` option. It will then prompt the user for the fields to compare, clone and checkout the two versions in a temp directory, and report the different stats in the same table.

    muffin.doccoFile(file, options)

Generates [Docco](https://github.com/jashkenas/docco) documentation for the JavaScript or CoffeeScript source file at `file`. Docco without choice writes to a `docs` folder.

    muffin.notify(filename, message, error = false)

Notifies the user about a `filename`. Sends them a `message`, with either a good connotation with `error = false` or a bad connotation with `error = true`.

    muffin.exec

Promise wrapper for child process execution. Works the same as the `child_process.exec` function, but returns an array of the `child_process` and the `promise` in the form `[child, promise]`. The promise resolves with an array of the `child`'s `stdout` and `stderr`, in the form of `[stdout, stderr]`. As with `child = child_process.exec`, `child` may need to have it's input stream ended for the program being executed to exit, which can be done by calling `child.stdin.end()`.

    muffin.extend(onto, what, this, that ...)

Simple variadic extend implementation which is handy for extending options hashes.

# Cake Options

`muffin.js` also accepts an `options` object to the `muffin.map` function, which is usually just passed in right from the options in the Cake task. This allows you to expose the inbuilt muffin options listed below:

  + 'watch': Monitor any files who match in the map and rerun their action when they change.
  + 'commit': Use the git stage if one exists instead of the current files in the directory. This is useful when you want to only stage some changes and commit them.
  + 'compare': Compare a set of files across two git refs. `statFiles` only.

You can use something like this to expose these options in Cake:

```coffeescript
option '-w', '--watch', 'continue to watch the files and rebuild them when they change'
option '-c', '--commit', 'operate on the git index instead of the working tree'
option '-m', '--compare', 'compare across git refs, stats task only.'
```

and then just ensure you pass in the options when you declare a task:

```coffeescript
task 'build', 'build my super project', (options) ->
  muffin.run
    files: ...
    options: options
    map: ...
```

That's it!

# Source

The annotated source code for muffin can be found [here](http://hornairs.github.com/muffin/).

# License

Copyright (C) 2012 by Jaded Pixel Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
