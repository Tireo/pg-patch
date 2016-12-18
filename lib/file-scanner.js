'use strict';

let fs = require('fs');
let q = require('q');

const actions = require('./const/actions');

let FileScanner = function(config){
    config = config || {};

    this.config = {};
    this.config.actionUpdate = config.actionUpdate || 'up';
    this.config.actionRollback = config.actionRollback || 'rb';
    this.config.patchFileTemplate = config.patchFileTemplate || '^(?:{timestamp}-)?patch-{version}-{action}(?:-{description})?\\.sql$';
    this.config.patchDir = config.patchDir || 'pg-patch';

    this.regex = this.createPatchFileRegexes();
};

FileScanner.prototype = {
    scanDirectoryForPatchFiles: function (dirPath, fileData) {
        let deferred = q.defer(),
            self = this;

        dirPath = dirPath || [];
        fileData = fileData || {
                patchFiles: {},
                foundPatchFiles: 0,
                maxPatchVersion: null
            };

        let currentSubDir = dirPath.join('/');
        let currentFullDir = `${this.config.patchDir ? this.config.patchDir : '.'}${currentSubDir ? '/' + currentSubDir : ''}`;

        this.process.console.log(`scanning ${currentFullDir}`);

        fs.readdir(currentFullDir, (err, files) => {
            let dirPromises = [];
            if (err) {
                if (err.code === 'ENOENT') {
                    deferred.reject(err); //change to creating this dir eventually
                }else{
                    deferred.reject(err);
                }
            } else {
                files.forEach(function (filename) {
                    let lstat = fs.lstatSync(`${currentFullDir}/${filename}`);
                    if (lstat.isFile() && self.isPatchFile(filename)) {
                        let version = self.getPatchFileVersion(filename);
                        let action = self.getPatchFileAction(filename);
                        if (action && version) {
                            fileData.patchFiles[version] = fileData.patchFiles[version] || {};
                            fileData.patchFiles[version][action] = fileData.patchFiles[version][action] || [];
                            fileData.patchFiles[version][action].push({
                                file: filename,
                                fullPath: `${currentFullDir}/${filename}`,
                                description: self.getPatchFileDescription(filename)
                            });
                            fileData.maxPatchVersion = Math.max(fileData.maxPatchVersion, version);
                            fileData.foundPatchFiles++;

                            self.process.console.debug("found patch file:", filename);
                        }
                    } else if (lstat.isDirectory()) {
                        dirPromises.push(self.scanDirectoryForPatchFiles(dirPath.concat([filename]), fileData));
                    }
                });

                q.all(dirPromises).then(function () {
                    deferred.resolve(fileData);
                }).catch(function (err) {
                    deferred.reject(err);
                });
            }
        });

        return deferred.promise;
    },
    createPatchFileRegexes: function () {
        let fileTestExpr = this.config.patchFileTemplate
            .replace(/\{timestamp\}/g, '(\\d+)')
            .replace(/\{version\}/g, '(\\d+)')
            .replace(/\{action\}/g, `(${this.config.actionUpdate}|${this.config.actionRollback})`)
            .replace(/\{description\}/g, `([0-9a-zA-Z\-\_]+)`);

        let versionGetExpr = this.config.patchFileTemplate
            .replace(/\{timestamp\}/g, '(?:\\d+)')
            .replace(/\{version\}/g, '(\\d+)')
            .replace(/\{action\}/g, `(?:${this.config.actionUpdate}|${this.config.actionRollback})`)
            .replace(/\{description\}/g, `(?:[0-9a-zA-Z\-\_]+)`);

        let actionGetExpr = this.config.patchFileTemplate
            .replace(/\{timestamp\}/g, '(?:\\d+)')
            .replace(/\{version\}/g, '(?:\\d+)')
            .replace(/\{action\}/g, `(${this.config.actionUpdate}|${this.config.actionRollback})`)
            .replace(/\{description\}/g, `(?:[0-9a-zA-Z\-\_]+)`);

        let descriptionGetExpr = this.config.patchFileTemplate
            .replace(/\{timestamp\}/g, '(?:\\d+)')
            .replace(/\{version\}/g, '(?:\\d+)')
            .replace(/\{action\}/g, `(?:${this.config.actionUpdate}|${this.config.actionRollback})`)
            .replace(/\{description\}/g, `([0-9a-zA-Z\-\_]+)`);

        let timestampGetExpr = this.config.patchFileTemplate
            .replace(/\{timestamp\}/g, '(\\d+)')
            .replace(/\{version\}/g, '(?:\\d+)')
            .replace(/\{action\}/g, `(?:${this.config.actionUpdate}|${this.config.actionRollback})`)
            .replace(/\{description\}/g, `(?:[0-9a-zA-Z\-\_]+)`);

        return {
            timestamp: function () {
                return new RegExp(timestampGetExpr, 'ig');
            },
            file: function () {
                return new RegExp(fileTestExpr, 'ig');
            },
            version: function () {
                return new RegExp(versionGetExpr, 'ig');
            },
            action: function () {
                return new RegExp(actionGetExpr, 'ig');
            },
            description: function () {
                return new RegExp(descriptionGetExpr, 'ig');
            }
        };
    },
    getPatchFileAction: function (filename) {
        let match = this.regex.action().exec(filename)[1];
        if (match === this.config.actionUpdate) {
            return actions.UPDATE;
        }
        if (match === this.config.actionRollback) {
            return actions.ROLLBACK;
        }
        return null;
    },
    getPatchFileVersion: function (filename) {
        let match = this.regex.version().exec(filename)[1];
        if (match !== null) {
            return parseInt(match);
        }
        return match;
    },
    getPatchFileDescription: function (filename) {
        return this.regex.description().exec(filename)[1];
    },
    isPatchFile: function (filename) {
        return this.regex.file().test(filename);
    },
    renameFile: function(oldPath, newPath){ //should append timestamp ??
        let deferred = q.defer();

        fs.rename(oldPath, newPath, function (err, data) {
            if (err) {
                deferred.reject(err);
            } else {
                deferred.resolve(data);
            }
        });

        return deferred.promise;
    },
    readFile: function (path) {
        let deferred = q.defer();

        fs.readFile(path, function (err, data) {
            if (err) {
                deferred.reject(err);
            } else {
                deferred.resolve(data);
            }
        });

        return deferred.promise;
    },
};

module.exports = FileScanner;