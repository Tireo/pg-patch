'use strict';

let PgPatchProcess = require('./process');

function PgPatcher(config) {
    this.masterConfig = config;
}

PgPatcher.prototype = {
    run: function (config) {
        let runConfig = Object.assign({}, this.masterConfig, config);
        return (new PgPatchProcess(runConfig)).run();
    },
    stepUp: function(config){
        config.targetVersion = 'next';
        let runConfig = Object.assign({}, this.masterConfig, config);
        return (new PgPatchProcess(runConfig)).run();
    },
    stepDown: function(config){
        config.targetVersion = 'previous';
        let runConfig = Object.assign({}, this.masterConfig, config);
        return (new PgPatchProcess(runConfig)).run();
    }
};

let api = {
    create: function(config){
        return new PgPatcher(config);
    }
};

['run','stepUp', 'stepDown'].forEach(key => {
    api[key] = function(config){
        return this.create()[key](config);
    };
});

module.exports = api;