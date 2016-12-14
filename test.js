var pg = require('pg');
var pgPatcher = require("./lib/pg-patch.js");

var client = new pg.Client({
    user: 'rage',
    database: 'test',
    password: 'test',
    host: 'localhost',
    port: 5432
});

new pgPatcher(client, {
    /*dbSchema: 'test',
    dbTable: 'aaa'*/
});
