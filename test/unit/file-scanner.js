'use strict';

const common = require('../../lib/common');
const pgPatchFileScanner = require("../../lib/file-scanner");

describe("file-scanner", function() {
    let tmp;

    it("creation", function () {
        expect(() => {
            tmp = new pgPatchFileScanner();
        }).not.toThrow();
    });

    it("configuration", function () {
        //default configuration
        tmp = new pgPatchFileScanner();

        expect(tmp.actionUpdate).toEqual('up');
        expect(tmp.actionRollback).toEqual('rb');
        expect(tmp.patchFileTemplate).toEqual('^patch-$VERSION-$ACTION(?:-$DESCRIPTION)?\\.sql$');
        expect(tmp.patchDir).toEqual('pg-patch');

        //custom configuration
        tmp = new pgPatchFileScanner({
            actionUpdate: 'forward',
            actionRollback: 'back',
            patchFileTemplate: 'aaa',
            patchDir: 'bbb'
        });

        expect(tmp.actionUpdate).toEqual('forward');
        expect(tmp.actionRollback).toEqual('back');
        expect(tmp.patchFileTemplate).toEqual('aaa');
        expect(tmp.patchDir).toEqual('bbb');
    });
});