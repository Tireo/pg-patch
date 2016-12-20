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
            if (this.client instanceof pg.Client) {
                this.client.connect(err => {
                    if (err) {
                        deferred.reject(err);
                    } else {
                        deferred.resolve();
                    }
                });
            } else {
                deferred.reject("pg client not available");
            }
            return deferred.promise;
        });

    },
    initialDBSetup: function () {
        return this.checkPatchDataTable().then(tableExists => {
            if (tableExists) {
                this.process.console.info(`db patch table found: ${this.getDBPatchTableName()}`);
            } else {
                this.process.console.info("creating db patch table");
                return this.createPatchDataTable();
            }
        });
    },
    checkPatchDataTable: function () {
        return this.query(
            `SELECT EXISTS (SELECT 1 FROM information_schema.tables
WHERE table_schema = $1
AND table_name = $2);`,
            [this.config.dbSchema, this.config.dbTable]
        ).then(function (result) {
            return result.rows[0].exists;
        });
    },
    createPatchDataTable: function () {
        let self = this;
        return this.query(`create table ${this.getDBPatchTableName()} (
                                    id serial PRIMARY KEY,
                                    current_version integer);`)
            .then(function () {
                return self.query(`insert into ${self.config.dbSchema}.${self.config.dbTable} (current_version) VALUES (0)`);
            });
    },
    getCurrentPatchVersion: function () {
        return this.query(`select current_version from ${this.getDBPatchTableName()} limit 1`).then(function (result) {
            return result.rows[0].current_version;
        });
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