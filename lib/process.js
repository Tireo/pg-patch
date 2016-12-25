'use strict';

const q = require('q');

const fileScanner = require('./file-scanner');
const dbManager = require('./db-manager');

const common = require('./common');
const actions = common.actions;
const transactionMode = common.transactionMode;
const dryRun = common.dryRun;

const PgPatchConsole = require('./consoleReporter');

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

    this.reporters = [
        new PgPatchConsole(config)
    ];

    (this.scanner = new fileScanner(config)).process = this;
    (this.db = new dbManager(config)).process = this;
};

PgPatchProcess.prototype = {
    addReporter: function(reporter){

    },
    msg: function(msgType, msg, data){ //send msg to reporters
        this.reporters.forEach(reporter => {
            reporter.onMsg(msgType, msg, data);
        });
        /*msgType = msgType.split(":");
        if(msgType[0] === 'LOG'){
            this.console[msgType[1].toLowerCase()](msg);
        }*/
    },
    run: function() {
        let cache = this.cache = {};
        let config = this.config;

        return this.db.connect()
            .then(() => { //validate config
                return this.scanner.validatePatchFileTemplate().then(mode => {
                    this.scanner.patchFileTemplateMode = mode;
                });
            })
            .then(() => {  //DB check & setup
                return this.db.initialDBSetup();
            })
            .then(() => { //scan for patch files
                this.msg("LOG:INFO", "looking for patch files");
                return this.scanner.scanDirectoryForPatchFiles().then(patchData => {
                    this.msg("LOG:INFO", `found ${patchData.foundPatchFiles} patch files`);
                    cache.patchData = patchData;
                    cache.maxPatchVersionFound = patchData.maxPatchVersion;
                });
            })
            .then(() => {
                return this.db.getCurrentPatchVersion().then(currentVersion => {
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
                this.msg("LOG:INFO", `source version: ${cache.sourceVersion}, target version: ${cache.targetVersion}`);
                if (cache.sourceVersion === cache.targetVersion) {
                    this.msg("LOG:SUCCESS", "nothing to do");
                } else {
                    return this.patchRouteExists().then(routeExists => {
                        if (!routeExists) {
                            return Promise.reject(`patch route could not be found`);
                        } else {
                            this.msg("LOG:LOG", "patch route found");
                            return this.patch();
                        }
                    });
                }
            })
            .catch(err => {
                cache.error = true;
                this.msg("LOG:ERROR", err);
            })
            .then(() => {
                if(this.db.ownPgClient){
                    this.db.client.end();
                }

                let addon = '';
                if(this.dryRun){
                    addon = 'DRYRUN ';
                }

                if (cache.error) {
                    this.msg("LOG:ERROR", `Patch process ${addon}finished with an error`);
                    return Promise.reject(cache.error);
                } else {
                    this.msg("LOG:SUCCESS", `Patch process ${addon}finished successfully`);
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

        for(let i=0; i<versionSeq.length; i++){
            let version = versionSeq[i];
            if ((!patchFiles[version]) || (!patchFiles[version][action])) {
                return Promise.resolve(false);
            }
        }

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

        for(; i !== stop; (start < stop) ? i++ : i--){
            seq.push(i);
        }
        seq.push(i);

        return seq;
    },
    patch: function() {
        let patchFiles = this.cache.patchData.patchFiles;
        let sourceVersion = this.cache.sourceVersion;
        let targetVersion = this.cache.targetVersion;

        let action = (sourceVersion < targetVersion) ? actions.UPDATE : actions.ROLLBACK;
        let versionReadPromises = [];

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
                versionFilesReadPromises.push(this.scanner.readFile(fileData.fullPath).then(data => {
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
            this.msg("LOG:LOG", "sql data ready");

            if(this.transactionMode === transactionMode.PER_VERSION_STEP) {
                let patchChainPromise = Promise.resolve();
                transactionsData.forEach(transactionData => {
                    let startVersion = action === actions.UPDATE ? transactionData.version-1 : transactionData.version;
                    let finalVersion = action === actions.UPDATE ? transactionData.version : transactionData.version - 1;
                    patchChainPromise = patchChainPromise.then(() => {
                        this.msg("LOG:LOG", `starting ${action} -> ${finalVersion}`);
                        return this.db.patchQuery(transactionData.sql);
                    }).then(() => {
                        return this.db.updatePatchHistory(startVersion, finalVersion).then(() => {
                            this.msg("LOG:SUCCESS", `DB set to NEW version ${finalVersion}`);
                        });
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

                this.msg("LOG:INFO", `starting ${addon}${action} -> ${this.cache.targetVersion} in single transaction`);

                return this.db.patchQuery(sqlToRun.join(';\n')).then(() => {
                    if(this.dryRun !== dryRun.TEST_SQL){
                        this.db.updatePatchHistory(this.cache.sourceVersion, this.cache.targetVersion).then(() => {
                            this.msg("LOG:SUCCESS", `DB set to NEW version ${this.cache.targetVersion}`);
                        });
                    }
                });
            }else{
                return Promise.reject(`unknown transaction control mode: ${this.transactionControl}`);
            }
        });
    }
};

module.exports = PgPatchProcess;