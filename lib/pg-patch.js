
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
                console.log("[LOG][pgPatch] reading patch directory");
                return self.readPatchDir();

                //console.log("after table creation", r);
            })
            .catch(function(err){
                console.log("[ERR][pgPatch] Patch process ended with error:", err);
            })
            .fin(function(){
                //console.info('client.end()');
                self.client.end();
            });
        }
    });

}

pgPatcher.prototype = {
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
    readPatchDir: function(){
        var deferred = q.defer(),
            self = this;
        fs.readdir(this.config.patchDir, function(err, files) {
            if(err){
                deferred.reject(err);
            }else{
                files.forEach(function(filename) {
                    console.log("---", filename, self.isPatchFile(filename));
                });
                deferred.resolve();
            }
        });
        return deferred.promise;
    },
    isPatchFile: function(filename){
        return /\.sql/.test(filename);
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