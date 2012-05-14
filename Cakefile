muffin = require './src/muffin'
glob = require 'glob'

option '-w', '--watch', 'continue to watch the files and rebuild them when they change'
option '-c', '--commit', 'operate on the git index instead of the working tree'
option '-d', '--compare', 'compare to git refs (stat task only)'

task 'build', 'compile muffin', (options) ->
  muffin.run
    files: './src/**/*'
    options: options
    map:
      'src/muffin.coffee'       : (matches) -> muffin.compileScript(matches[0], 'lib/muffin.js', options)
  console.log "Watching src..." if options.watch

task 'stats', 'print source code stats', (options) ->
  muffin.statFiles(glob.globSync('./src/**/*').concat(glob.globSync('./lib/**/*')), options)

task 'doc', 'autogenerate docco anotated source and node IDL files', (options) ->
  muffin.run
    files: './src/**/*'
    options: options
    map:
      'src/muffin.coffee'       : (matches) -> muffin.doccoFile(matches[0], options)

task 'test', ->
