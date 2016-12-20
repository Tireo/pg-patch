#!/usr/bin/env node
'use strict';

let argv = require('yargs').argv;
let config = {};
let pgPatch = require('../lib/pg-patch');

[
    'logLevel',
    'enableColorfulLogs',
    'client',
    'dbTable',
    'dbSchema',
    'dryRun',
    'actionUpdate',
    'actionRollback',
    'patchFileTemplate',
    'patchDir',
    'targetVersion',
    'sourceVersion',
    'transactionMode'
].forEach(k => {
    config[k] = argv[k];
});

pgPatch.run(config);



