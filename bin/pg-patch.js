#!/usr/bin/env node
'use strict';

let argv = require('yargs').argv;

let pgPatch = require('../lib/pg-patch');

pgPatch.run(argv);



