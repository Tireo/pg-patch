'use strict';

const q = require('q');

const fileScanner = require('./file-scanner');
const dbManager = require('./db-manager');

const common = require('./common');
const actions = common.actions;
const transactionMode = common.transactionMode;
const dryRun = common.dryRun;

const PgPatchConsole = require('./console');

let PgPatchProcess = function (config) {
    config = config || {};

    this.config = {};
    this.config.targetVersion = common.determineValue(config.targetVersion, null);
    this.config.sourceVersion = common.determineValue(config.sourceVersion, null);

    this.dryRun = common.determineValue(dryRun[config.dryRun], null);

    if(this.dryRun){ //force single transaction mode
        this.transactionMode = transactionMode.SINGLE;
    }else{
        this.transactionMode = common.determineValue(transactionMode[config.transactionMode], transactionMode.PER_VERSION_STEP);
    }

    (this.scanner = new fileScanner(config)).process = this;
    (this.db = new dbManager(config)).process = this;

    (new PgPatchConsole(config)).attachTo(this, this.scanner, this.db);
};

PgPatchProcess.prototype = {
    run: function() {
        let self = this;

        let cache = this.cache = {};
        let config = this.config;
        let console = this.console;

        return this.db.connect()
            .then(() => {  //DB check & setup
                return self.db.initialDBSetup();
            })
            .then(() => { //scan for patch files
                console.info("looking for patch files");
                return self.scanner.scanDirectoryForPatchFiles().then(patchData => {

                    //self.debug("patchData: ", JSON.stringify(patchData, null, 2));

                    console.info(`found ${patchData.foundPatchFiles} patch files`);
                    cache.patchData = patchData;
                    cache.maxPatchVersionFound = patchData.maxPatchVersion;
                });
            })
            .then(() => {
                return self.db.getCurrentPatchVersion().then(currentVersion => {
                    cache.currentVersion = currentVersion;
                });
            })
            .then(() => { //determine sourceVersion
                if (config.sourceVersion === null || config.sourceVersion === 'current') {
                    cache.sourceVersion = cache.currentVersion;
                } else {
                    cache.sourceVersion = config.sourceVersion;
                }

                if (config.sourceVersion < 0) {
                    return Promise.reject(`Invalid sourceVersion: ${cache.sourceVersion}`);
                }
                if (config.sourceVersion > cache.maxPatchVersionFound) {
                    return Promise.reject(`Source patch version not found: ${cache.sourceVersion}; (Max found was: ${cache.maxPatchVersionFound})`);
                }
            })
            .then(() => { //determine targetVersion
                if (config.targetVersion === null) { //assume patch to newest
                    cache.targetVersion = cache.maxPatchVersionFound;
                } else {
                    cache.targetVersion = config.targetVersion;
                    if (cache.targetVersion === 'next') {
                        cache.targetVersion = cache.currentVersion + 1;
                    } else if (cache.targetVersion === 'previous') {
                        cache.targetVersion = cache.currentVersion - 1;
                    }
                }

                if (cache.targetVersion === null) { //error
                    return Promise.reject(`Target patch version could not be determined`);
                }

                if (config.targetVersion < 0) {
                    return Promise.reject(`Invalid targetVersion: ${cache.sourceVersion}`);
                }
                if (config.targetVersion > cache.maxPatchVersionFound) {
                    return Promise.reject(`Target patch version not found: ${cache.targetVersion}; (Max found was: ${cache.maxPatchVersionFound})`);
                }
            })
            .then(() => { // patch process start
                console.info(`source version: ${cache.sourceVersion}, target version: ${cache.targetVersion}`);
                if (cache.sourceVersion === cache.targetVersion) {
                    console.success("nothing to do");
                } else {
                    return self.patchRouteExists().then(routeExists => {
                        if (!routeExists) {
                            return Promise.reject(`patch route could not be found`);
                        } else {
                            console.log("patch route found");
                            return self.patch();
                        }
                    });
                }
            })
            .catch(err => {
                cache.error = true;
                console.error(err);
            })
            .then(() => {
                if(self.db.ownPgClient){
                    self.db.client.end();
                }

                let addon = '';
                if(this.dryRun){
                    addon = 'DRYRUN ';
                }

                if (cache.error) {
                    console.error(`Patch process ${addon}finished with an error`);
                    return Promise.reject(cache.error);

                } else {
                    console.success(`Patch process ${addon}finished successfully`);
                    return Promise.resolve();
                }
            });
    },
    patchRouteExists: function() {
        let patchFiles = this.cache.patchData.patchFiles;
        let sourceVersion = this.cache.sourceVersion;
        let targetVersion = this.cache.targetVersion;

        if (sourceVersion === targetVersion) {
            return true;
        }
        let action = (sourceVersion < targetVersion) ? actions.UPDATE : actions.ROLLBACK;

        let versionSeq = this.generateVersionSequenceForAction(action);

        versionSeq.forEach(version => {
            if (!patchFiles[version] || !patchFiles[version][action]) {
                return Promise.resolve(false);
            }
        });

        return Promise.resolve(true);
    },
    generateVersionSequenceForAction: function(action) {
        if (action === actions.UPDATE) {
            return this.generateVersionSequence(this.cache.sourceVersion + 1, this.cache.targetVersion);
        } else {
            return this.generateVersionSequence(this.cache.sourceVersion, this.cache.targetVersion + 1);
        }
    },
    generateVersionSequence: function(start, stop) {
        let seq = [],
            i = start;
        while (i !== stop) {
            seq.push(i);

            if (start < stop) {
                i++;
            } else {
                i--;
            }
        }
        return seq;
    },
    patch: function() {
        let patchFiles = this.cache.patchData.patchFiles;
        let sourceVersion = this.cache.sourceVersion;
        let targetVersion = this.cache.targetVersion;

        let action = (sourceVersion < targetVersion) ? actions.UPDATE : actions.ROLLBACK;
        let versionReadPromises = [];
        let self = this;

        let versionSeq = this.generateVersionSequenceForAction(action);

        versionSeq.forEach(version => {
            let versionSqlToRun = [];
            if(this.transactionMode === transactionMode.PER_VERSION_STEP){
                versionSqlToRun.push('BEGIN;');
            }

            let versionFilesReadPromises = [];
            patchFiles[version][action].sort((a, b) => {
                return (a.description || '').localeCompare(b.description || '');
            });

            patchFiles[version][action].forEach(fileData => {
                versionFilesReadPromises.push(self.scanner.readFile(fileData.fullPath).then(data => {
                    versionSqlToRun.push(data.toString());
                    return versionSqlToRun;
                }));
            });

            versionReadPromises.push(q.all(versionFilesReadPromises).then(() => {
                if(this.transactionMode === transactionMode.PER_VERSION_STEP){
                    versionSqlToRun.push('COMMIT;');
                }
                return {
                    version: version,
                    sql: versionSqlToRun.join(';\n')
                };
            }));
        });

        return q.all(versionReadPromises).then(transactionsData => {
            this.console.log("sql data ready");

            if(this.transactionMode === transactionMode.PER_VERSION_STEP) {
                let patchChainPromise = Promise.resolve();
                transactionsData.forEach(transactionData => {
                    patchChainPromise = patchChainPromise.then(() => {
                        if (action === actions.UPDATE) {
                            this.console.log(`starting ${action} -> ${transactionData.version}`);
                        } else {
                            this.console.log(`starting ${action} -> ${transactionData.version - 1}`);
                        }
                        return self.db.patchQuery(transactionData.sql);
                    }).then(() => {
                        if (action === actions.UPDATE) {
                            return self.db.patchQuery(`update ${this.db.getDBPatchTableName()} set current_version = ${transactionData.version};`).then(() => {
                                this.console.success(`DB updated to version ${transactionData.version}`);
                            });
                        } else {
                            return self.db.patchQuery(`update ${this.db.getDBPatchTableName()} set current_version = ${transactionData.version - 1};`).then(() => {
                                this.console.success(`DB rolled back to version ${transactionData.version - 1}`);
                            });
                        }
                    });
                });
                return patchChainPromise;
            }else if(this.transactionMode === transactionMode.SINGLE){
                let sqlToRun = ['BEGIN;'];
                transactionsData.forEach(transactionData => {
                    sqlToRun.push(transactionData.sql);
                });
                let addon = '';
                if(this.dryRun){
                    addon = 'DRYRUN ';
                }

                if(this.dryRun === dryRun.TEST_SQL){
                    sqlToRun.push('ROLLBACK;');
                }else{
                    sqlToRun.push('COMMIT;');
                }

                this.console.info(`starting ${addon}${action} -> ${this.cache.targetVersion} in single transaction`);

                return this.db.patchQuery(sqlToRun.join(';\n')).then(() => {
                    if(this.dryRun !== dryRun.TEST_SQL){
                        if (action === actions.UPDATE) {
                            return this.db.patchQuery(`update ${this.db.getDBPatchTableName()} set current_version = ${this.cache.targetVersion};`).then(() => {
                                this.console.success(`DB updated to version ${this.cache.targetVersion}`);
                            });
                        } else {
                            return this.db.patchQuery(`update ${this.db.getDBPatchTableName()} set current_version = ${this.cache.targetVersion - 1};`).then(() => {
                                this.console.success(`DB rolled back to version ${this.cache.targetVersion - 1}`);
                            });
                        }
                    }
                });
            }else{
                return Promise.reject(`unknown transaction control mode: ${this.transactionControl}`);
            }

        });
    }
};

module.exports = PgPatchProcess;