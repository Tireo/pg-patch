'use strict';

const PgPatcher = require('./pg-patcher');

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
    basic: require('./reporters/basic-reporter'),
    console: require('./reporters/console-reporter')
};

module.exports = api;