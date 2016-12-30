'use strict';

const PgPatcher = require('./pg-patcher');
const common = require('./common');

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