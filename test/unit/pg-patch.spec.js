'use strict';

let common = require("../../lib/common");
let pgPatch = require("../../lib/pg-patch");
let pgPatcher = require("../../lib/pg-patcher");

describe("pg-patch", function() {

    let tmp, patcher;

    beforeEach(() => {
        ['run','stepUp', 'stepDown'].forEach(key => {
            spyOn(pgPatcher.prototype, key);
        });
    });

    it("create", function () {
        expect(pgPatch.create() instanceof pgPatcher).toEqual(true);
    });

    it(".run .stepUp .stepDow", function () {
        ['run','stepUp', 'stepDown'].forEach(key => {
            let tmpConfig = { configForKey: key };
            pgPatch[key](tmpConfig);
            expect(pgPatcher.prototype[key]).toHaveBeenCalledWith(tmpConfig);
        });
    });

});