'use strict';

let fs = require('fs');
let q = require('q');

module.exports = {
    readFile: function (path) {
        let deferred = q.defer();

        fs.readFile(path, (err, data) => {
            if (err) {
                deferred.reject(err);
            } else {
                deferred.resolve(data);
            }
        });

        return deferred.promise;
    },
    readDir: function(dir){
        let deferred = q.defer();

        fs.readdir(dir, (err, files) => {
            if (err) {
                deferred.reject(err);
            } else {
                deferred.resolve(files);
            }
        });

        return deferred.promise;
    },
    lstat: function(path){
        let deferred = q.defer();

        fs.lstat(path, (err, stats) => {
            if (err) {
                deferred.reject(err);
            } else {
                deferred.resolve(stats);
            }
        });

        return deferred.promise;
    }
};
