muffin = require './lib/muffin'

option '-w', '--watch', 'continue to watch the files and rebuild them when they change'
option '-c', '--commit', 'operate on the git index instead of the working tree'

task 'build', 'compile muffin', (options) ->
  muffin.run
    files: './src/**/*'
    options: options
    map:
      'src/muffin.coffee'       : (matches) -> muffin.compileScript(matches[0], 'lib/muffin.js', options)
  console.log "Watching src..." if options.watch

task 'test', 'test', (options) ->
  muffin.writeFile('test.js', '123', {})
