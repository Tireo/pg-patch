'use strict';

const common = require('../../lib/common');
const pgPatchDbManager = require("../../lib/db-manager");

describe("consoleReporter", function() {
    it("can be created", function () {
        let tmp;

        expect(() => {
            tmp = new pgPatchDbManager();
        }).not.toThrow();

        //add default properties check
    });
});