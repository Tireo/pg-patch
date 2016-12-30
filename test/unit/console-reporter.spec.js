'use strict';

const common = require('../../lib/common');
const pgPatchConsole = require("../../lib/console-reporter");

describe("consoleReporter", function() {
    it("creation", function () {
        let tmpConsole;

        expect(() => {
            tmpConsole = new pgPatchConsole();
        }).not.toThrow();
    });

    it("configuration", function () {
        spyOn(pgPatchConsole.prototype, 'createHandlers').and.callThrough();

        let tmpConsole = new pgPatchConsole();

        //creates handlers during creation
        expect(pgPatchConsole.prototype.createHandlers).toHaveBeenCalled();

        //default
        expect(tmpConsole.logLevel).toEqual(common.logLevel.INFO);
        expect(tmpConsole.enableColorfulLogs).toEqual(true);

        //config based
        tmpConsole = new pgPatchConsole({
            logLevel: 'LOG',
            enableColorfulLogs: false
        });
        expect(tmpConsole.logLevel).toEqual(common.logLevel.LOG);
        expect(tmpConsole.enableColorfulLogs).toEqual(false);

        //wrong values go to default
        tmpConsole = new pgPatchConsole({
            logLevel: 'XYZ'
        });
        expect(tmpConsole.logLevel).toEqual(common.logLevel.INFO);
    });

    it("handlers creation", function () {
        let mock = function(){};
        mock.prototype = pgPatchConsole.prototype;

        let mockInstance = new mock();

        for(let lvl in common.logLevel){
            expect(mockInstance[lvl.toLowerCase()]).not.toBeDefined();
        }

        mockInstance.createHandlers();

        for(let lvl in common.logLevel){
            expect(mockInstance[lvl.toLowerCase()]).toBeDefined();
        }
    });

    describe("handlers", function () {
        let tmpConsole;

        beforeEach(function(){
            tmpConsole = new pgPatchConsole({
                logLevel: 'DEBUG',
                enableColorfulLogs: false
            });

            spyOn(console, 'log'); //.and.callThrough();

            for(let lvl in common.logLevel){
                spyOn(tmpConsole, lvl.toLowerCase()).and.callThrough();
            }
        });

        it("onMsg", function(){
            for(let lvl in common.logLevel){
                if(lvl !== 'NONE'){
                    tmpConsole.onMsg(`LOG:${lvl}`, lvl);
                    expect(tmpConsole[lvl.toLowerCase()]).toHaveBeenCalled();
                    expect(console.log).toHaveBeenCalledWith(`[${lvl}][pg-patcher]`, lvl);
                }
            }
        });
    });
});