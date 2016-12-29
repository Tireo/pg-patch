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
});