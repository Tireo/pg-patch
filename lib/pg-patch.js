'use strict';

let PgPatcher = require('./pg-patcher');

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

module.exports = api;