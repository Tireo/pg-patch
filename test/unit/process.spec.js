'use strict';

const common = require('../../lib/common');
const pgPatchProcess = require("../../lib/process");
const dbManager = require("../../lib/db-manager");

const pg = require('pg');
const q = require('q');

describe("process", () => {
    let tmp;

    beforeEach(() => {
        spyOn(pg.Client.prototype, "connect").and.callFake((cb) => {
            cb(null);
        });
        spyOn(pg.Client.prototype, "query").and.callFake((query, values, cb) => {
            cb(null, []);
        });
        spyOn(dbManager.prototype, "checkPatchDataTable").and.returnValue(q(true));
        spyOn(dbManager.prototype, "migrateIfNeeded").and.returnValue(q());
        spyOn(dbManager.prototype, "getCurrentPatchVersion").and.returnValue(q(0));
    });

    it("creation", () => {
        expect(() => {
            new pgPatchProcess();
        }).not.toThrow();
    });

    it("dummy dryRun=LOG_ONLY", (done) => {
        let config = require('../config/.pgpatchrc');
        config.dryRun = 'LOG_ONLY';
        config.logLevel = 'NONE';

        tmp = new pgPatchProcess(config);
        tmp.run().catch((err) => {
            expect("").toEqual(err); //force fail
        }).finally(() => {
            done();
        });
    });

    it("dummy dryRun=LOG_ONLY + full log", (done) => {
        let config = require('../config/.pgpatchrc');
        config.dryRun = 'LOG_ONLY';
        config.logLevel = 'DEBUG';

        spyOn(console, 'log'); //intentionally silent console

        tmp = new pgPatchProcess(config);
        tmp.run().catch((err) => {
            expect("").toEqual(err); //force fail
        }).finally(() => {
            done();
        });
    });
});