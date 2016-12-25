'use strict';

const chalk = require('chalk');

const common = require('./common');

const logLevels = common.logLevels;
const logChalk = common.logChalk;

let PgPatchConsole = function(config){
    config = config || {};

    this.logLevel = common.determineValue(logLevels[config.logLevel], logLevels.INFO);
    this.enableColorfulLogs = common.determineValue(config.enableColorfulLogs, true);

    this.createHandlers();
};

PgPatchConsole.prototype = {
    onMsg: function(id, msg, data){
        let msgType = id.split(":");
        if(msgType[0] === 'LOG'){
            this[msgType[1].toLowerCase()](msg);
        }
    },
    createLogHandler: function(logName){
        let self = this;
        return function() {
            if (self.logLevel <= logLevels[logName]) {
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
            if(logLevels.hasOwnProperty(lvl)){
                this[lvl.toLowerCase()] = this.createLogHandler(lvl);
            }
        }
    },

    //TODO: refactor into different solution?
    attachTo: function(){
        Array.prototype.slice.call(arguments).forEach(obj => {
            obj.console = this;
        });
    }
};

module.exports = PgPatchConsole;