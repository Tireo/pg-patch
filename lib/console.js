'use strict';

let chalk = require('chalk');

const logLevels = require('./common').logLevels;

const logChalk = {
    DEBUG: 'gray',
    LOG: 'reset',
    INFO: 'blue',
    WARN: 'yellow',
    SUCCESS: 'green',
    ERROR: 'red'
};

let PgPatchConsole = function(config){
    config = config || {};

    this.logLevel = logLevels[config.logLevel] || logLevels.INFO;
    this.enableColorLogs = config.enableColors === undefined ? true : config.enableColors;

    this.createHandlers();
};

PgPatchConsole.prototype = {
    createLogHandler: function(logName){
        let self = this;
        return function() {
            if (self.logLevel <= logLevels[logName]) {
                let args = Array.prototype.slice.call(arguments);
                args.unshift(`[${logName}][pg-patcher]`);
                if (self.enableColorLogs) {
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
    attachTo: function(){
        Array.prototype.slice.call(arguments).forEach(obj => {
            obj.console = this;
        });
    }
};

module.exports = PgPatchConsole;