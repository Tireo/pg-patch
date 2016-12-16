'use strict';

var fs = require('fs');
var pg = require('pg');
var q = require('q');
var chalk = require('chalk');

var logLevels = {
    DEBUG: 0,
    LOG: 1,
    INFO: 2,
    ERROR: 3
};

const actions = {
    UPDATE: 'update',
    ROLLBACK: 'rollback'
};

//TODO
//function PathProcess

function PgPatcher(client, runConfig) {
    if (client instanceof pg.Client) {
        this.client = client;
    } else { //assume client is configuration object
        this.client = new pg.Client(client);
    }

    if (runConfig) {
        this.run(runConfig);
    }
}

PgPatcher.prototype = {
    run: function (config) {
        var self = this;
        var cache = {};

        config = config || {};

        this.config = {};
        this.config.dbTable = config.dbTable || 'pgpatch';
        this.config.dbSchema = config.dbSchema || 'public';
        this.config.patchDir = config.patchDir || 'pg_patch';
        this.config.actionUpdate = config.actionUpdate || 'up';
        this.config.actionRollback = config.actionRollback || 'rb';
        this.config.patchFileTemplate = config.patchFileTemplate || 'patch-{version}-{action}(?:-{description})?\\.sql';
        this.config.targetVersion = config.targetVersion === undefined ? null : config.targetVersion;
        this.config.dryRun = config.dryRun || false; //TODO

        this.regex = this.createPatchFileRegexes();
        this.logLevel = logLevels[config.logLevel || 'LOG'];
        this.enableColorLogs = config.enableColors === undefined ? true : config.enableColors;

        this.client.connect(function (err) {
            if (err) {
                self.log("[ERR][pgPatch] Could not connect to DB:\n", err);
            } else {
                q.fcall(function () {  //DB check & setup
                    if (self.config.skipDBTableCheck) {
                        return;
                    }
                    return self.initialDBSetup();
                }).then(function () { //scan for patch files
                    self.info("looking for patch files");
                    return self.readPatchData().then(function (patchData) {
                        //self.debug("patchData: ", JSON.stringify(patchData, null, 2));
                        self.info(`found ${patchData.foundPatchFiles} patch files`);
                        cache.patchData = patchData;
                    });
                }).then(function () { //determine patch process information
                    if (self.config.targetVersion === null) { //assume patch to newest
                        cache.targetVersion = cache.patchData.maxPatchVersion;
                    } else {
                        cache.targetVersion = self.config.targetVersion;
                    }

                    if (cache.targetVersion === null) { //error
                        return Promise.reject(`Target patch version could not be determined`);
                    }

                    if (cache.targetVersion > cache.patchData.maxPatchVersion) {
                        //short circuit to skip DB read
                        return Promise.reject(`Target patch version not found: ${self.config.targetVersion}; (Max found was: ${cache.patchData.maxPatchVersion})`);
                    }

                    return self.getCurrentPatchVersion().then(function (currentVersion) {
                        cache.currentVersion = currentVersion;
                        cache.startVersion = currentVersion;
                        //self.info(`current patch version: ${currentVersion}`);
                    });
                }).then(function () { // patch process start
                    self.info(`current version: ${cache.currentVersion}, target version: ${cache.targetVersion}`);
                    if (cache.startVersion === cache.targetVersion) {
                        self.success("nothing to do");
                        return;
                    } else { //rollback
                        return self.patchRouteExists(cache.patchData.patchFiles, cache.startVersion, cache.targetVersion).then(function(routeExists){
                            if(!routeExists){
                                return Promise.reject(`patch route could not be found`);
                            }else{
                                return self.patch(cache.patchData.patchFiles, cache.startVersion, cache.targetVersion);
                            }
                        });
                    }
                }).catch(function (err) {
                    cache.error = true;
                    self.error(err);
                }).fin(function () {
                    if (cache.error) {
                        self.error("Patch process finished with an error");
                    } else {
                        self.success("Patch process finished successfully");
                    }
                    self.client.end();
                });
            }
        });
    },
    initialDBSetup: function () {
        var self = this;
        return this.checkPatchDataTable().then(function (tableExists) {
            if (tableExists) {
                self.info("db patch table found");
            } else {
                self.info("creating db patch table");
                return self.createPatchDataTable();
            }
        });
    },
    debug: function () {
        if (this.logLevel <= logLevels.DEBUG) {
            var args = Array.prototype.slice.call(arguments);
            args.unshift('[DEBUG][pg-patcher]');
            this.enableColorLogs ? console.log(chalk.gray.apply(null, args)) : console.log.apply(null, args);
        }
    },
    log: function () {
        if (this.logLevel <= logLevels.LOG) {
            var args = Array.prototype.slice.call(arguments);
            args.unshift('[LOG][pg-patcher]');
            this.enableColorLogs ? console.log(chalk.reset.apply(null, args)) : console.log.apply(null, args);
        }
    },
    info: function () {
        if (this.logLevel <= logLevels.INFO) {
            var args = Array.prototype.slice.call(arguments);
            args.unshift('[INFO][pg-patcher]');
            this.enableColorLogs ? console.log(chalk.blue.apply(null, args)) : console.log.apply(null, args);
        }
    },
    success: function () {
        if (this.logLevel <= logLevels.INFO) {
            var args = Array.prototype.slice.call(arguments);
            args.unshift('[INFO][pg-patcher]');
            this.enableColorLogs ? console.log(chalk.green.apply(null, args)) : console.log.apply(null, args);
        }
    },
    error: function () {
        if (this.logLevel <= logLevels.ERROR) {
            var args = Array.prototype.slice.call(arguments);
            args.unshift('[ERR][pg-patcher]');
            this.enableColorLogs ? console.log(chalk.red.apply(null, args)) : console.log.apply(null, args);
        }
    },
    patch: function(patchFiles, sourceVersion, targetVersion){
        var action = (sourceVersion < targetVersion) ? actions.UPDATE : actions.ROLLBACK;
        var versionReadPromises = [];
        var self = this;
        var sqlToRun = {};

        if (action === actions.UPDATE) {
            for(let i=sourceVersion+1; i<= targetVersion; i++){
                sqlToRun[i] = [];

                let fileReadPromises = [];
                patchFiles[i][action].sort(function(a, b){
                    return (a.description || '').localeCompare(b.description || '');
                });
                //this.debug("sorted patchFiles", JSON.stringify(patchFiles[i][action], null, 2));

                patchFiles[i][action].forEach(function(fileData){
                    fileReadPromises.push(self.readFile(fileData.fullPath).then(function(data){
                        fileData.content = data+'';
                        sqlToRun[i].push(fileData.content);
                    }));
                });

                versionReadPromises.push(q.all(fileReadPromises));
            }
            return q.all(versionReadPromises).then(function(){
                console.info("all version promises read");
                console.info(sqlToRun);

                var patchChainPromise = Promise.resolve();
                for(let i=sourceVersion+1; i<= targetVersion; i++){
                    patchChainPromise = patchChainPromise.then(function(){
                        console.info("running", i, sqlToRun[i].join(";"));
                        return self.query(sqlToRun[i].join(";"));
                    }).then(function(){
                        return self.query(`update ${self.getDBPatchTableName()} set current_version = ${i};`);
                    });
                }
                return patchChainPromise;
            });
        } else {
            return Promise.reject("Rollback flow not yet implemented");
        }
    },
    patchRouteExists: function (patchFiles, sourceVersion, targetVersion) {
        if (sourceVersion === targetVersion) {
            return true;
        }
        var action = (sourceVersion < targetVersion) ? actions.UPDATE : actions.ROLLBACK;
        if (action === actions.UPDATE) {
            for(let i=sourceVersion+1; i<= targetVersion; i++){
                if(!patchFiles[i] || !patchFiles[i][action]){
                    return Promise.resolve(false);
                }
            }
        } else {
            return Promise.reject("Rollback flow not yet implemented");
        }

        return Promise.resolve(true);
    },
    createPatchFileRegexes: function () {
        var fileTestExpr = this.config.patchFileTemplate
            .replace(/\{version\}/g, '(\\d+)')
            .replace(/\{action\}/g, `(${this.config.actionUpdate}|${this.config.actionRollback})`)
            .replace(/\{description\}/g, `([0-9a-zA-Z\-\_]+)`);

        var versionGetExpr = this.config.patchFileTemplate
            .replace(/\{version\}/g, '(\\d+)')
            .replace(/\{action\}/g, `(?:${this.config.actionUpdate}|${this.config.actionRollback})`)
            .replace(/\{description\}/g, `(?:[0-9a-zA-Z\-\_]+)`);

        var actionGetExpr = this.config.patchFileTemplate
            .replace(/\{version\}/g, '(?:\\d+)')
            .replace(/\{action\}/g, `(${this.config.actionUpdate}|${this.config.actionRollback})`)
            .replace(/\{description\}/g, `(?:[0-9a-zA-Z\-\_]+)`);

        var descriptionGetExpr = this.config.patchFileTemplate
            .replace(/\{version\}/g, '(?:\\d+)')
            .replace(/\{action\}/g, `(?:${this.config.actionUpdate}|${this.config.actionRollback})`)
            .replace(/\{description\}/g, `([0-9a-zA-Z\-\_]+)`);

        return {
            file: function () {
                return new RegExp(fileTestExpr, 'ig');
            },
            version: function () {
                return new RegExp(versionGetExpr, 'ig');
            },
            action: function () {
                return new RegExp(actionGetExpr, 'ig');
            },
            description: function () {
                return new RegExp(descriptionGetExpr, 'ig');
            }
        }
    },
    query: function (query, params) {
        var deferred = q.defer(),
            self = this;
        if (this.client) {
            this.client.query(query, params, function (err, result) {
                if (err) {
                    self.log("[ERR][pgPatch] Could not execute query:\n", err);
                    deferred.reject(err);
                } else {
                    deferred.resolve(result);
                }
            });
        } else {
            this.log("[ERR][pgPatch] No PG client created");
            deferred.reject("[ERR][pgPatch] No PG client created");
        }
        return deferred.promise;
    },
    readFile: function(path){
        var deferred = q.defer();

        fs.readFile(path, function(err, data){
            if(err){
                deferred.reject(err);
            }else{
                deferred.resolve(data);
            }
        });

        return deferred.promise;
    },
    readPatchData: function () {
        return this.scanDirectoryForPatchFiles();
    },
    scanDirectoryForPatchFiles: function (dirPath, fileData) {
        var deferred = q.defer(),
            self = this;

        dirPath = dirPath || [];
        fileData = fileData || {
                patchFiles: {},
                foundPatchFiles: 0,
                maxPatchVersion: null
            };

        var currentSubDir = dirPath.join('/');
        var currentFullDir = `${this.config.patchDir ? this.config.patchDir : '.'}${currentSubDir ? '/' + currentSubDir : ''}`;

        this.log(`scanning ${currentFullDir}`);

        fs.readdir(currentFullDir, function (err, files) {
            var dirPromises = [];
            if (err) {
                deferred.reject(err);
            } else {
                files.forEach(function (filename) {
                    var lstat = fs.lstatSync(`${currentFullDir}/${filename}`);
                    if (lstat.isFile() && self.isPatchFile(filename)) {
                        var version = self.getPatchFileVersion(filename);
                        var action = self.getPatchFileAction(filename);
                        if (action && version) {
                            fileData.patchFiles[version] = fileData.patchFiles[version] || {};
                            fileData.patchFiles[version][action] = fileData.patchFiles[version][action] || [];
                            fileData.patchFiles[version][action].push({
                                file: filename,
                                fullPath: `${currentFullDir}/${filename}`,
                                description: self.getPatchFileDescription(filename)
                            });
                            //fileData.patchFiles.all.push(fileData.patchFiles[version][action]);
                            fileData.maxPatchVersion = Math.max(fileData.maxPatchVersion, version);
                            fileData.foundPatchFiles++;

                            //self.debug("found patch file:", filename);
                        }
                    } else if (lstat.isDirectory()) {
                        dirPromises.push(self.scanDirectoryForPatchFiles(dirPath.concat([filename]), fileData));
                    }
                });

                q.all(dirPromises).then(function () {
                    deferred.resolve(fileData);
                }).catch(function (err) {
                    deferred.reject(err);
                });
            }
        });

        return deferred.promise;
    },
    isPatchFile: function (filename) {
        return this.regex.file().test(filename);
    },
    getDBPatchTableName: function () {
        return `${this.config.dbSchema}.${this.config.dbTable}`;
    },
    getPatchFileAction: function (filename) {
        var match = this.regex.action().exec(filename)[1];
        if (match === this.config.actionUpdate) {
            return actions.UPDATE;
        }
        if (match === this.config.actionRollback) {
            return actions.ROLLBACK;
        }
        return null;
    },
    getPatchFileVersion: function (filename) {
        var match = this.regex.version().exec(filename)[1];
        if (match !== null) {
            return parseInt(match);
        }
        return match;
    },
    getPatchFileDescription: function (filename) {
        return this.regex.description().exec(filename)[1];
    },
    checkPatchDataTable: function () {
        if (this.config.dryRun) {
            return true;
        }
        return this.query(`SELECT EXISTS (SELECT 1 FROM information_schema.tables
WHERE  table_schema = '${this.config.dbSchema}'
AND    table_name = '${this.config.dbTable}');`).then(function (result) {
            return result.rows[0].exists;
        });
    },
    createPatchDataTable: function () {
        return this.query(`create table ${this.getDBPatchTableName()} (
    id serial PRIMARY KEY,
    current_version integer
); 
insert into ${this.config.dbSchema}.${this.config.dbTable} (current_version) VALUES (0)`);
    },
    getCurrentPatchVersion: function () {
        return this.query(`select current_version from ${this.getDBPatchTableName()} limit 1`).then(function (result) {
            return result.rows[0].current_version;
        });
    }
};

module.exports = PgPatcher;