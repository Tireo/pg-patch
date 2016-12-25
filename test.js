'use strict';

let pg = require('pg');
let pgPatcher = require("./lib/pg-patch.js");

let ownClient = {
    user: 'test',
    database: 'test',
    password: 'test',
    host: 'localhost',
    port: 5432
};

let patcher = pgPatcher.create({
    //patchFileTemplate: '^$SOURCE-$TARGET\\.sql$',
    logLevel: 'LOG',
    sourceVersion: 1,
    targetVersion: 0,
    //transactionMode: 'SINGLE',
    client: "postgres://test:test@localhost:5432/test"
}).run();