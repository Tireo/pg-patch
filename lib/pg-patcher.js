'use strict';

const fsp = require('./fs-promise');
const common = require('./common');
let PgPatchProcess = require('./process');

function PgPatcher(config) {
    this.masterConfig = config;
}

let createStepFn = function (type) {
    return function (config) {
        config = common.determineValue(config, {});
        config.targetVersion = type;
        return this.run(config);
    };
};

PgPatcher.prototype = {
    run: function (config) {
        let configFileData = {};

        return fsp.readFile(`${process.cwd()}/.pgpatchrc.json`)
            .then(data => {
                configFileData = JSON.parse(data);
            })
            .catch(() => {
                //do nothing
            })
            .then(() => {
                let runConfig = Object.assign({}, configFileData, this.masterConfig, config);
                return (new PgPatchProcess(runConfig)).run();
            });
    },
    stepUp: createStepFn('next'),
    stepDown: createStepFn('previous')
};

module.exports = PgPatcher;