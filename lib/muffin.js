(function() {
  var CoffeeScript, ask, clocFile, clocPath, compileMap, compileScript, compileString, copyFile, doccoFile, ensurePerl, exec, extend, fs, getGitRoot, glob, growlAvailable, growlCheckPromise, growlCommand, growlImagePath, handleFileError, inRebase, k, langDefPath, minifyScript, mkdir_p, notify, ofs, orgExec, path, perlError, perlPresent, printTable, q, readFile, run, runOptions, spawn, statFile, statFiles, temp, v, writeFile, _, _ref, _ref2, _ref3, _statFiles;
  var __slice = Array.prototype.slice;

  CoffeeScript = require('coffee-script');

  q = require('q');

  fs = require('q-fs');

  ofs = require('fs');

  path = require('path');

  glob = require('glob');

  temp = require('temp');

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
    if (options == null) options = {};
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

  ask = function(question, format) {
    var deferred, stdin, stdout;
    if (format == null) format = /.+/;
    stdin = process.stdin;
    stdout = process.stdout;
    deferred = q.defer();
    stdin.resume();
    stdout.write(question + ": ");
    stdin.once('data', function(data) {
      stdin.pause();
      data = data.toString().trim();
      if (format.test(data)) {
        return deferred.resolve(data);
      } else {
        stdout.write("It should match: " + format + "\n");
        return deferred.resolve(ask(question, format));
      }
    });
    return deferred.promise;
  };

  notify = function(source, origMessage, error) {
    var basename, child, command, m, message, promise, _ref2;
    if (error == null) error = false;
    if (error) {
      basename = source.toString().replace(/^.*[\/\\]/, '');
      if (m = origMessage.match(/Parse error on line (\d+)/)) {
        message = "Parse error in " + basename + "\non line " + m[1] + ".";
      } else {
        message = "Error in " + basename + ".";
      }
      command = growlCommand('-p', '2', '-t', "\"Action failed\"", '-m', "\"" + message + "\"");
      console.error(message);
      console.error(origMessage);
    } else {
      command = growlCommand('-n', 'Cake', '-p', '-1', '-t', "\"Action Succeeded\"", '-m', "\"" + source + "\"");
      console.log(origMessage);
    }
    if (growlAvailable) {
      _ref2 = exec(command), child = _ref2[0], promise = _ref2[1];
      child.stdin.end();
    }
    return true;
  };

  mkdir_p = function(filePath, mode, callback, position) {
    var directory, parts;
    if (mode == null) mode = 0777;
    if (position == null) position = 0;
    parts = path.normalize(filePath).split("/");
    if (parts[0] === '') {
      parts.shift();
      parts[0] = "/" + parts[0];
    }
    if (position >= parts.length) {
      if (callback) {
        return callback();
      } else {
        return true;
      }
    }
    directory = parts.slice(0, position + 1).join("/");
    return ofs.stat(directory, function(err) {
      if (err === null) {
        return mkdir_p(filePath, mode, callback, position + 1);
      } else {
        return ofs.mkdir(directory, mode, function(err) {
          if (err && !(err.message.match(/EEXIST/))) {
            if (callback) {
              return callback(err);
            } else {
              throw err;
            }
          } else {
            return mkdir_p(filePath, mode, callback, position + 1);
          }
        });
      }
    });
  };

  readFile = function(file, options) {
    var child, deferred, promise, _ref2;
    if (options == null) options = {};
    deferred = q.defer();
    if (runOptions.commit) {
      _ref2 = exec("git show :" + file), child = _ref2[0], promise = _ref2[1];
      child.stdin.setEncoding('utf8');
      child.stdin.end();
      q.when(promise, function(stdout, stderr) {
        var lines, str;
        lines = stdout.toString().split('\n');
        lines.pop();
        str = lines.join('\n');
        return deferred.resolve(str);
      }, function(reason) {
        return handleFileError(file, reason, options);
      });
    } else {
      fs.read(file).then(function(contents) {
        return deferred.resolve(contents.toString());
      }, function(reason) {
        return handleFileError(file, reason, options);
      });
    }
    return deferred.promise;
  };

  writeFile = function(file, data, options) {
    var child, mode, promise, write, _ref2;
    if (options == null) options = {};
    mode = options.mode || 0644;
    if (runOptions.commit) {
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
      write = q.defer();
      mkdir_p(path.dirname(file), 0755, function(err) {
        if (err) return write.reject(err);
        return ofs.writeFile(file, data, "UTF-8", function(err) {
          if (err) return write.reject(err);
          return ofs.chmod(file, mode, function(err) {
            if (err) return write.reject(err);
            return write.resolve(true);
          });
        });
      });
      return write.promise;
    }
  };

  copyFile = function(source, target, options) {
    if (options == null) options = {};
    return readFile(source, options).then(function(contents) {
      return writeFile(target, contents, options).then(function() {
        return notify(source, "Moved " + source + " to " + target + " successfully");
      });
    });
  };

  handleFileError = function(file, err, options) {
    if (options == null) options = {};
    if (options.notify !== false) notify(file, err.message, true);
    throw err;
  };

  compileString = function(coffeeSource, options) {
    if (options == null) options = {};
    return CoffeeScript.compile(coffeeSource, {
      bare: options != null ? options.bare : void 0
    });
  };

  compileScript = function(source, target, options) {
    if (options == null) options = {};
    return readFile(source, options).then(function(data) {
      var js;
      try {
        js = compileString(data, options);
        return writeFile(target, js, options).then(function(whatevs) {
          if (options.notify !== false) {
            return notify(source, "Compiled " + source + " to " + target + " successfully");
          }
        });
      } catch (err) {
        return handleFileError(target, err, options);
      }
    });
  };

  growlImagePath = path.resolve(path.join(__dirname, 'logo.png'));

  growlCommand = function() {
    var args;
    args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    args.unshift('growlnotify', '-n', 'Cake', '--image', growlImagePath);
    return args.join(' ');
  };

  growlAvailable = false;

  _ref2 = exec('which growlnotify'), _ = _ref2[0], growlCheckPromise = _ref2[1];

  growlCheckPromise = q.when(growlCheckPromise, function(_arg) {
    var stderr, stdout;
    stdout = _arg[0], stderr = _arg[1];
    growlAvailable = stderr.toString().length === 0;
    return true;
  }, function(reason) {
    growlAvailable = false;
    return false;
  });

  doccoFile = function(source, options) {
    var child, promise, _ref3;
    if (options == null) options = {};
    _ref3 = exec("docco " + source), child = _ref3[0], promise = _ref3[1];
    return promise.then(function(_arg) {
      var stderr, stdout;
      stdout = _arg[0], stderr = _arg[1];
      if (stdout.toString().length > 0) notify(source, stdout.toString());
      if (stderr.toString().length > 0) {
        return notify(source, stderr.toString(), true);
      }
    });
  };

  minifyScript = function(source, options) {
    var parser, uglify, _ref3;
    if (options == null) options = {};
    _ref3 = require("uglify-js"), parser = _ref3.parser, uglify = _ref3.uglify;
    return readFile(source, options).then(function(original) {
      var ast, final, finalPath;
      ast = parser.parse(original, options.parse);
      if (options.transform != null) ast = options.transform(ast);
      ast = uglify.ast_mangle(ast, options.ast_mangle);
      ast = uglify.ast_squeeze(ast, options.ast_squeeze);
      final = uglify.gen_code(ast, options.gen_code);
      finalPath = source.split('.');
      finalPath.pop();
      finalPath.push('min.js');
      return writeFile(finalPath.join('.'), final, options);
    });
  };

  getGitRoot = function() {
    var child, promise, _ref3;
    _ref3 = exec('git rev-parse --show-toplevel'), child = _ref3[0], promise = _ref3[1];
    child.stdin.end();
    return promise.then(function(_arg) {
      var stderr, stdout;
      stdout = _arg[0], stderr = _arg[1];
      return stdout.toString().trim();
    });
  };

  perlPresent = void 0;

  perlError = function() {
    throw 'You need a perl v5.3 or higher installed to do this with muffin.';
  };

  ensurePerl = function() {
    if (perlPresent != null) {
      if (!perlPresent) return perlError();
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
    var child, promise, _ref3;
    ensurePerl();
    _ref3 = exec("" + clocPath + " --csv --read-lang-def=" + langDefPath + " " + filename), child = _ref3[0], promise = _ref3[1];
    return q.when(promise, function(_arg) {
      var csv, discard, names, row, rows, stderr, _ref4;
      csv = _arg[0], stderr = _arg[1];
      if (stderr.toString().length > 0) throw stderr.toString();
      _ref4 = csv.split("\n\n"), discard = _ref4[0], csv = _ref4[1];
      if (!csv) {
        return {
          filename: filename,
          filetype: path.extname(filename).slice(1),
          blank: "-",
          comment: "-",
          sloc: "-"
        };
      }
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
        if (size < 1024) break;
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

  _statFiles = function(files, options) {
    var promise, promises, _i, _len;
    if (options == null) options = {};
    promises = files.map(function(file) {
      return q.join(clocFile(file), statFile(file), function(clocstats, filestats) {
        return extend(clocstats, filestats);
      });
    });
    for (_i = 0, _len = promises.length; _i < _len; _i++) {
      promise = promises[_i];
      promise.end();
    }
    return q.all(promises);
  };

  printTable = function(fields, results) {
    var data, field, headers, i, j, max, maxLengths, out, result, _i, _j, _len, _len2, _len3, _ref3, _ref4;
    headers = {};
    for (_i = 0, _len = fields.length; _i < _len; _i++) {
      field = fields[_i];
      headers[field] = field.charAt(0).toUpperCase() + field.slice(1);
    }
    results.unshift(headers);
    maxLengths = (function() {
      var _j, _len2, _results;
      _results = [];
      for (_j = 0, _len2 = fields.length; _j < _len2; _j++) {
        field = fields[_j];
        max = Math.max.apply(Math, results.map(function(result) {
          if (result[field] == null) {
            console.error("Couldn't get value from " + field + " on", result);
          }
          return result[field].toString().length;
        }));
        _results.push(max + 2);
      }
      return _results;
    })();
    for (_j = 0, _len2 = results.length; _j < _len2; _j++) {
      result = results[_j];
      out = [];
      for (i = 0, _len3 = fields.length; i < _len3; i++) {
        field = fields[i];
        data = result[field].toString();
        for (j = _ref3 = data.length, _ref4 = maxLengths[i]; _ref3 <= _ref4 ? j <= _ref4 : j >= _ref4; _ref3 <= _ref4 ? j++ : j--) {
          out.push(' ');
        }
        out.push(data);
      }
      console.log(out.join(''));
    }
    return results;
  };

  statFiles = function(files, options) {
    var compareFields, fields;
    if (options == null) options = {};
    if (typeof files === 'string') files = glob.globSync(files);
    if (options.compare) {
      fields = options.fields || ['filename', 'filetype'];
      compareFields = options.compareFields || ['sloc', 'size'];
      return ask('git ref A').then(function(refA) {
        return ask('git ref B').then(function(refB) {
          return getGitRoot().then(function(root) {
            var clones, ref;
            clones = (function() {
              var _i, _len, _ref3, _results;
              _ref3 = [refA, refB];
              _results = [];
              for (_i = 0, _len = _ref3.length; _i < _len; _i++) {
                ref = _ref3[_i];
                _results.push((function(ref) {
                  var child, clone, cloneCmd, tmpdir, _ref4;
                  tmpdir = temp.mkdirSync();
                  cloneCmd = "git clone " + root + " " + tmpdir;
                  console.error(cloneCmd);
                  _ref4 = exec(cloneCmd), child = _ref4[0], clone = _ref4[1];
                  child.stdin.end();
                  return clone.then(function(_arg) {
                    var checkingOut, stderr, stdout, _ref5;
                    stdout = _arg[0], stderr = _arg[1];
                    _ref5 = exec("cd " + tmpdir + " && git checkout " + ref), child = _ref5[0], checkingOut = _ref5[1];
                    return checkingOut;
                  }).then(function() {
                    var clonedFiles;
                    clonedFiles = files.map(function(file) {
                      return path.resolve(file).replace(root, tmpdir);
                    });
                    return _statFiles(clonedFiles, options).then(function(results) {
                      var i, result, _len2;
                      for (i = 0, _len2 = results.length; i < _len2; i++) {
                        result = results[i];
                        result['originalFilename'] = files[i];
                        result['ref'] = ref;
                      }
                      return results;
                    });
                  });
                })(ref));
              }
              return _results;
            })();
            return q.all(clones);
          }).then(function(results) {
            var field, k, ref, result, resultSet, table, tableEntry, tableFields, v, _i, _j, _k, _l, _len, _len2, _len3, _len4, _len5, _len6, _m, _n, _name, _ref3;
            table = {};
            for (_i = 0, _len = results.length; _i < _len; _i++) {
              resultSet = results[_i];
              for (_j = 0, _len2 = resultSet.length; _j < _len2; _j++) {
                result = resultSet[_j];
                tableEntry = (table[_name = result.originalFilename] || (table[_name] = {}));
                for (_k = 0, _len3 = fields.length; _k < _len3; _k++) {
                  k = fields[_k];
                  tableEntry[k] = result[k];
                }
                for (_l = 0, _len4 = compareFields.length; _l < _len4; _l++) {
                  k = compareFields[_l];
                  tableEntry["" + k + " at " + result.ref] = result[k];
                }
              }
            }
            results = (function() {
              var _results;
              _results = [];
              for (k in table) {
                v = table[k];
                v['filename'] = k;
                _results.push(v);
              }
              return _results;
            })();
            tableFields = Array.prototype.slice.call(fields);
            for (_m = 0, _len5 = compareFields.length; _m < _len5; _m++) {
              field = compareFields[_m];
              _ref3 = [refA, refB];
              for (_n = 0, _len6 = _ref3.length; _n < _len6; _n++) {
                ref = _ref3[_n];
                tableFields.push("" + field + " at " + ref);
              }
            }
            return printTable(tableFields, results);
          });
        });
      }).end();
    } else {
      fields = options.fields || ['filename', 'filetype', 'sloc', 'size'];
      return _statFiles(files, options).then(function(results) {
        return printTable(fields, results);
      }).end();
    }
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

  runOptions = {};

  run = function(args) {
    var before, compiledMap, start;
    if (!(args.files != null)) {
      args.files = glob.globSync('./**/*');
    } else if (typeof args.files === 'string') {
      args.files = glob.globSync(args.files);
    } else {
      args.files = args.files.reduce((function(a, b) {
        return a.concat(glob.globSync(b));
      }), []);
    }
    compiledMap = compileMap(args.map);
    runOptions = args.options;
    before = function() {
      return q.when(growlCheckPromise, function() {
        return q.ref(args.before ? args.before() : true);
      });
    };
    q.when(start = before(), function() {
      var done, x;
      done = false;
      x = done;
      compiledMap.forEach(function(map) {
        var file, i, matches, _ref3;
        _ref3 = args.files;
        for (i in _ref3) {
          file = _ref3[i];
          if (matches = map.pattern.exec(file)) {
            delete args.files[i];
            done = q.wait(map.action(matches), done);
            if (args.options.watch) {
              if (args.options.commit) {
                console.error("Can't watch committed versions of files, sorry!") && process.exit(1);
              }
              (function(map, matches) {
                return ofs.watchFile(file, {
                  persistent: true,
                  interval: 250
                }, function(curr, prev) {
                  var subStart;
                  if (curr.mtime.getTime() === prev.mtime.getTime()) return;
                  if (inRebase()) return;
                  q.when(subStart = before(), function() {
                    q.when(map.action(matches), function(result) {
                      if (args.after) return args.after();
                    });
                    return moreWork.end();
                  });
                  return subStart.end();
                });
              })(map, matches);
            }
          }
        }
        return true;
      });
      return q.when(done, function(v) {
        if (args.after) args.after();
        return true;
      }).end();
    });
    return start.end();
  };

  _ref3 = {
    run: run,
    copyFile: copyFile,
    doccoFile: doccoFile,
    notify: notify,
    minifyScript: minifyScript,
    readFile: readFile,
    writeFile: writeFile,
    compileString: compileString,
    compileScript: compileScript,
    exec: exec,
    extend: extend,
    statFiles: statFiles,
    mkdir_p: mkdir_p
  };
  for (k in _ref3) {
    v = _ref3[k];
    exports[k] = v;
  }

}).call(this);
