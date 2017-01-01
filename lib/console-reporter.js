'use strict';

const chalk = require('chalk');

const common = require('./common');
const msgHandler = require('./msg-handler');

const logLevels = common.logLevel;
const logChalk = common.logChalk;

let PgPatchConsole = function (config) {
    config = common.determineValue(config, {});

    this.logLevel = common.determineValue(logLevels[config.logLevel], logLevels.INFO);
    this.enableColorfulLogs = common.determineValue(config.enableColorfulLogs, true);

    this.msgHandler = new msgHandler();

    this.registerMsgHandlers();
    this.createConsoleInvokers();
};

PgPatchConsole.prototype = {
    registerMsgHandlers: function () {
        this.msgHandler.registerMsgHandlers({
            'ERROR.*': (data) => {
                this.error(data);
            },
            'PATCH_FILE:FOUND': (data) => {
                this.debug(`found patch file: ${data}`);
            },
            'PG_TABLE:CREATING': () => {
                this.info(`creating db patch table`);
            },
            'PG_TABLE:OLD_VERSION_FOUND': () => {
                this.info(`old DB structure found - migrating.`);
            },
            'PROCESS:SUMMARY': (data) => {
                this.info(`source version: ${data.sourceVersion}, target version: ${data.targetVersion}`);
            },
            'PROCESS:NOTHING_TO_DO': () => {
                this.success(`nothing to do`);
            },
            'PROCESS:ROUTE_FOUND': () => {
                this.log(`patch route found`);
            },
            'PROCESS:SQL_DATA_READY': () => {
                this.log(`sql data ready`);
            },
            'PROCESS:DB_VERSION_UPDATED': (data) => {
                this.success(`DB set to NEW version ${data}`);
            },
            'PROCESS:TRANSACTION_START': (data) => {
                let addon = '';
                if (data.dryRun) {
                    addon = 'DRYRUN ';
                }
                let post = '';
                if (data.transactionMode === common.transactionMode.SINGLE) {
                    post = ' in single transaction';
                }

                this.log(`starting ${addon}${data.action} -> ${data.targetVersion}${post}`);
            },
            'PROCESS_END:.*': (data, params) => { //TODO: unify
                let addon = '';
                if (data.dryRun) {
                    addon = 'DRYRUN ';
                }

                if (params[1] === 'ERROR') {
                    this.error(`Patch process ${addon}finished with an error`);
                } else /* istanbul ignore else */ if (params[1] === 'SUCCESS') {
                    this.success(`Patch process ${addon}finished successfully`);
                }
            },
            'DB_PATCH_TABLE:FOUND': (data) => {
                this.info(`db patch table found: ${data}`);
            },
            'PATCH_FILE_SCAN:.*': (data, params) => {
                if (params[1] === 'START') {
                    this.info("looking for patch files");
                } else if (params[1] === 'END') {
                    this.info(`found ${data.data.length} patch files`);
                }
            },
            'DIR_SCAN:START': (data) => {
                this.log(`scanning ${data}`);
            },
            'DRY_RUN:LOG_ONLY:QUERY': (data) => {
                this.info(`running query:\n${data.query}`);
                /* istanbul ignore else */
                if (data.values) {
                    this.info(`with values: ${data.values}`);
                }
                this.info("-------");
            },
        });
    },
    onMsg: function (id, data) {
        if(!this.msgHandler.onMsg(id, data)){
            this.warn(`[MSG-NOT-DEFINED-YET] ${id}`, data);  //fallback
        }
    },
    createLogHandler: function (logName) {
        let self = this;
        return function () {
            /* istanbul ignore else */
            if ((self.logLevel <= logLevels[logName]) && (logName !== 'NONE')) {
                let args = Array.prototype.slice.call(arguments);
                args.unshift(`[${logName}][pg-patcher]`);
                if (self.enableColorfulLogs) {
                    console.log(chalk[logChalk[logName]].apply(null, args));
                } else {
                    console.log.apply(null, args);
                }
            }
        };
    },
    createConsoleInvokers: function () {
        for (let lvl in logLevels) {
            /* istanbul ignore else */
            if (logLevels.hasOwnProperty(lvl)) {
                this[lvl.toLowerCase()] = this.createLogHandler(lvl);
            }
        }
    }
};

module.exports = PgPatchConsole;