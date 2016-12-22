'use strict';

let q = require('q');
let pg = require('pg');

const common = require('./common');
const dryRun = common.dryRun;

let DbManager = function (config) {
    config = config || {};

    this.config = {};
    this.config.client = config.client;

    //TODO: modify logic
    this.config.dbTable = config.dbTable || 'pgpatch';
    if(config.dbSchema){
        this.config.dbSchema = config.dbSchema || 'public';
    }else{
        let tmp = this.config.dbTable.split('.');
        if(tmp.length > 1){
            this.config.dbTable = tmp[1];
            this.config.dbSchema = tmp[0];
        }else{
            this.config.dbTable = tmp[0];
            this.config.dbSchema = 'public';
        }
    }

    this.dryRun = common.determineValue(dryRun[config.dryRun], null);

    this.createClient();
};

DbManager.prototype = {
    createClient: function () {
        let client = this.config.client;

        if (client instanceof pg.Client) {
            this.client = client;
        } else { //assume client is configuration object
            this.ownPgClient = true;
            this.client = client ? new pg.Client(client) : new pg.Client();
        }

        if (!(this.client instanceof pg.Client)) {
            return Promise.reject("Invalid pg.Client (or configuration) supplied");
        }
    },
    connect: function () {
        return q(this.createClient()).then(() => {
            let deferred = q.defer();
            
            this.client.connect(err => {
                if (err) {
                    deferred.reject(err);
                } else {
                    deferred.resolve();
                }
            });
            
            return deferred.promise;
        });
    },
    migrateIfNeeded: function(currentState){
        let promise = q();
        
        switch(currentState){
            case 'onlyCurrentVersionInDB':
                let cache = {};
                promise = promise.then(() => {
                    return this.query(`select current_version from ${this.getDBPatchTableName()} limit 1;`).then(function (result) {
                        return result.rows[0].current_version;
                    }).then(currentVersion => {
                        cache.currentVersion = currentVersion;
                        return this.query(`DROP TABLE ${this.getDBPatchTableName()};`);
                    }).then(() => {
                        return this.createPatchDataTable();
                    }).then(() => {
                        return this.query(`update ${this.getDBPatchTableName()} SET target_version = ${cache.currentVersion}`);
                    });
                });
        }
        
        return promise;
    },
    initialDBSetup: function () {
        return this.checkPatchDataTable().then(tableExists => {
            if (tableExists) {
                this.process.console.info(`db patch table found: ${this.getDBPatchTableName()}`);
                return this.columnExists('current_version', this.config.dbTable, this.config.dbSchema).then(colExists => {
                    if(colExists){
                        this.process.console.warn("old table detected");
                        return this.migrateIfNeeded("onlyCurrentVersionInDB");
                    }
                });
            } else {
                this.process.console.info("creating db patch table");
                return this.createPatchDataTable();
            }
        });
    },
    columnExists: function(column, dbTable, dbSchema){
        dbSchema = dbSchema || 'public';
        
        return this.query(
            `SELECT EXISTS (SELECT table_schema, table_name, column_name
                            FROM information_schema.columns
                            where table_schema = $1 AND table_name=$2 AND column_name=$3);`,
            [dbSchema, dbTable, column]
        ).then(result => {
            return result.rows[0].exists;
        });
    },
    tableExists: function(dbTable, dbSchema){
        dbSchema = dbSchema || 'public';
        return this.query(
            `SELECT EXISTS (SELECT 1 FROM information_schema.tables
WHERE table_schema = $1
AND table_name = $2);`,
            [dbSchema, dbTable]
        ).then(result => {
            return result.rows[0].exists;
        });
    },
    checkPatchDataTable: function () {
        return this.tableExists(this.config.dbTable, this.config.dbSchema);
    },
    createPatchDataTable: function () {
        return this.query(
            `create table ${this.getDBPatchTableName()} (
                    id serial PRIMARY KEY,
                    source_version integer,
                    target_version integer,
                    comment text, 
                    patch_time timestamp without time zone default now());`
            )
            .then(() => {
                return this.query(`insert into ${this.getDBPatchTableName()} 
                                    (target_version, comment) 
                                    VALUES 
                                    (0, 'initial pgPatch state')`);
            });
    },
    getCurrentPatchVersion: function () {
        return this.query(`select target_version from ${this.getDBPatchTableName()} order by patch_time DESC limit 1`).then(function (result) {
            return result.rows[0].target_version;
        });
    },
    updatePatchHistory: function(source, target){
        return this.patchQuery(
            `insert into ${this.getDBPatchTableName()}
                (source_version, target_version)
                values
                (${source}, ${target})`
        );  
    },
    patchQuery: function (query, values) {
        let deferred = q.defer();
        if (this.client) {
            if(this.dryRun === dryRun.LOG_ONLY){
                this.console.info("running query:\n", query);
                if(values){
                    this.console.info("with values: ", values);
                }
                this.console.info("-------");
                deferred.resolve();
            }else{
                return this.query(query, values);
            }
        } else {
            deferred.reject("No PG client created");
        }
        return deferred.promise;
    },
    query: function (query, values) {
        let deferred = q.defer();
        if (this.client) {
            this.client.query(query, values, (err, result) => {
                if (err) {
                    deferred.reject(`Could not execute query:\n${query}\n${err}`);
                } else {
                    deferred.resolve(result);
                }
            });
        } else {
            deferred.reject("No PG client created");
        }
        return deferred.promise;
    },
    getDBPatchTableName: function () {
        return `${this.config.dbSchema}.${this.config.dbTable}`;
    }
};

module.exports = DbManager;