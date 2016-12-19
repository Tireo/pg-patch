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
    client: ownClient,
    targetVersion: 0
}).run();