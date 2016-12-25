'use strict';

const common = require('../../lib/common');
const pgPatchConsole = require("../../lib/consoleReporter");

describe("consoleReporter", function() {
    it("can be created", function () {
        let tmpConsole;

        expect(() => {
            tmpConsole = new pgPatchConsole();
        }).not.toThrow();

        expect(tmpConsole.logLevel).toEqual(common.logLevels.INFO);
        expect(tmpConsole.enableColorfulLogs).toEqual(true);
    });
});