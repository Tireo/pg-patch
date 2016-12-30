'use strict';

const common = require('../../lib/common');
const pgPatchProcess = require("../../lib/process");

describe("process", function() {
    let tmp;

    it("creation", function () {
        expect(() => {
            new pgPatchProcess();
        }).not.toThrow();
    });
});