'use strict';

let fs = require("fs");
let q = require("q");

let common = require("../../lib/common");
let fsp = require("../../lib/fs-promise");

describe("fs-promise", function() {
    let tmp, patcher;

    ['readFile', 'readDir', 'lstat'].forEach(key => {

        let fsMapping = {
            'readDir': 'readdir'
        };

        it(`.${key}`, function (done) {
            let fsKey = fsMapping[key] || key;

            spyOn(fs, fsKey).and.callFake((path, cb) => {
                cb(null, "data");
            });

            fsp[key]("any").then(data => {
                expect(data).toEqual("data");

                fs[fsKey].and.callFake((path, cb) => {
                    cb("err", null);
                });

                fsp[key]("any").catch(err => {
                    expect(err).toEqual("err");
                    done();
                });
            });
        });
    });




});