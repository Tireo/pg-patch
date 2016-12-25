'use strict';

const common = require('../../lib/common');
const pgPatchDbManager = require("../../lib/db-manager");
const pg = require('pg');

describe("db-manager", function() {
    it("creation", function () {
        let tmp;

        expect(() => {
            tmp = new pgPatchDbManager();
        }).not.toThrow();
    });

    it("configuration", function () {
        spyOn(pgPatchDbManager.prototype, 'createClient').and.callThrough();

        let tmp = new pgPatchDbManager();

        //default
        expect(tmp.client instanceof pg.Client).toEqual(true);
        expect(tmp.dbTable).toEqual("pgpatch");
        expect(tmp.dbSchema).toEqual("public");
        expect(tmp.dryRun).toEqual(null);

        //configuration
        tmp = new pgPatchDbManager({
            dbTable: "sometable",
            dbSchema: "someschema",
            dryRun: "LOG_ONLY"
        });
        expect(tmp.client instanceof pg.Client).toEqual(true);
        expect(tmp.dbTable).toEqual("sometable");
        expect(tmp.dbSchema).toEqual("someschema");
        expect(tmp.dryRun).toEqual(common.dryRun.LOG_ONLY);

        //dbTable containing schema && wrong dryRun value
        tmp = new pgPatchDbManager({
            dbTable: "someschema.sometable",
            dryRun: "1"
        });
        expect(tmp.client instanceof pg.Client).toEqual(true);
        expect(tmp.dbTable).toEqual("sometable");
        expect(tmp.dbSchema).toEqual("someschema");
        expect(tmp.dryRun).toEqual(null);
    });
});