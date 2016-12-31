'use strict';

const chalk = require('chalk');

const common = require('./common');

const logLevels = common.logLevel;
const logChalk = common.logChalk;

let PgPatchConsole = function(config){
    config = common.determineValue(config, {});

    this.logLevel = common.determineValue(logLevels[config.logLevel], logLevels.INFO);
    this.enableColorfulLogs = common.determineValue(config.enableColorfulLogs, true);

    this.createHandlers();
};

PgPatchConsole.prototype = {
    onMsg: function(id, msg, data){
        let msgType = id.split(":");

        if(msgType[0] === 'LOG'){ //TODO: eventually remove
            let handlerFn = this[msgType[1].toLowerCase()];
            /* istanbul ignore else */
            if(handlerFn){
                this[msgType[1].toLowerCase()](msg);
            }

        }else{ //new way

            data = msg; //temporary alias
            if(id === 'DB_PATCH_TABLE:FOUND'){
                this.info(`db patch table found: ${data}`);
            }else if(msgType[0] === 'PATCH_FILE_SCAN') {
                if (msgType[1] === 'START') {
                    this.info("looking for patch files");
                } else if (msgType[1] === 'END') {
                    this.info(`found ${data.data.length} patch files`);
                }
            }else if(id === 'DIR_SCAN:START'){
                this.log(`scanning ${data}`);
            }else if(id === 'DRY_RUN:LOG_ONLY:QUERY'){
                this.info(`running query:\n${data.query}`);
                /* istanbul ignore else */
                if(data.values){
                    this.info(`with values: ${data.values}`);
                }
                this.info("-------");
            }else if(id === "PROCESS:SUMMARY"){
                this.info(`source version: ${data.sourceVersion}, target version: ${data.targetVersion}`);
            }else if(id === "PROCESS:NOTHING_TO_DO"){
                this.success(`nothing to do`);
            }else if(id === "PROCESS:ROUTE_FOUND"){
                this.log(`patch route found`);
            }else if(id === "PROCESS:TRANSACTION_START"){
                let addon = '';
                if (data.dryRun) {
                    addon = 'DRYRUN ';
                }

                let post = '';
                if (data.transactionMode === common.transactionMode.SINGLE) {
                    post = ' in single transaction';
                }

                this.log(`starting ${addon}${data.action} -> ${data.targetVersion}${post}`);
            }else if(id === 'ERROR'){
                this.error(data);
            }else if(id === 'PATCH_FILE:FOUND'){
                this.debug(`found patch file: ${data}`);
            }else if(id === 'PG_TABLE:CREATING'){
                this.info(`creating db patch table`);
            }else if(id === 'PG_TABLE:OLD_VERSION_FOUND'){
                this.info(`old DB structure found - migrating.`);
            }else if(msgType[0] === 'PROCESS_END'){
                let addon = '';
                if(data.dryRun){
                    addon = 'DRYRUN ';
                }

                if(msgType[1] === 'ERROR'){
                    this.error(`Patch process ${addon}finished with an error`);
                }else /* istanbul ignore else */ if(msgType[1] === 'SUCCESS'){
                    this.success(`Patch process ${addon}finished successfully`);
                }
            }else{ //fallback
                this.warn(`[NOT-DEFINED-YET] ${id}`, data);
            }
        }
    },
    createLogHandler: function(logName){
        let self = this;
        return function() {
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
    createHandlers: function(){
        for(let lvl in logLevels){
            /* istanbul ignore else */
            if(logLevels.hasOwnProperty(lvl)){
                this[lvl.toLowerCase()] = this.createLogHandler(lvl);
            }
        }
    }
};

module.exports = PgPatchConsole;