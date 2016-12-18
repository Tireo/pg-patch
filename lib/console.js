'use strict';

let chalk = require('chalk');

let logLvlIdx = 1;
const logLevels = {
    DEBUG: logLvlIdx++,
    LOG: logLvlIdx++,
    INFO: logLvlIdx++,
    WARN: logLvlIdx++,
    SUCCESS: logLvlIdx++,
    ERROR: logLvlIdx++,
    NONE: logLvlIdx++,
};

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
    createHandlers: function(){
        for(let k in logLevels) {
            this[k.toLowerCase()] = function () {
                if (this.logLevel <= logLevels[k]) {
                    let args = Array.prototype.slice.call(arguments);
                    args.unshift(`[${k}][pg-patcher]`);
                    if (this.enableColorLogs) {
                        console.log(chalk[logChalk[k]].apply(null, args));
                    } else {
                        console.log.apply(null, args);
                    }
                }
            };
        }
    },
    attachTo: function(){
        Array.prototype.slice.call(arguments).forEach(obj => {
            obj.console = this;
        });
    }
};

module.exports = PgPatchConsole;