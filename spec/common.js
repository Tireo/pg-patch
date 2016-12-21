'use strict';

let common = require("../lib/common");

describe("common.determineValue", function() {
    it("returns first defined value", function() {
        var obj = {};
        
        expect(common.determineValue(undefined, true)).toEqual(true);
        expect(common.determineValue(undefined, obj.a, 1)).toEqual(1);
    });

    it("null counts as defined value", function() {
        expect(common.determineValue(undefined, null, 1)).toEqual(null);
    });
});