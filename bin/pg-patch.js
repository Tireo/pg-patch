#!/usr/bin/env node
'use strict';

let argv = require('yargs').argv;

let pgPatch = require('../lib/pg-patch');

if (argv.stepUp) {
    pgPatch.stepUp(argv);
} else if (argv.stepDown) {
    pgPatch.stepDown(argv);
} else {
    pgPatch.run(argv);
}



