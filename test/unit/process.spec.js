'use strict';

const common = require('../../lib/common');
const pgPatchProcess = require("../../lib/process");

describe("process", function() {
    it("can be created", function () {
        let tmp;

        expect(() => {
            tmp = new pgPatchProcess();
        }).not.toThrow();

        //add default properties check
    });
});