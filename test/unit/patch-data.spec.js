'use strict';

let common = require("../../lib/common");
let pgPatchData = require("../../lib/patch-data");

describe("patch-data", function() {
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

    it(".getMaxPatchVersion", () => {
        tmp = new pgPatchData();

        //mock
        tmp.routeData = {
            1: {},
            2: {}
        };
        expect(tmp.getMaxPatchVersion()).toEqual(2);


        tmp.routeData[4] = {};
        expect(tmp.getMaxPatchVersion()).toEqual(2); //does not allow for missed indices

        tmp.routeData[3] = {};
        expect(tmp.getMaxPatchVersion()).toEqual(4);

    });

});