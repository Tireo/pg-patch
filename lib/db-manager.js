'use strict';

let q = require('q');
let pg = require('pg');

const common = require('./common');
const dryRunMode = common.dryRunMode;

let DbManager = function (config) {
    config = config || {};

    this.dbTable = common.determineValue(config.dbTable, 'public.pgpatch');

    let tmp = this.dbTable.split('.');
    if (tmp.length > 1) {
        this.dbTable = tmp[1];
        this.dbSchema = tmp[0];
    } else {
        this.dbTable = tmp[0];
        this.dbSchema = 'public';
    }

    this.client = common.determineValue(config.client, null);

    this.dryRunMode = common.determineValue(dryRunMode[config.dryRun], null);
};

DbManager.prototype = {
    msg: common.msgHandler,
    //TODO: move createClient into constructor?
    createClient: function () {
        if (!(this.client instanceof pg.Client)) {
            this.ownPgClient = true;
            this.client = new pg.Client(this.client);
        } else {
            this.ownPgClient = false;
        }
    },
    closeIfNeeded: function () {
        /* istanbul ignore else */
        if (this.ownPgClient) {
            this.client.end();
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
    migrateFrom: function (currentState) {
        let promise = q();
        let cache = {};

        switch (currentState) {
            case 'onlyCurrentVersionInDB': {
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
        }

        return promise;
    },
    migrateIfNeeded: function () {
        return this.columnExists('current_version', this.dbTable, this.dbSchema).then(colExists => {
            if (colExists) {
                this.msg('PG_TABLE:OLD_VERSION_FOUND');
                return this.migrateFrom("onlyCurrentVersionInDB");
            }
        });
    },
    initialDBSetup: function () {
        return this.checkPatchDataTable().then(tableExists => {
            if (tableExists) {
                this.msg('DB_PATCH_TABLE:FOUND', this.getDBPatchTableName());

                return this.migrateIfNeeded();
            } else {
                this.msg('PG_TABLE:CREATING');
                return this.createPatchDataTable();
            }
        });
    },
    columnExists: function (column, dbTable, dbSchema) {
        dbSchema = common.determineValue(dbSchema, 'public');

        return this.query(
            `SELECT EXISTS (SELECT table_schema, table_name, column_name
FROM information_schema.columns
where table_schema = $1 AND table_name=$2 AND column_name=$3);`,
            [dbSchema, dbTable, column]
        ).then(result => {
            return result.rows[0].exists;
        });
    },
    tableExists: function (dbTable, dbSchema) {
        dbSchema = common.determineValue(dbSchema, 'public');
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
        return this.tableExists(this.dbTable, this.dbSchema);
    },
    createPatchDataTable: function () {
        let dbTable = this.getDBPatchTableName();

        return this.query(
            `create table ${dbTable} (
id serial PRIMARY KEY,
source_version integer,
target_version integer,
comment text, 
patch_time timestamp without time zone default now());`
        )
            .then(() => {
                return this.query(`insert into ${dbTable} 
(target_version, comment) 
VALUES 
(0, 'initial pgPatch state')`
                );
            });
    },
    getCurrentPatchVersion: function () {
        return this.query(`select target_version from ${this.getDBPatchTableName()} order by patch_time DESC limit 1`).then(function (result) {
            return result.rows[0].target_version;
        });
    },
    updatePatchHistory: function (source, target) {
        return this.patchQuery(
            `insert into ${this.getDBPatchTableName()}
(source_version, target_version)
values
($1, $2)`, [source, target], true
        );
    },
    patchQuery: function (query, values, forceSilent) {  //will not execute in LOG_ONLY dry_run
        forceSilent = common.determineValue(forceSilent, false);
        if (this.dryRunMode === dryRunMode.LOG_ONLY) {
            /* istanbul ignore else */
            if(!forceSilent){
                this.msg('DRY_RUN:LOG_ONLY:QUERY', {
                    query: query,
                    values: values
                });
            }
            return q();
        } else {
            return this.query(query, values);
        }
    },
    query: function (query, values) {
        let deferred = q.defer();
        this.client.query(query, values, (err, result) => {
            if (err) {
                deferred.reject(`Could not execute query:\n${query}\n${err}`);
            } else {
                deferred.resolve(result);
            }
        });
        return deferred.promise;
    },
    getDBPatchTableName: function () {
        return `${this.dbSchema}.${this.dbTable}`;
    }
};

module.exports = DbManager;