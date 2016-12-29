'use strict';

let common = require("../../lib/common");
let pgPatchData = require("../../lib/patch-data");

describe("patchData", function() {
    let tmp;

    it("creation", function () {
        expect(() => {
            tmp = new pgPatchData();
        }).not.toThrow();
    });

    it(".addData && .getData", function () {
        tmp = new pgPatchData();

        expect(tmp.getData()).toEqual([]);
        tmp.addData("aaa");
        expect(tmp.getData()).toEqual(["aaa"]);
    });

});