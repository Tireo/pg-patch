'use strict';

let pg = require('pg');
let pgPatcher = require("./lib/pg-patch.js");

let client = new pg.Client({
    user: 'test',
    database: 'test',
    password: 'test',
    host: 'localhost',
    port: 5432
});

/**/

let ownClient = {
    user: 'test',
    database: 'test',
    password: 'test',
    host: 'localhost',
    port: 5432
};

let patcher = pgPatcher.create({
    client: ownClient,
    targetVersion: 10
}).run();

//patcher.stepDown();

/*pgPatcher
    .create({
        client: ownClient,
        logLevel: 'DEBUG'
    })
    .run()
    .then(function () {
        pgPatcher.run({
            targetVersion: 0
        });
        //client.end();
    });*/
