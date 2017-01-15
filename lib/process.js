'use strict';

const q = require('q');

const fileScanner = require('./file-scanner');
const dbManager = require('./db-manager');
const fsp = require('./fs-promise');

const common = require('./common');
const actions = common.action;
const transactionMode = common.transactionMode;
const dryRun = common.dryRunMode;

const PgPatchConsoleReporter = require('./reporters/console-reporter');
const PgPatchBasicReporter = require('./reporters/basic-reporter');

let PgPatchProcess = function (config) {
    config = config || {};

    this.targetVersion = common.determineValue(config.targetVersion, null);
    this.sourceVersion = common.determineValue(config.sourceVersion, null);
    this.customPatchData = common.determineValue(config.customPatchData, null);

    this.dryRun = common.determineValue(dryRun[config.dryRun], null);

    if (this.dryRun) { //force single transaction mode
        this.transactionMode = transactionMode.SINGLE;
    } else {
        this.transactionMode = common.determineValue(transactionMode[config.transactionMode], transactionMode.PER_VERSION_STEP);
    }

    this.reporters = [];
    this.createInitialReporters(config);

    (this.scanner = new fileScanner(config)).process = this;
    (this.db = new dbManager(config)).process = this;
};

PgPatchProcess.prototype = {
    createInitialReporters: function (config) {
        /* istanbul ignore else */
        if (config.logLevel !== 'NONE') {
            this.addReporter(new PgPatchConsoleReporter(config));
        }

        /* istanbul ignore else */
        if (config.notify) {
            config.notify.forEach(notifyConfig => {
                this.addReporter(new PgPatchBasicReporter(notifyConfig));
            });
        }

        /* istanbul ignore else */
        if (config.reporters) {
            config.reporters.forEach(reporter => {
                this.addReporter(reporter);
            });
        }
    },
    addReporter: function (reporter) {
        this.reporters.push(reporter);
    },
    msg: function (msgType, msg, data) { //send msg to reporters
        this.reporters.forEach(reporter => {
            reporter.onMsg(msgType, msg, data);
        });
    },
    run: function () {
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
                    this.msg("PATCH_FILE_SCAN:END", patchData);

                    /* istanbul ignore else */
                    if (this.customPatchData) {
                        this.customPatchData.forEach(data => {
                            data.type = 'CUSTOM';
                            patchData.addData(data)
                        });
                    }

                    processCache.patchData = patchData;
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

                /* istanbul ignore else */
                if (this.sourceVersion < 0) {
                    return Promise.reject(`Invalid sourceVersion: ${processCache.sourceVersion}`);
                }

                /* istanbul ignore else */
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
                    } else /* istanbul ignore else */ if (processCache.targetVersion === 'previous') {
                        processCache.targetVersion = processCache.currentVersion - 1;
                    }
                }

                /* istanbul ignore else */
                if (processCache.targetVersion === null) { //error
                    return Promise.reject(`Target patch version could not be determined`);
                }

                /* istanbul ignore else */
                if (this.targetVersion < 0) {
                    return Promise.reject(`Invalid targetVersion: ${processCache.sourceVersion}`);
                }

                /* istanbul ignore else */
                if (this.targetVersion > processCache.maxPatchVersionFound) {
                    return Promise.reject(`Target patch version not found: ${processCache.targetVersion}; (Max found was: ${processCache.maxPatchVersionFound})`);
                }
            })
            .then(() => { // patch process start
                this.msg("PROCESS:SUMMARY", processCache); //TODO: do not pass processCache directly

                /* istanbul ignore else */
                if (processCache.sourceVersion === processCache.targetVersion) {
                    this.msg("PROCESS:NOTHING_TO_DO");
                    return;
                }

                /* istanbul ignore else */
                if (!processCache.patchData.patchRouteExists(processCache.sourceVersion, processCache.targetVersion)) {
                    return Promise.reject(`patch route could not be found`);
                }

                return this.loadSQLData(
                    processCache.sourceVersion, processCache.targetVersion, processCache.patchData.routeData
                ).then((transactionsData) => { //create SQL packages to run
                    this.msg("PROCESS:SQL_DATA_READY");
                    return this.startPatch(transactionsData);
                });
            })
            .catch(err => {
                processCache.error = err;
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
    startPatch: function (transactionsData) {
        if (this.transactionMode === transactionMode.PER_VERSION_STEP) {
            return this.patchInSeparateTransactions(transactionsData);
        } else if (this.transactionMode === transactionMode.SINGLE) {
            return this.patchInSingleTransaction(transactionsData);
        } else {
            return Promise.reject(`unknown transaction control mode: ${this.transactionControl}`);
        }
    },
    loadSQLData: function (sourceVersion, targetVersion, routeData) {
        let action = common.determineAction(sourceVersion, targetVersion);
        let versionSeq = common.generateVersionPatchSequence(sourceVersion, targetVersion);

        let versionSqlGetPromises = [];

        versionSeq.forEach(version => {
            let versionStepSqlDataPromises = [];
            let currentRouteDataParts = routeData[version][action];

            currentRouteDataParts.sort((a, b) => {
                return (a.description || '').localeCompare(b.description || '');
            });

            currentRouteDataParts.forEach((data, idx) => {
                if (data.type === 'FILE') {
                    versionStepSqlDataPromises.push(
                        fsp.readFile(data.fullPath).then(readBuffer => {
                            return readBuffer.toString();
                        })
                    );
                } else /* istanbul ignore else */ if (data.type === 'CUSTOM') {
                    versionStepSqlDataPromises.push(
                        q.fcall(() => {
                            return data.sql;
                        })
                    );
                }
            });

            let sourceVersion, targetVersion;
            if (action === common.action.UPDATE) {
                sourceVersion = version - 1;
                targetVersion = version;
            } else /* istanbul ignore else */ if (action === common.action.ROLLBACK) {
                sourceVersion = version;
                targetVersion = version - 1;
            }

            versionSqlGetPromises.push(q.all(versionStepSqlDataPromises).then((versionStepSqlData) => {
                /* istanbul ignore else */
                if (this.transactionMode === transactionMode.PER_VERSION_STEP) {
                    versionStepSqlData.unshift('BEGIN;');
                    versionStepSqlData.push('COMMIT;');
                }
                return {
                    sourceVersion: sourceVersion,
                    targetVersion: targetVersion,
                    action: action,
                    sql: versionStepSqlData.join(';\n')
                };
            }));
        });

        return q.all(versionSqlGetPromises);
    },
    updatePatchHistory: function (sourceVersion, targetVersion) {
        let dbManager = this.db;
        return dbManager.updatePatchHistory(sourceVersion, targetVersion).then(() => {
            this.msg("PROCESS:DB_VERSION_UPDATED", targetVersion);
        });
    },
    patchInSeparateTransactions: function (transactionsData) {
        let patchChainPromise = q();
        let dbManager = this.db;

        transactionsData.forEach(transactionData => {
            let action = transactionData.action;
            let sourceVersion = transactionData.sourceVersion;
            let targetVersion = transactionData.targetVersion;

            patchChainPromise = patchChainPromise.then(() => {
                this.msg("PROCESS:TRANSACTION_START", {
                    action: action,
                    sourceVersion: sourceVersion,
                    targetVersion: targetVersion,
                    dryRun: this.dryRun
                });
                return dbManager.patchQuery(transactionData.sql);
            }).then(() => {
                return this.updatePatchHistory(sourceVersion, targetVersion);
            });
        });
        return patchChainPromise;
    },
    patchInSingleTransaction: function (transactionsData) {
        let sqlToRun = ['BEGIN;'];
        let action = transactionsData[0].action; //all other will be the same
        let sourceVersion = transactionsData[0].sourceVersion;
        let targetVersion = transactionsData[transactionsData.length - 1].targetVersion;
        let dbManager = this.db;

        transactionsData.forEach(transactionData => {
            sqlToRun.push(transactionData.sql);
        });

        if (this.dryRun === dryRun.TEST_SQL) {
            sqlToRun.push('ROLLBACK;');
        } else {
            sqlToRun.push('COMMIT;');
        }

        this.msg("PROCESS:TRANSACTION_START", {
            action: action,
            targetVersion: targetVersion,
            dryRun: this.dryRun,
            transactionMode: this.transactionMode
        });

        return dbManager.patchQuery(sqlToRun.join(';\n')).then(() => {
            /* istanbul ignore else */
            if (this.dryRun !== dryRun.TEST_SQL) {
                return this.updatePatchHistory(sourceVersion, targetVersion);
            }
        });
    }
};

module.exports = PgPatchProcess;