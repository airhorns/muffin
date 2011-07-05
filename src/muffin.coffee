# muffin.js -> handy helpers for building cakefiles
#
# Licensed under the MIT License, excluding cloc.pl
# Includes cloc.pl from http://cloc.sourceforge.net/, licenced under GPL V2

CoffeeScript     = require 'coffee-script'
q                = require 'q'
fs               = require 'q-fs'
ofs              = require 'fs'
path             = require 'path'
glob             = require 'glob'
{spawn, exec}    = require 'child_process'
orgExec = exec

extend = (onto, others...) ->
  result = onto
  for o in others
    for k,v of o
      result[k] = v
  result

exec = (command, options = {}) ->
  deferred = q.defer()
  child = orgExec(command, options, (error, stdout, stderr) ->
    if error?
      deferred.reject(error)
    else
      deferred.resolve([stdout, stderr])
  )

  [child, deferred.promise]

inRebase = ->
  path.existsSync('.git/rebase-apply')

readFile = (file, options = {}) ->
  deferred = q.defer()

  if options.commit
    exec "git show :"+file, (err, stdout, stderr) ->
      if err?
        handleFileError file, err, options
      else
        deffered.resolve stdout
  else
    fs.read(file).then((contents) -> 
      deferred.resolve(contents)
    , (error) -> 
      handleFileError(file, err, options)
    )
 
  deferred.promise

writeFile = (file, data, options = {}) ->
  mode = options.mode || 644

  if options.commit
    [child, promise] = exec "git hash-object --stdin -w"
    child.stdin.write(data)
    child.stdin.end()
    
    promise.then ([stdout, stderr]) ->
      sha = stdout.substr(0,40)
      [subchild, subpromise] = exec "git update-index --add --cacheinfo 100#{mode.toString(8)} #{sha} #{file}"
      return subpromise

    return promise
  else
    fs.write(file, data.toString(), "w", "UTF-8").then (data) ->
      return fs.chmod file, mode
    , (reason) ->
      if reason.toString().match(/not writable/g)
        q.reject "#{file} isn't writable, please check permissions!"
      else
        q.reject(reason)


handleFileError = (file, err, options = {}) ->
  ref(notify file, err.message, true unless options.notify == false)

# Following 2 functions are stolen from Jitter, https://github.com/TrevorBurnham/Jitter/blob/master/src/jitter.coffee
# Compiles a script to a destination
compileScript = (source, target, options = {}) ->
  readFile(source, options).then (data) ->
    try
      js = CoffeeScript.compile data, {source, bare: options?.bare}
      writeFile(target, js, options).then ->
        notify source, "Compiled #{source} to #{target} successfully" unless options.notify == false
    catch err
      handleFileError target, err, options

# Notifies the user of a success or error during compilation
notify = (source, origMessage, error = false) ->
  if error
    basename = source.replace(/^.*[\/\\]/, '')
    if m = origMessage.match /Parse error on line (\d+)/
      message = "Parse error in #{basename}\non line #{m[1]}."
    else
      message = "Error in #{basename}."
    args = ['growlnotify', '-n', 'Cake', '-p', '2', '-t', "\"Action failed\"", '-m', "\"#{message}\""]
    console.error message
    console.error origMessage
  else
    args = ['growlnotify', '-n', 'Cake', '-p', '-1', '-t', "\"Action Succeeded\"", '-m', "\"#{source}\""]
    console.log origMessage
  [child, promise] = exec args.join(' ')
  promise

copyFile = (source, target, options = {}) ->
  readFile(source, options).then (contents) ->
    writeFile(target, contents, options).then ->
      notify source, "Moved #{source} to #{target} successfully"

doccoFile = (source, options = {}) ->
  [child, promise] = exec("docco #{source}")
  return promise.then ([stdout, stderr]) ->
    notify source, stdout.toString() if stdout.toString().length > 0  
    notify source, stderr.toString(), true if stderr.toString().length > 0 

minifyScript = (source, options = {}) ->
  {parser, uglify} = require("uglify-js")

  readFile(source, options).then (original) ->
    ast = parser.parse(original)  # parse code and get the initial AST
    ast = uglify.ast_mangle(ast)  # get a new AST with mangled names
    ast = uglify.ast_squeeze(ast) # get an AST with compression optimizations
    final = uglify.gen_code(ast)  # compressed code here
    finalPath = source.split('.')
    finalPath.pop()
    finalPath.push('min.js')
    return writeFile(finalPath.join('.'), final, options)
  
compileMap = (map) ->
  for pattern, action of map
    {pattern: new RegExp(pattern), action: action}

ensurePerl = () ->
  orgExec 'perl --version', (error, stdout, stderr) ->
    if error?
      throw 'You need a perl v5.3 or higher installed to do this with muffin.'

clocPath = path.normalize( __dirname + "/../deps/cloc.pl" )
langDefPath = path.normalize( __dirname + "/../deps/cloc_lang_def.txt")

cloc = (filename) -> 
  [child, promise] = exec "#{clocPath} --csv --read-lang-def=#{langDefPath} #{filename}"
  q.when promise, ([csv, stderr]) ->
    throw stderr.toString() if stderr.toString().length > 0

    [discard, csv] = csv.split("\n\n")
    rows = csv.split("\n")
    names = rows.shift() # get rid of column names
    rows.pop() # get rid of empty newline at the end
    rows = rows.map (row) -> row.split(',')
    row = rows[0]

    return {
      filename: filename
      filetype: row[1]
      blank: row[2]
      comment: row[3]
      sloc: row[4]
    }

fileStat = (filename) ->
  q.when fs.stat(filename), (stats) ->
    size = stats.size
    units = ["bytes", "KB", "MB"]
    for unit in units
      break if size < 1024
      size = size / 1024

    size = "#{(Math.round(size*100)/100).toFixed(2)} #{unit}"

    return {
      size: size
      modified: stats.mtime
      filename: filename
    }

statFiles = (files, options = {}) ->
  ensurePerl()
  fields = options.fields || ['filename', 'filetype', 'sloc', 'size']
  
  # glob files if given a string
  if typeof files is 'string'
    files = glob.globSync files

  # cloc and filestat each file
  promises = files.map (file) ->
    q.join cloc(file), fileStat(file), (clocstats, filestats) ->
      extend clocstats, filestats
  
  promise.end() for promise in promises

  x = q.join promises..., (results...) ->
    # Add the headers to the top of the table
    headers = {}
    for field in fields
      headers[field] = (field.charAt(0).toUpperCase() + field.slice(1))
    results.unshift headers
    
    # Figure out how wide each column must be
    maxLengths = for field in fields
      max = Math.max.apply Math, results.map (result) -> result[field].toString().length
      max + 2
    
    # Print out each row of results
    for result in results
      out = []
      for field, i in fields
        data = result[field].toString()
        out.push ' ' for j in [data.length..maxLengths[i]]
        out.push data
      console.log out.join('')

    return results
  x.end()
  x

run = (args) ->
  # Grab the glob if not given
  if !args.files?
    args.files = glob.globSync './**/*'
  else if typeof args.files is 'string'
    args.files = glob.globSync args.files
  
  compiledMap = compileMap args.map

  done = compiledMap.reduce (done, map) ->
    for i, file of args.files
      if matches = map.pattern.exec(file)
        delete args.files[i]
        # Do the job and wrap it in a promise
        work = q.ref map.action(matches)

        # Watch the file if the option was given
        if args.options.watch
          do (map, matches) ->
            ofs.watchFile file, persistent: true, interval: 250, (curr, prev) ->
              return if curr.mtime.getTime() is prev.mtime.getTime()
              return if inRebase()
              work = q.ref map.action(matches)
              q.when work, (result) ->
                args.after() if args.after
        
        # Return another promise which will resolve to the work promise
        done = q.when(done, -> work)
    done
  , undefined

  q.when done, () ->
    args.after() if args.after
  done.end()

for k, v of {run, copyFile, doccoFile, notify, minifyScript, readFile, writeFile, compileScript, exec, extend, statFiles}
  exports[k] = v
