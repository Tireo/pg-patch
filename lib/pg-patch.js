'use strict';

let PgPatchProcess = require('./process');

function PgPatcher(config) {
    this.masterConfig = config;
}

let createStepFn = function(type){
    return function(config){
        config = config || {};
        config.targetVersion = type;
        this.run(config);
    };
};

PgPatcher.prototype = {
    run: function (config) {
        let runConfig = Object.assign({}, this.masterConfig, config);
        return (new PgPatchProcess(runConfig)).run();
    },
    stepUp: createStepFn('next'),
    stepDown: createStepFn('previous')
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