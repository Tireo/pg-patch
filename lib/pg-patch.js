var fs = require('fs');
var pg = require('pg');
var q = require('q');

/**
 * @constructor
 **/
function pgPatcher(client, config){
    var self = this;

    this.config = config || {};
    this.config.dbTable = this.config.dbTable || 'pgpatch';
    this.config.dbSchema = this.config.dbSchema || 'public';
    this.config.patchDir = this.config.patchDir || 'pg_patch';
    this.config.actionUpdate = this.config.actionUpdate || 'up';
    this.config.actionRollback = this.config.actionRollback || 'rb';
    this.config.patchFileTemplate = this.config.patchFileTemplate || 'patch-{version}-{action}\\.sql';
    this.config.targetVersion = this.config.targetVersion || null;

    this.regex = this.createPatchFileRegexes();

    if(client instanceof pg.Client){
        this.client = client;
    }else{ //assume client is configuration object
        this.client = new pg.Client(client);
    }

    this.client.connect(function(err){
        if(err){
            console.log("[ERR][pgPatch] Could not connect to DB:\n", err);
        }else{
            q.fcall(function(){
                return self.config.skipDBTableCheck ? true : self.checkPatchDataTable();
            }).then(function(tableExists){
                if(tableExists){
                    console.log("[LOG][pgPatch] db patch table found");
                }else{
                    console.log("[LOG][pgPatch] creating db patch table");
                    return self.createPatchDataTable();
                }
            })
            .then(function(){
                console.log("[LOG][pgPatch] reading patch data");
                return self.readPatchData();

                //console.log("after table creation", r);
            })
            .then(function(patchData){
                console.info("found PatchData", patchData);
                if(self.config.targetVersion === null){ //assume patch to newest
                    console.log(`[LOG][pgPatch] patching to newest found version: ${patchData.maxPatchVersion}`);
                    return self.config.targetVersion;
                }else{
                    if(self.config.targetVersion > patchData.maxPatchVersion){
                        return Promise.reject(`Target patch version not found: ${self.config.targetVersion}; (Max found was: ${patchData.maxPatchVersion})`);
                    }else{
                        console.log(`[LOG][pgPatch] patching to version: ${self.config.targetVersion}`);
                        return self.config.targetVersion;
                    }
                }
            })
            .catch(function(err){
                console.log("[ERR][pgPatch]", err);
                return Promise.reject(err);
            })
            .catch(function(){
                console.log("[ERR][pgPatch] Patch process ended with error");
            })
            .fin(function(){
                self.client.end();
            });
        }
    });

}

pgPatcher.prototype = {
    createPatchFileRegexes: function(){
        var fileTestExpr = this.config.patchFileTemplate
                                .replace(/\{version\}/g, '(\\d+)')
                                .replace(/\{action\}/g, `(${this.config.actionUpdate}|${this.config.actionRollback})`);

        var versionGetExpr = this.config.patchFileTemplate
            .replace(/\{version\}/g, '(\\d+)')
            .replace(/\{action\}/g, `(?:${this.config.actionUpdate}|${this.config.actionRollback})`);

        var actionGetExpr = this.config.patchFileTemplate
            .replace(/\{version\}/g, '(?:\\d+)')
            .replace(/\{action\}/g, `(${this.config.actionUpdate}|${this.config.actionRollback})`);

        return {
            file: function(){ return new RegExp(fileTestExpr, 'ig'); },
            version: function(){ return new RegExp(versionGetExpr, 'ig'); },
            action: function(){ return new RegExp(actionGetExpr, 'ig'); }
        }
    },
    query: function(query, params){
        var deferred = q.defer();
        if(this.client){
            this.client.query(query, params, function(err, result){
                if(err){
                    console.log("[ERR][pgPatch] Could not execute query:\n", err);
                    deferred.reject(err);
                }else{
                    deferred.resolve(result);
                }
            });
        }else{
            console.log("[ERR][pgPatch] No PG client created");
            deferred.reject("[ERR][pgPatch] No PG client created");
        }
        return deferred.promise;
    },
    readPatchData: function(){
        var deferred = q.defer(),
            self = this,
            fileData = {
                patchFiles: [null], //zero version does not exist
                maxPatchVersion: null
            };
        fs.readdir(this.config.patchDir, function(err, files) {
            if(err){
                deferred.reject(err);
            }else{
                files.forEach(function(filename) {
                    if(fs.lstatSync(`${self.config.patchDir}/${filename}`).isFile()){
                        var version = self.getPatchFileVersion(filename);
                        var action = self.getPatchFileAction(filename);
                        if(action && version){
                            fileData.patchFiles[version] = fileData.patchFiles[version] || {};
                            fileData.patchFiles[version][action] = filename;
                            fileData.maxPatchVersion = Math.max(fileData.maxPatchVersion, version);
                        }
                        console.log("---", filename, self.isPatchFile(filename), version, action);

                    }
                });
                deferred.resolve(fileData);
            }
        });
        return deferred.promise;
    },
    isPatchFile: function(filename){
        return this.regex.file().test(filename);
    },
    getPatchFileVersion: function(filename){
        var match = this.regex.version().exec(filename)[1];
        if(match !== null){
            return parseInt(match);
        }
        return match;
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
    checkPatchDataTable: function(){
        return this.query(`SELECT EXISTS (SELECT 1 FROM   information_schema.tables
WHERE  table_schema = '${this.config.dbSchema}'
AND    table_name = '${this.config.dbTable}');`).then(function(result){
            return result.rows[0].exists;
        });
    },
    createPatchDataTable: function(){
        var schema = this.config.dbSchema,
            table = this.config.dbTable;
        return this.query(`create table ${schema}.${table} (
    id serial PRIMARY KEY,
    current_version text
); 
insert into ${schema}.${table} (current_version) VALUES (0)`);
    }
};

module.exports = pgPatcher;