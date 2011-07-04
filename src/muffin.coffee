# Copyright Shopify, 2011
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
  console.log options
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

for k, v of {run, copyFile, doccoFile, notify, minifyScript, readFile, writeFile, compileScript, exec, extend}
  exports[k] = v
