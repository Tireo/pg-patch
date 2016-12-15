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

/**
 * @constructor
 **/
function pgPatcher(client, config){
    this.config = config || {};
    this.config.dbTable = this.config.dbTable || 'pgpatch';
    this.config.dbSchema = this.config.dbSchema || 'public';
    this.config.patchDir = this.config.patchDir || 'pg_patch';
    this.config.actionUpdate = this.config.actionUpdate || 'up';
    this.config.actionRollback = this.config.actionRollback || 'rb';
    this.config.patchFileTemplate = this.config.patchFileTemplate || 'patch-{version}-{action}(?:-{description})?\\.sql';
    this.config.targetVersion = this.config.targetVersion || null;

    this.regex = this.createPatchFileRegexes();
    this.logLevel = logLevels[this.config.logLevel || 'LOG'];
    this.enableColorLogs = this.config.enableColors === undefined ? true : this.config.enableColors;

    if(client instanceof pg.Client){
        this.client = client;
    }else{ //assume client is configuration object
        this.client = new pg.Client(client);
    }

    this.run();
}

pgPatcher.prototype = {
    run: function(){
        var self = this;

        this.cleanCache();

        this.client.connect(function(err){
            if(err){
                self.log("[ERR][pgPatch] Could not connect to DB:\n", err);
            }else{
                q.fcall(function(){
                    return self.config.skipDBTableCheck ? true : self.checkPatchDataTable();
                }).then(function(tableExists){
                    if(tableExists){
                        self.log("db patch table found");
                    }else{
                        self.log("creating db patch table");
                        return self.createPatchDataTable();
                    }
                })
                    .then(function(){
                        return self.getCurrentPatchVersion();
                    })
                    .then(function(currentVersion){
                        self.cache.currentVersion = currentVersion;
                        self.info(`current patch version: ${self.cache.currentVersion}`);
                        self.info("looking for patch files");
                        return self.readPatchData();
                    })
                    .then(function(patchData){
                        self.info(`found ${patchData.patchFiles.all.length} patch files`);
                        //self.debug("found PatchData", JSON.stringify(patchData, null, 2));
                        if(self.config.targetVersion === null){ //assume patch to newest
                            self.info(`patching to newest found version: ${patchData.maxPatchVersion}`);
                            return self.config.targetVersion;
                        }else{
                            if(self.config.targetVersion > patchData.maxPatchVersion){
                                return Promise.reject(`Target patch version not found: ${self.config.targetVersion}; (Max found was: ${patchData.maxPatchVersion})`);
                            }else{
                                self.info(`patching to version: ${self.config.targetVersion}`);
                                //self.success("SUCCESS PLACEHOLDER");
                                return self.config.targetVersion;
                            }
                        }
                    })
                    .catch(function(err){
                        //self.log("[ERR][pgPatch]", err);
                        self.error(err);
                        return Promise.reject(err);
                    })
                    .catch(function(){
                        self.error("Patch process ended with error");
                    })
                    .fin(function(){
                        self.client.end();
                    });
            }
        });
    },
    cleanCache: function(){
        this.cache = {};
    },
    debug: function(){
        if(this.logLevel <= logLevels.DEBUG){
            var args = Array.prototype.slice.call(arguments);
            args.unshift('[DEBUG][pg-patcher]');
            this.enableColorLogs ? console.log(chalk.gray.apply(null, args)) : console.log.apply(null, args);
        }
    },
    log: function(){
        if(this.logLevel <= logLevels.LOG){
            var args = Array.prototype.slice.call(arguments);
            args.unshift('[LOG][pg-patcher]');
            this.enableColorLogs ? console.log(chalk.reset.apply(null, args)) : console.log.apply(null, args);
        }
    },
    info: function(){
        if(this.logLevel <= logLevels.INFO) {
            var args = Array.prototype.slice.call(arguments);
            args.unshift('[INFO][pg-patcher]');
            this.enableColorLogs ? console.log(chalk.blue.apply(null, args)) : console.log.apply(null, args);
        }
    },
    success: function(){
        if(this.logLevel <= logLevels.INFO) {
            var args = Array.prototype.slice.call(arguments);
            args.unshift('[INFO][pg-patcher]');
            this.enableColorLogs ? console.log(chalk.green.apply(null, args)) : console.log.apply(null, args);
        }
    },
    error: function(){
        if(this.logLevel <= logLevels.ERROR) {
            var args = Array.prototype.slice.call(arguments);
            args.unshift('[ERR][pg-patcher]');
            this.enableColorLogs ? console.log(chalk.red.apply(null, args)) : console.log.apply(null, args);
        }
    },
    createPatchFileRegexes: function(){
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

        console.info(descriptionGetExpr);

        return {
            file: function(){ return new RegExp(fileTestExpr, 'ig'); },
            version: function(){ return new RegExp(versionGetExpr, 'ig'); },
            action: function(){ return new RegExp(actionGetExpr, 'ig'); },
            description: function(){ return new RegExp(descriptionGetExpr, 'ig'); }
        }
    },
    query: function(query, params){
        var deferred = q.defer(),
            self = this;
        if(this.client){
            this.client.query(query, params, function(err, result){
                if(err){
                    self.log("[ERR][pgPatch] Could not execute query:\n", err);
                    deferred.reject(err);
                }else{
                    deferred.resolve(result);
                }
            });
        }else{
            this.log("[ERR][pgPatch] No PG client created");
            deferred.reject("[ERR][pgPatch] No PG client created");
        }
        return deferred.promise;
    },
    readPatchData: function(){
        return this.scanDirectoryForPatchFiles();
    },
    scanDirectoryForPatchFiles: function(dirPath, fileData){
        var deferred = q.defer(),
            self = this;

        dirPath = dirPath || [];
        fileData = fileData || {
            patchFiles: {
                all: []
            }, //zero version does not exist
            maxPatchVersion: null
        };

        var currentSubDir = dirPath.join('/');
        var currentFullDir = `${this.config.patchDir ? this.config.patchDir : '.'}${currentSubDir?'/'+currentSubDir:''}`;

        this.log(`scanning ${currentFullDir}`);

        fs.readdir(currentFullDir, function(err, files) {
            var dirPromises = [];
            if(err){
                deferred.reject(err);
            }else{
                files.forEach(function(filename) {
                    var lstat = fs.lstatSync(`${currentFullDir}/${filename}`);
                    if(lstat.isFile() && self.isPatchFile(filename)){
                        var version = self.getPatchFileVersion(filename);
                        var action = self.getPatchFileAction(filename);
                        if(action && version){
                            fileData.patchFiles[version] = fileData.patchFiles[version] || {};
                            fileData.patchFiles[version][action] = {
                                file: filename,
                                fullPath: `${currentFullDir}/${filename}`,
                                action: action,
                                version: version,
                                description: self.getPatchFileDescription(filename)
                            };
                            fileData.patchFiles.all.push(fileData.patchFiles[version][action]);
                            fileData.maxPatchVersion = Math.max(fileData.maxPatchVersion, version);
                            //self.debug("found patch file:", filename);
                        }
                    }else if(lstat.isDirectory()){
                        dirPromises.push(self.scanDirectoryForPatchFiles(dirPath.concat([filename]), fileData));
                    }
                });

                q.all(dirPromises).then(function(){
                    deferred.resolve(fileData);
                }).catch(function(err){
                    deferred.reject(err);
                });
            }
        });

        return deferred.promise;
    },
    isPatchFile: function(filename){
        return this.regex.file().test(filename);
    },
    getDBPatchTableName: function(){
        return `${this.config.dbSchema}.${this.config.dbTable}`;
    },
    getPatchFileAction: function(filename){
        var match = this.regex.action().exec(filename)[1];
        if(match === this.config.actionUpdate){
            return 'update';
        }
        if(match === this.config.actionRollback){
            return 'rollback';
        }
        return null;
    },
    getPatchFileVersion: function(filename){
        var match = this.regex.version().exec(filename)[1];
        if(match !== null){
            return parseInt(match);
        }
        return match;
    },
    getPatchFileDescription: function(filename){
        return this.regex.description().exec(filename)[1];
    },
    checkPatchDataTable: function(){
        return this.query(`SELECT EXISTS (SELECT 1 FROM   information_schema.tables
WHERE  table_schema = '${this.config.dbSchema}'
AND    table_name = '${this.config.dbTable}');`).then(function(result){
            return result.rows[0].exists;
        });
    },
    createPatchDataTable: function(){
        return this.query(`create table ${this.getDBPatchTableName()} (
    id serial PRIMARY KEY,
    current_version text
); 
insert into ${schema}.${table} (current_version) VALUES (0)`);
    },
    getCurrentPatchVersion: function(){
        return this.query(`select current_version from ${this.getDBPatchTableName()} limit 1`).then(function(result){
            return result.rows[0].current_version;
        });
    }
};

module.exports = pgPatcher;