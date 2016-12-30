'use strict';

const common = require('../../lib/common');
const pgPatchDbManager = require("../../lib/db-manager");
const q = require('q');
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
        expect(tmp.dryRunMode).toEqual(null);

        //configuration
        tmp = new pgPatchDbManager({
            dbTable: "someschema.sometable",
            dryRun: "LOG_ONLY"
        });
        expect(tmp.dbTable).toEqual("sometable");
        expect(tmp.dbSchema).toEqual("someschema");
        expect(tmp.dryRunMode).toEqual(common.dryRunMode.LOG_ONLY);

        //wrong dryRun value
        tmp = new pgPatchDbManager({
            dryRun: "1"
        });
        expect(tmp.dryRunMode).toEqual(null);
    });

    it(".createClient", function(){
        tmp = new pgPatchDbManager();
        expect(tmp.client).toEqual(null);
        tmp.createClient();
        expect(tmp.client instanceof pg.Client).toEqual(true);
        expect(tmp.ownPgClient).toEqual(true);

        //string instance
        tmp = new pgPatchDbManager({ client: "dbConnectionString" });
        tmp.createClient();
        expect(tmp.client instanceof pg.Client).toEqual(true);
        expect(tmp.ownPgClient).toEqual(true);

        //object config
        tmp = new pgPatchDbManager({ client: { port: 1000 } });
        tmp.createClient();
        expect(tmp.client instanceof pg.Client).toEqual(true);
        expect(tmp.ownPgClient).toEqual(true);

        //pg.Client config
        tmp = new pgPatchDbManager({ client: new pg.Client() });
        tmp.createClient();
        expect(tmp.client instanceof pg.Client).toEqual(true);
        expect(tmp.ownPgClient).toEqual(false);
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

    it(".closeIfNeeded", function(){
        tmp = new pgPatchDbManager();
        tmp.createClient();
        spyOn(tmp.client, 'end');

        tmp.closeIfNeeded();
        expect(tmp.client.end).toHaveBeenCalled();
    });

    it(".tableExists", function(done){
        tmp = new pgPatchDbManager();

        spyOn(tmp, 'query').and.callFake(() => {
            return q({
                rows: [{
                    exists: "dummy"
                }]
            });
        });

        tmp.tableExists('table','schema').then(exists => {
            expect(exists).toEqual("dummy");

            expect(tmp.query).toHaveBeenCalledWith(`SELECT EXISTS (SELECT 1 FROM information_schema.tables
WHERE table_schema = $1
AND table_name = $2);`, ['schema', 'table']);
            done();
        })
    });

    it(".columnExists", function(done){
        tmp = new pgPatchDbManager();

        spyOn(tmp, 'query').and.callFake(() => {
            return q({
                rows: [{
                    exists: "dummy"
                }]
            });
        });

        tmp.columnExists('column','table','schema').then(exists => {
            expect(exists).toEqual("dummy");

            expect(tmp.query).toHaveBeenCalledWith(`SELECT EXISTS (SELECT table_schema, table_name, column_name
FROM information_schema.columns
where table_schema = $1 AND table_name=$2 AND column_name=$3);`, ['schema', 'table', 'column']);
            done();
        })
    });

    it(".createPatchDataTable", function(done){
        tmp = new pgPatchDbManager();

        spyOn(tmp, 'query').and.callFake(() => {
            return q();
        });

        tmp.createPatchDataTable().then(() => {
            expect(tmp.query).toHaveBeenCalledWith(`create table ${tmp.getDBPatchTableName()} (
id serial PRIMARY KEY,
source_version integer,
target_version integer,
comment text, 
patch_time timestamp without time zone default now());`);

            expect(tmp.query).toHaveBeenCalledWith(`insert into ${tmp.getDBPatchTableName()} 
(target_version, comment) 
VALUES 
(0, 'initial pgPatch state')`);

            done();
        })
    });

    it(".connect", function(done){
        let client = new pg.Client();

        tmp = new pgPatchDbManager({
            client: client
        });

        spyOn(tmp, 'createClient').and.returnValue(client);
        spyOn(client, 'connect').and.callFake(cb => {
            cb(null); //success mock
        });

        tmp.connect().then(() => {
            expect(tmp.createClient).toHaveBeenCalled();
        }).then(() => {
            client.connect.and.callFake(cb => {
                cb("error"); //success mock
            });

            tmp.connect().catch((err) => {
                expect(err).toEqual("error");
                done();
            });
        });
    });

    it(".checkPatchDataTable", function(){
        tmp = new pgPatchDbManager();

        spyOn(tmp, 'tableExists').and.returnValue("mockReturn");

        expect(tmp.checkPatchDataTable()).toEqual("mockReturn");
        expect(tmp.tableExists).toHaveBeenCalledWith(tmp.dbTable, tmp.dbSchema);
    });

    it(".getCurrentPatchVersion", function(){
        tmp = new pgPatchDbManager();

        spyOn(tmp, 'query').and.returnValue(q("mockReturn"));

        tmp.getCurrentPatchVersion().then(result => {
            expect().toEqual("mockReturn");
            expect(tmp.query).toHaveBeenCalledWith(`select target_version from ${ymp.getDBPatchTableName()} order by patch_time DESC limit 1`);
        });
    });

    it(".updatePatchHistory", function(){
        tmp = new pgPatchDbManager();

        spyOn(tmp, 'patchQuery').and.returnValue(q("mockReturn"));

        let source = 1;
        let target = 3;

        tmp.updatePatchHistory(source, target).then(result => {
            expect(result).toEqual("mockReturn");
            expect(tmp.patchQuery).toHaveBeenCalledWith(`insert into ${tmp.getDBPatchTableName()}
(source_version, target_version)
values
($1, $2)`, [source, target]);
        });
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

    describe(".patchQuery", function(){
        it("no dryRun", function() {
            tmp = new pgPatchDbManager();

            spyOn(tmp, 'query');

            tmp.patchQuery("abc", [1, 2, 3]);

            expect(tmp.query).toHaveBeenCalledWith("abc", [1, 2, 3]);
        });

        it("dryRun.LOG_ONLY", function() {
            tmp = new pgPatchDbManager({
                dryRun: common.dryRunMode.LOG_ONLY
            });

            spyOn(tmp, 'msg');

            tmp.patchQuery("abc", [1, 2, 3]);

            expect(tmp.msg).toHaveBeenCalledWith("DRY_RUN:LOG_ONLY:QUERY", {
                query: "abc",
                values: [1, 2, 3]
            });
        });
    });
});