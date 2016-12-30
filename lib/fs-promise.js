'use strict';

let fs = require('fs');
let q = require('q');

let createPromiseWrapper = targetFnName => {
    return function (path) {
        let deferred = q.defer();

        fs[targetFnName](path, (err, data) => {
            if (err) {
                deferred.reject(err);
            } else {
                deferred.resolve(data);
            }
        });

        return deferred.promise;
    }
};

module.exports = {
    readFile: createPromiseWrapper('readFile'),
    readDir: createPromiseWrapper('readdir'),
    lstat: createPromiseWrapper('lstat')
};
