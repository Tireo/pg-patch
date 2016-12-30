'use strict';

const q = require('q');

const fileScanner = require('./file-scanner');
const dbManager = require('./db-manager');
const fsp = require('./fs-promise');

const common = require('./common');
const actions = common.actions;
const transactionMode = common.transactionMode;
const dryRun = common.dryRun;

const PgPatchConsole = require('./console-reporter');

let PgPatchProcess = function (config) {
    config = config || {};

    this.targetVersion = common.determineValue(config.targetVersion, null);
    this.sourceVersion = common.determineValue(config.sourceVersion, null);

    this.dryRun = common.determineValue(dryRun[config.dryRun], null);

    if(this.dryRun){ //force single transaction mode
        this.transactionMode = transactionMode.SINGLE;
    }else{
        this.transactionMode = common.determineValue(transactionMode[config.transactionMode], transactionMode.PER_VERSION_STEP);
    }

    this.reporters = [];
    this.createInitialReporters(config);

    (this.scanner = new fileScanner(config)).process = this;
    (this.db = new dbManager(config)).process = this;
};

PgPatchProcess.prototype = {
    createInitialReporters: function(config){
        if(config.logLevel !== 'NONE'){
            this.addReporter(new PgPatchConsole(config));
        }
    },
    addReporter: function(reporter){
        this.reporters.push(reporter);
    },
    msg: function(msgType, msg, data){ //send msg to reporters
        this.reporters.forEach(reporter => {
            reporter.onMsg(msgType, msg, data);
        });
    },
    run: function() {
        let processCache = {};
        let scanner = this.scanner;
        let dbManager = this.db;

        return this.db.connect()
            .then(() => { //validate config
                return scanner.validatePatchFileTemplate();
            })
            .then(() => {  //DB check & setup
                return dbManager.initialDBSetup();
            })
            .then(() => { //scan for patch files
                this.msg("PATCH_FILE_SCAN:START");
                
                return scanner.scanDirectoryForPatchFiles().then(patchData => {
                    processCache.patchData = patchData;
                    this.msg("PATCH_FILE_SCAN:END", patchData);
                });
            }).then(() => { //create route data based on patchData
                processCache.patchData.createRouteData();
                processCache.maxPatchVersionFound = processCache.patchData.getMaxPatchVersion();
            })
            .then(() => {
                return dbManager.getCurrentPatchVersion().then(currentVersion => {
                    processCache.currentVersion = currentVersion;
                });
            })
            .then(() => { //determine sourceVersion
                if (this.sourceVersion === null || this.sourceVersion === 'current') {
                    processCache.sourceVersion = processCache.currentVersion;
                } else {
                    processCache.sourceVersion = this.sourceVersion;
                }

                if (this.sourceVersion < 0) {
                    return Promise.reject(`Invalid sourceVersion: ${processCache.sourceVersion}`);
                }
                if (this.sourceVersion > processCache.maxPatchVersionFound) {
                    return Promise.reject(`Source patch version not found: ${processCache.sourceVersion}; (Max found was: ${processCache.maxPatchVersionFound})`);
                }
            })
            .then(() => { //determine targetVersion
                if (this.targetVersion === null) { //assume patch to newest
                    processCache.targetVersion = processCache.maxPatchVersionFound;
                } else {
                    processCache.targetVersion = this.targetVersion;
                    if (processCache.targetVersion === 'next') {
                        processCache.targetVersion = processCache.currentVersion + 1;
                    } else if (processCache.targetVersion === 'previous') {
                        processCache.targetVersion = processCache.currentVersion - 1;
                    }
                }

                if (processCache.targetVersion === null) { //error
                    return Promise.reject(`Target patch version could not be determined`);
                }

                if (this.targetVersion < 0) {
                    return Promise.reject(`Invalid targetVersion: ${processCache.sourceVersion}`);
                }
                if (this.targetVersion > processCache.maxPatchVersionFound) {
                    return Promise.reject(`Target patch version not found: ${processCache.targetVersion}; (Max found was: ${processCache.maxPatchVersionFound})`);
                }
            })
            .then(() => { // patch process start
                this.msg("LOG:INFO", `source version: ${processCache.sourceVersion}, target version: ${processCache.targetVersion}`);
                if (processCache.sourceVersion === processCache.targetVersion) {
                    this.msg("LOG:SUCCESS", "nothing to do");
                } else {
                    if (processCache.patchData.patchRouteExists(processCache.sourceVersion, processCache.targetVersion)) {
                        this.msg("LOG:LOG", "patch route found");
                        return this.patch(processCache.sourceVersion, processCache.targetVersion, processCache.patchData.routeData);
                    } else {
                        return Promise.reject(`patch route could not be found`);
                    }
                }
            })
            .catch(err => {
                processCache.error = true;
                this.msg("ERROR", err);
            })
            .then(() => {
                dbManager.closeIfNeeded();

                let msgData = {
                    dryRun: this.dryRun
                };

                if (processCache.error) {
                    this.msg("PROCESS_END:ERROR", msgData);
                    return Promise.reject(processCache.error);
                } else {
                    this.msg("PROCESS_END:SUCCESS", msgData);
                    return Promise.resolve();
                }
            });
    },
    patch: function(sourceVersion, targetVersion, routeData) {

        let action = common.determineAction(sourceVersion, targetVersion);
        let versionSeq = common.generateVersionSequence(sourceVersion, targetVersion);

        let versionReadPromises = [];

        versionSeq.forEach(version => {
            let versionSqlToRun = [];
            if(this.transactionMode === transactionMode.PER_VERSION_STEP){
                versionSqlToRun.push('BEGIN;');
            }

            let versionFilesReadPromises = [];
            routeData[version][action].sort((a, b) => {
                return (a.description || '').localeCompare(b.description || '');
            });

            routeData[version][action].forEach(fileData => {
                versionFilesReadPromises.push(fsp.readFile(fileData.fullPath).then(data => {
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

                this.msg("LOG:INFO", `starting ${addon}${action} -> ${targetVersion} in single transaction`);

                return this.db.patchQuery(sqlToRun.join(';\n')).then(() => {
                    if(this.dryRun !== dryRun.TEST_SQL){
                        this.db.updatePatchHistory(sourceVersion, targetVersion).then(() => {
                            this.msg("LOG:SUCCESS", `DB set to NEW version ${targetVersion}`);
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