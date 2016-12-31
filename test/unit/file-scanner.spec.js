'use strict';

const common = require('../../lib/common');
const pgPatchFileScanner = require("../../lib/file-scanner");
const patchData =  require('../../lib/patch-data');
const fsp =  require('../../lib/fs-promise');
const q =  require('q');

describe("file-scanner", function() {
    let tmp;

    it("creation", () => {
        expect(() => {
            tmp = new pgPatchFileScanner();
        }).not.toThrow();
    });

    it("configuration", () => {
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

    it(".createPatchFileRegexGroup", () => {
        tmp = new pgPatchFileScanner();

        //capturing test
        expect(tmp.createPatchFileRegexGroup('version', true)).toEqual('(\\d+)');
        expect(tmp.createPatchFileRegexGroup('version', false)).toEqual('(?:\\d+)');

        //other groups test
        expect(tmp.createPatchFileRegexGroup('action', true)).toEqual(`(${tmp.actionUpdate}|${tmp.actionRollback})`);
        expect(tmp.createPatchFileRegexGroup('source', true)).toEqual('(\\d+)');
        expect(tmp.createPatchFileRegexGroup('target', true)).toEqual('(\\d+)');
        expect(tmp.createPatchFileRegexGroup('description', true)).toEqual('([0-9a-zA-Z\-\_]+)');
    });

    it(".createEmptyPatchDataObject", () => {
        expect(pgPatchFileScanner.prototype.createEmptyPatchDataObject()).toEqual(new patchData);
    });

    it(".validatePatchFileTemplate", (done) => {
        tmp = new pgPatchFileScanner({
            patchFileTemplate: "^$SOURCE-$ACTION-$TARGET\\.sql$",
        });
        tmp.validatePatchFileTemplate().catch(err => {
            expect(err).toBeDefined();
        }).then(() => {
            tmp = new pgPatchFileScanner({
                patchFileTemplate: "^$ACTION-$DESCRIPTION\\.sql$",
            });
            return tmp.validatePatchFileTemplate().catch(err => {
                expect(err).toBeDefined();
                done();
            });
        });
    });

    it(".getPatchFileProperties", (done) => {
        tmp = new pgPatchFileScanner(); //check default one

        tmp.validatePatchFileTemplate().then((mode) => {
            expect(mode).toEqual(common.patchFileTemplateMode.AV);
            expect(tmp.getPatchFileProperties("patch-1-up.sql")).toEqual({
                action: common.action.UPDATE,
                version: 1,
                description: null
            });
            expect(tmp.getPatchFileProperties("patch-2-rb.sql")).toEqual({
                action: common.action.ROLLBACK,
                version: 2,
                description: null
            });
            expect(tmp.getPatchFileProperties("patch-a-b.sql")).toEqual({
                action: null,
                version: null,
                description: null
            });
        }).then(() => {
            tmp = new pgPatchFileScanner({
                patchFileTemplate: "^$DESCRIPTION-$SOURCE-$TARGET\\.sql$",
            });
            return tmp.validatePatchFileTemplate().then((mode) => {
                expect(mode).toEqual(common.patchFileTemplateMode.ST);
                expect(tmp.getPatchFileProperties("someTxt-2-1.sql")).toEqual({
                    action: common.action.ROLLBACK,
                    version: 2,
                    description: "someTxt"
                });
                expect(tmp.getPatchFileProperties("aaa-2-3.sql")).toEqual({
                    action: common.action.UPDATE,
                    version: 3,
                    description: "aaa"
                });
                expect(tmp.getPatchFileProperties("aaa-2-4.sql")).toEqual({ //invalid - step cannot be > 1
                    action: null,
                    version: null,
                    description: "aaa"
                });
            });
        }).then(() => {
            tmp = new pgPatchFileScanner({
                patchFileTemplate: "^$DESCRIPTION-$SOURCE-$TARGET$", //intentional error
            });
            return tmp.validatePatchFileTemplate().then((mode) => {
                expect(mode).toEqual(common.patchFileTemplateMode.ST);
                expect(tmp.getPatchFileProperties("someTxt-2-1.sql")).toEqual({
                    action: null,
                    version: null,
                    description: null
                });
                done();
                //return;
            });
        }).catch(err => {
            console.info(err);
            done();
        });
    });

    describe(".scanDirectoryForPatchFiles", () => {
        it("uses proper root directory", function(){
            spyOn(fsp, 'readDir').and.returnValue(q([]));

            (new pgPatchFileScanner()).scanDirectoryForPatchFiles();
            expect(fsp.readDir.calls.mostRecent().args).toEqual(['pg-patch']);

            (new pgPatchFileScanner({ patchDir: 'aaaa' })).scanDirectoryForPatchFiles();
            expect(fsp.readDir.calls.mostRecent().args).toEqual(['aaaa']);

        });
    });
});