'use strict';

const common = require('../../lib/common');
const pgPatchFileScanner = require("../../lib/file-scanner");

describe("file-scanner", function() {
    it("can be created", function () {
        let tmp;

        expect(() => {
            tmp = new pgPatchFileScanner();
        }).not.toThrow();

        //add default properties check
    });
});