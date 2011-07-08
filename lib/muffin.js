(function() {
  var CoffeeScript, clocFile, clocPath, compileMap, compileScript, copyFile, doccoFile, ensurePerl, exec, extend, fs, glob, growlAvailble, growlCommand, handleFileError, inRebase, k, langDefPath, minifyScript, notify, ofs, orgExec, path, perlError, perlPresent, q, readFile, run, spawn, statFile, statFiles, v, writeFile, _ref, _ref2;
  var __slice = Array.prototype.slice;
  CoffeeScript = require('coffee-script');
  q = require('q');
  fs = require('q-fs');
  ofs = require('fs');
  path = require('path');
  glob = require('glob');
  _ref = require('child_process'), spawn = _ref.spawn, exec = _ref.exec;
  orgExec = exec;
  extend = function() {
    var k, o, onto, others, result, v, _i, _len;
    onto = arguments[0], others = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
    result = onto;
    for (_i = 0, _len = others.length; _i < _len; _i++) {
      o = others[_i];
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
  notify = function(source, origMessage, error) {
    var basename, child, command, m, message, promise, _ref2;
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
      command = growlCommand('-n', 'Cake', '-p', '2', '-t', "\"Action failed\"", '-m', "\"" + message + "\"");
      console.error(message);
      console.error(origMessage);
    } else {
      command = growlCommand('-n', 'Cake', '-p', '-1', '-t', "\"Action Succeeded\"", '-m', "\"" + source + "\"");
      console.log(origMessage);
    }
    if (growlAvailble) {
      _ref2 = exec(command), child = _ref2[0], promise = _ref2[1];
    } else {
      promise = q.ref(true);
    }
    return promise;
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
  handleFileError = function(file, err, options) {
    if (options == null) {
      options = {};
    }
    if (options.notify !== false) {
      return notify(file, err.message, true);
    }
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
  growlCommand = function() {
    var args;
    args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    args.unshift('growlnotify');
    return args.join(' ');
  };
  growlAvailble = false;
  orgExec(growlCommand('--version'), function(err, stdout, stderr) {
    return growlAvailble = err != null;
  });
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
  perlPresent = void 0;
  perlError = function() {
    throw 'You need a perl v5.3 or higher installed to do this with muffin.';
  };
  ensurePerl = function() {
    if (perlPresent != null) {
      if (!perlPresent) {
        return perlError();
      }
    } else {
      return orgExec('perl --version', function(error, stdout, stderr) {
        if (error != null) {
          perlPresent = false;
          return perlError();
        }
      });
    }
  };
  clocPath = path.normalize(__dirname + "/../deps/cloc.pl");
  langDefPath = path.normalize(__dirname + "/../deps/cloc_lang_def.txt");
  clocFile = function(filename) {
    var child, promise, _ref2;
    ensurePerl();
    _ref2 = exec("" + clocPath + " --csv --read-lang-def=" + langDefPath + " " + filename), child = _ref2[0], promise = _ref2[1];
    return q.when(promise, function(_arg) {
      var csv, discard, names, row, rows, stderr, _ref3;
      csv = _arg[0], stderr = _arg[1];
      if (stderr.toString().length > 0) {
        throw stderr.toString();
      }
      _ref3 = csv.split("\n\n"), discard = _ref3[0], csv = _ref3[1];
      rows = csv.split("\n");
      names = rows.shift();
      rows.pop();
      rows = rows.map(function(row) {
        return row.split(',');
      });
      row = rows[0];
      return {
        filename: filename,
        filetype: row[1],
        blank: row[2],
        comment: row[3],
        sloc: row[4]
      };
    });
  };
  statFile = function(filename) {
    return q.when(fs.stat(filename), function(stats) {
      var size, unit, units, _i, _len;
      size = stats.size;
      units = ["bytes", "KB", "MB", "GB"];
      for (_i = 0, _len = units.length; _i < _len; _i++) {
        unit = units[_i];
        if (size < 1024) {
          break;
        }
        size = size / 1024;
      }
      size = "" + ((Math.round(size * 100) / 100).toFixed(2)) + " " + unit;
      return {
        size: size,
        modified: stats.mtime,
        filename: filename
      };
    });
  };
  statFiles = function(files, options) {
    var fields, promise, promises, x, _i, _len;
    if (options == null) {
      options = {};
    }
    fields = options.fields || ['filename', 'filetype', 'sloc', 'size'];
    if (typeof files === 'string') {
      files = glob.globSync(files);
    }
    promises = files.map(function(file) {
      return q.join(clocFile(file), statFile(file), function(clocstats, filestats) {
        return extend(clocstats, filestats);
      });
    });
    for (_i = 0, _len = promises.length; _i < _len; _i++) {
      promise = promises[_i];
      promise.end();
    }
    x = q.join.apply(q, __slice.call(promises).concat([function() {
      var data, field, headers, i, j, max, maxLengths, out, result, results, _j, _k, _len2, _len3, _len4, _ref2, _ref3;
      results = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      headers = {};
      for (_j = 0, _len2 = fields.length; _j < _len2; _j++) {
        field = fields[_j];
        headers[field] = field.charAt(0).toUpperCase() + field.slice(1);
      }
      results.unshift(headers);
      maxLengths = (function() {
        var _k, _len3, _results;
        _results = [];
        for (_k = 0, _len3 = fields.length; _k < _len3; _k++) {
          field = fields[_k];
          max = Math.max.apply(Math, results.map(function(result) {
            return result[field].toString().length;
          }));
          _results.push(max + 2);
        }
        return _results;
      })();
      for (_k = 0, _len3 = results.length; _k < _len3; _k++) {
        result = results[_k];
        out = [];
        for (i = 0, _len4 = fields.length; i < _len4; i++) {
          field = fields[i];
          data = result[field].toString();
          for (j = _ref2 = data.length, _ref3 = maxLengths[i]; _ref2 <= _ref3 ? j <= _ref3 : j >= _ref3; _ref2 <= _ref3 ? j++ : j--) {
            out.push(' ');
          }
          out.push(data);
        }
        console.log(out.join(''));
      }
      return results;
    }]));
    return x;
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
    var before, compiledMap, done, start;
    if (!(args.files != null)) {
      args.files = glob.globSync('./**/*');
    } else if (typeof args.files === 'string') {
      args.files = glob.globSync(args.files);
    } else {
      args.files = args.files.map(function(x) {
        return glob.globSync(x);
      });
    }
    compiledMap = compileMap(args.map);
    before = function() {
      return q.ref(args.before ? args.before() : true);
    };
    q.when(start = before(), done = compiledMap.reduce(function(done, map) {
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
                q.when(start = before(), function() {
                  work = q.ref(map.action(matches));
                  q.when(work, function(result) {
                    if (args.after) {
                      return args.after();
                    }
                  });
                  return work.end();
                });
                return start.end();
              });
            })(map, matches);
          }
          done = q.when(done, function() {
            return work;
          });
        }
      }
      return done;
    }, void 0), q.when(done, function() {
      if (args.after) {
        return args.after();
      }
    }), done.end());
    return start.end();
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
    extend: extend,
    statFiles: statFiles
  };
  for (k in _ref2) {
    v = _ref2[k];
    exports[k] = v;
  }
}).call(this);
