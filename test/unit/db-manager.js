'use strict';

const common = require('../../lib/common');
const pgPatchDbManager = require("../../lib/db-manager");
const pg = require('pg');

describe("db-manager", function() {
    let tmp;

    it("creation", function () {
        expect(() => {
            tmp = new pgPatchDbManager();
        }).not.toThrow();
    });

    it("configuration", function () {


        //default
        tmp = new pgPatchDbManager();
        expect(tmp.dbTable).toEqual("pgpatch");
        expect(tmp.dbSchema).toEqual("public");
        expect(tmp.dryRun).toEqual(null);

        //configuration
        tmp = new pgPatchDbManager({
            dbTable: "someschema.sometable",
            dryRun: "LOG_ONLY"
        });
        expect(tmp.dbTable).toEqual("sometable");
        expect(tmp.dbSchema).toEqual("someschema");
        expect(tmp.dryRun).toEqual(common.dryRun.LOG_ONLY);

        //wrong dryRun value
        tmp = new pgPatchDbManager({
            dryRun: "1"
        });
        expect(tmp.dryRun).toEqual(null);
    });

    it(".createClient", function(){
        tmp = new pgPatchDbManager();
        expect(tmp.client).toEqual(null);
        tmp.createClient();
        expect(tmp.client instanceof pg.Client).toEqual(true);

        //string instance
        tmp = new pgPatchDbManager({ client: "dbConnectionString" });
        tmp.createClient();
        expect(tmp.client instanceof pg.Client).toEqual(true);

        //object config
        tmp = new pgPatchDbManager({ client: { port: 1000 } });
        tmp.createClient();
        expect(tmp.client instanceof pg.Client).toEqual(true);

        //pg.Client config
        tmp = new pgPatchDbManager({ client: new pg.Client() });
        tmp.createClient();
        expect(tmp.client instanceof pg.Client).toEqual(true);
    });

    describe(".query", function(){
        beforeEach(function(){
            tmp = new pgPatchDbManager({client: new pg.Client()});
        });

        it("calls client.query", function() {
            spyOn(tmp.client, 'query');

            tmp.query("abc", [1, 2, 3]);

            expect(tmp.client.query.calls.argsFor(0)[0]).toEqual('abc');
            expect(tmp.client.query.calls.argsFor(0)[1]).toEqual([1, 2, 3]);
            expect(tmp.client.query.calls.argsFor(0)[2] instanceof Function).toEqual(true);
        });

        it("promise interface", function(done) {
            //successfull query
            spyOn(tmp.client, 'query').and.callFake(function(query, values, callback){
                callback(null, 1);
            });

            tmp.query().then(function(result){
                expect(result).toEqual(1);
            }).finally(() => {
                //error query
                tmp.client.query.and.callFake(function(query, values, callback){
                    callback("error message", 1);
                });

                tmp.query("aaa").catch((err) => {
                    expect(err).toEqual(`Could not execute query:\naaa\nerror message`);
                }).finally(() => {
                    done();
                });
            });
        });
    });

    it(".getDBPatchTableName", function(){
        tmp = new pgPatchDbManager({
            dbTable: 'aaa'
        });
        expect(tmp.getDBPatchTableName()).toEqual("public.aaa");

        tmp = new pgPatchDbManager({
            dbTable: 'bbb.aaa'
        });
        expect(tmp.getDBPatchTableName()).toEqual("bbb.aaa");
    });

    /*describe(".connect", function() {
        it("promise interface", function (done) {
            tmp = new pgPatchDbManager({client: new pg.Client()});

            //successfull query
            spyOn(tmp.client, 'connect').and.callFake(function (query, values, callback) {
                callback(null, 1);
            });

            tmp.connect().then(function (result) {
                expect(result).toEqual(1);
            }).finally(() => {
                //error query
                tmp.client.connect.and.callFake(function (query, values, callback) {
                    callback("error", 1);
                });

                tmp.connect().then(function (result) {
                    console.info("result",result);
                    expect(result).toEqual(undefined);
                }).catch((err) => {
                    console.info("err",result);
                    expect(err).toEqual("error");
                }).finally(() => {
                    console.log("1111");
                    done();
                });
            });
        });
    });*/
});