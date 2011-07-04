(function() {
  var CoffeeScript, compileMap, compileScript, copyFile, doccoFile, exec, extend, fs, glob, handleFileError, inRebase, k, minifyScript, notify, ofs, orgExec, path, q, readFile, run, spawn, v, writeFile, _ref, _ref2;
  CoffeeScript = require('coffee-script');
  q = require('q');
  fs = require('q-fs');
  ofs = require('fs');
  path = require('path');
  glob = require('glob');
  _ref = require('child_process'), spawn = _ref.spawn, exec = _ref.exec;
  orgExec = exec;
  extend = function(onto, other) {
    var k, o, result, v, _i, _len, _ref2;
    result = onto;
    _ref2 = [this, other];
    for (_i = 0, _len = _ref2.length; _i < _len; _i++) {
      o = _ref2[_i];
      for (k in o) {
        v = o[k];
        result[k] = v;
      }
    }
    return result;
  };
  exec = function(command, options) {
    var child, deferred;
    if (options == null) {
      options = {};
    }
    deferred = q.defer();
    child = orgExec(command, options, function(error, stdout, stderr) {
      if (error != null) {
        return deferred.reject(error);
      } else {
        return deferred.resolve([stdout, stderr]);
      }
    });
    return [child, deferred.promise];
  };
  inRebase = function() {
    return path.existsSync('.git/rebase-apply');
  };
  readFile = function(file, options) {
    var deferred;
    if (options == null) {
      options = {};
    }
    deferred = q.defer();
    if (options.commit) {
      exec("git show :" + file, function(err, stdout, stderr) {
        if (err != null) {
          return handleFileError(file, err, options);
        } else {
          return deffered.resolve(stdout);
        }
      });
    } else {
      fs.read(file).then(function(contents) {
        return deferred.resolve(contents);
      }, function(error) {
        return handleFileError(file, err, options);
      });
    }
    return deferred.promise;
  };
  writeFile = function(file, data, options) {
    var child, mode, promise, _ref2;
    if (options == null) {
      options = {};
    }
    mode = options.mode || 644;
    if (options.commit) {
      _ref2 = exec("git hash-object --stdin -w"), child = _ref2[0], promise = _ref2[1];
      child.stdin.write(data);
      child.stdin.end();
      promise.then(function(_arg) {
        var sha, stderr, stdout, subchild, subpromise, _ref3;
        stdout = _arg[0], stderr = _arg[1];
        sha = stdout.substr(0, 40);
        _ref3 = exec("git update-index --add --cacheinfo 100" + (mode.toString(8)) + " " + sha + " " + file), subchild = _ref3[0], subpromise = _ref3[1];
        return subpromise;
      });
      return promise;
    } else {
      return fs.write(file, data.toString(), "w", "UTF-8").then(function(data) {
        return fs.chmod(file, mode);
      }, function(reason) {
        if (reason.toString().match(/not writable/g)) {
          return q.reject("" + file + " isn't writable, please check permissions!");
        } else {
          return q.reject(reason);
        }
      });
    }
  };
  handleFileError = function(file, err, options) {
    if (options == null) {
      options = {};
    }
    return ref(options.notify !== false ? notify(file, err.message, true) : void 0);
  };
  compileScript = function(source, target, options) {
    if (options == null) {
      options = {};
    }
    return readFile(source, options).then(function(data) {
      var js;
      try {
        js = CoffeeScript.compile(data, {
          source: source,
          bare: options != null ? options.bare : void 0
        });
        return writeFile(target, js, options).then(function() {
          if (options.notify !== false) {
            return notify(source, "Compiled " + source + " to " + target + " successfully");
          }
        });
      } catch (err) {
        return handleFileError(target, err, options);
      }
    });
  };
  notify = function(source, origMessage, error) {
    var args, basename, child, m, message, promise, _ref2;
    if (error == null) {
      error = false;
    }
    if (error) {
      basename = source.replace(/^.*[\/\\]/, '');
      if (m = origMessage.match(/Parse error on line (\d+)/)) {
        message = "Parse error in " + basename + "\non line " + m[1] + ".";
      } else {
        message = "Error in " + basename + ".";
      }
      args = ['growlnotify', '-n', 'Cake', '-p', '2', '-t', "\"Action failed\"", '-m', "\"" + message + "\""];
      console.error(message);
      console.error(origMessage);
    } else {
      args = ['growlnotify', '-n', 'Cake', '-p', '-1', '-t', "\"Action Succeeded\"", '-m', "\"" + source + "\""];
      console.log(origMessage);
    }
    _ref2 = exec(args.join(' ')), child = _ref2[0], promise = _ref2[1];
    return promise;
  };
  copyFile = function(source, target, options) {
    if (options == null) {
      options = {};
    }
    return readFile(source, options).then(function(contents) {
      return writeFile(target, contents, options).then(function() {
        return notify(source, "Moved " + source + " to " + target + " successfully");
      });
    });
  };
  doccoFile = function(source, options) {
    var child, promise, _ref2;
    if (options == null) {
      options = {};
    }
    _ref2 = exec("docco " + source), child = _ref2[0], promise = _ref2[1];
    return promise.then(function(_arg) {
      var stderr, stdout;
      stdout = _arg[0], stderr = _arg[1];
      if (stdout.toString().length > 0) {
        notify(source, stdout.toString());
      }
      if (stderr.toString().length > 0) {
        return notify(source, stderr.toString(), true);
      }
    });
  };
  minifyScript = function(source, options) {
    var parser, uglify, _ref2;
    if (options == null) {
      options = {};
    }
    _ref2 = require("uglify-js"), parser = _ref2.parser, uglify = _ref2.uglify;
    return readFile(source, options).then(function(original) {
      var ast, final, finalPath;
      ast = parser.parse(original);
      ast = uglify.ast_mangle(ast);
      ast = uglify.ast_squeeze(ast);
      final = uglify.gen_code(ast);
      finalPath = source.split('.');
      finalPath.pop();
      finalPath.push('min.js');
      return writeFile(finalPath.join('.'), final, options);
    });
  };
  compileMap = function(map) {
    var action, pattern, _results;
    _results = [];
    for (pattern in map) {
      action = map[pattern];
      _results.push({
        pattern: new RegExp(pattern),
        action: action
      });
    }
    return _results;
  };
  run = function(args) {
    var compiledMap, done;
    if (!(args.files != null)) {
      args.files = glob.globSync('./**/*');
    } else if (typeof args.files === 'string') {
      args.files = glob.globSync(args.files);
    }
    compiledMap = compileMap(args.map);
    done = compiledMap.reduce(function(done, map) {
      var file, i, matches, work, _ref2;
      _ref2 = args.files;
      for (i in _ref2) {
        file = _ref2[i];
        if (matches = map.pattern.exec(file)) {
          delete args.files[i];
          work = q.ref(map.action(matches));
          if (args.options.watch) {
            (function(map, matches) {
              return ofs.watchFile(file, {
                persistent: true,
                interval: 250
              }, function(curr, prev) {
                if (curr.mtime.getTime() === prev.mtime.getTime()) {
                  return;
                }
                if (inRebase()) {
                  return;
                }
                work = q.ref(map.action(matches));
                return q.when(work, function(result) {
                  if (args.after) {
                    return args.after();
                  }
                });
              });
            })(map, matches);
          }
          done = q.when(done, function() {
            return work;
          });
        }
      }
      return done;
    }, void 0);
    q.when(done, function() {
      if (args.after) {
        return args.after();
      }
    });
    return done.end();
  };
  _ref2 = {
    run: run,
    copyFile: copyFile,
    doccoFile: doccoFile,
    notify: notify,
    minifyScript: minifyScript,
    readFile: readFile,
    writeFile: writeFile,
    compileScript: compileScript,
    exec: exec,
    extend: extend
  };
  for (k in _ref2) {
    v = _ref2[k];
    exports[k] = v;
  }
}).call(this);
