'use strict';

let common = require("../../lib/common");

describe("common", function() {

    it(".determineAction", function() {
        let base = 3;

        expect(common.determineAction(base, base)).toEqual(common.action.INVALID);
        expect(common.determineAction(base, base+1)).toEqual(common.action.UPDATE);
        expect(common.determineAction(base+1, base)).toEqual(common.action.ROLLBACK);
    });

    it(".generateSequence", function() {
        expect(common.generateSequence(1, 3)).toEqual([1,2,3]);
        expect(common.generateSequence(4, 0)).toEqual([4,3,2,1,0]);
    });

    it(".generateVersionSequence", function() {
        expect(common.generateVersionPatchSequence(1, 3)).toEqual([2,3]); //UPDATE needs 2-up and 3-up actions
        expect(common.generateVersionPatchSequence(4, 0)).toEqual([4,3,2,1]); //ROLLBACK needs 4-rb, 3-rb, 2-rb, 1-rb actions
    });

    it(".msgHandler", function() {
        let mock = {
            process: {
                msg: jasmine.createSpy()
            }
        };

        mock.msg = common.msgHandler;

        mock.msg("TYPE", { mockData: true });

        expect(mock.process.msg).toHaveBeenCalledWith("TYPE", { mockData: true });
    });

    describe(".determineValue", function(){
        it("returns first defined value", function() {
            let obj = {};

            expect(common.determineValue(undefined, true)).toEqual(true);
            expect(common.determineValue(undefined, obj.a, 1)).toEqual(1);
        });

        it("null counts as defined value", function() {
            expect(common.determineValue(undefined, null, 1)).toEqual(null);
        });
    });

});