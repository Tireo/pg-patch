'use strict';

const PgPatcher = require('./pg-patcher');
let basicReporter = require('./reporters/basic-reporter');
let consoleReporter = require('./reporters/console-reporter');

let api = {
    create: function(config){
        return new PgPatcher(config);
    }
};

['run','stepUp', 'stepDown'].forEach(key => { //setting aliases to pgPatcher
    api[key] = function(config){
        return this.create()[key](config);
    };
});

//add reporters
api.reporters = {
    basic: basicReporter,
    console: consoleReporter
};

module.exports = api;