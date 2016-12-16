var pg = require('pg');
var pgPatcher = require("./lib/pg-patch.js");

var client = new pg.Client({
    user: 'test',
    database: 'test',
    password: 'test',
    host: 'localhost',
    port: 5432
});

new pgPatcher(client, {
    logLevel: 'DEBUG',
    //targetVersion: 0
    //targetVersion: 11
});
