'use strict';

let fs = require('fs');
let q = require('q');

const common = require('./common');
const actions = common.actions;
const patchFileTemplateMode = common.patchFileTemplateMode;

let FileScanner = function(config){
    config = config || {};

    this.config = {};
    this.config.actionUpdate = config.actionUpdate || 'up';
    this.config.actionRollback = config.actionRollback || 'rb';
    this.config.patchFileTemplate = config.patchFileTemplate || '^patch-$VERSION-$ACTION(?:-$DESCRIPTION)?\\.sql$';
    this.config.patchDir = config.patchDir || 'pg-patch';
};

FileScanner.prototype = {
    msg: function(){
        if(this.process){
            this.process.msg.apply(this.process, arguments);
        }
    },
    scanDirectoryForPatchFiles: function (dirPath, fileData) {
        let deferred = q.defer();

        dirPath = dirPath || [];
        fileData = fileData || {
                patchFiles: {},
                foundPatchFiles: 0,
                maxPatchVersion: null
            };

        let currentSubDir = dirPath.join('/');
        let currentFullDir = `${this.config.patchDir ? this.config.patchDir : '.'}${currentSubDir ? '/' + currentSubDir : ''}`;

        this.msg('LOG:LOG', `scanning ${currentFullDir}`);

        fs.readdir(currentFullDir, (err, files) => {
            let dirPromises = [];
            if (err) {
                if (err.code === 'ENOENT') {
                    deferred.reject(err); //change to creating this dir eventually
                }else{
                    deferred.reject(err);
                }
            } else {
                files.forEach(filename => {
                    let lstat = fs.lstatSync(`${currentFullDir}/${filename}`);
                    if (lstat.isFile() && this.isPatchFile(filename)) {
                        let version, action, source, target, diff;
                        if(this.patchFileTemplateMode === patchFileTemplateMode.AV){
                            version = this.getPatchFileVersion(filename);
                            action = this.getPatchFileAction(filename);
                        }else if(this.patchFileTemplateMode === patchFileTemplateMode.ST){
                            source = this.getPatchFileSource(filename);
                            target = this.getPatchFileTarget(filename);

                            diff = target - source;
                            if(diff*diff === 1){
                                if(diff > 0){
                                    action = actions.UPDATE;
                                    version = target;
                                }else{
                                    action = actions.ROLLBACK;
                                    version = source;
                                }
                            }
                        }
                        
                        if (action && version) {
                            fileData.patchFiles[version] = fileData.patchFiles[version] || {};
                            fileData.patchFiles[version][action] = fileData.patchFiles[version][action] || [];
                            fileData.patchFiles[version][action].push({
                                file: filename,
                                fullPath: `${currentFullDir}/${filename}`,
                                description: this.getPatchFileDescription(filename)
                            });
                            fileData.maxPatchVersion = Math.max(fileData.maxPatchVersion, version);
                            fileData.foundPatchFiles++;

                            this.msg('LOG:DEBUG', `found patch file: ${filename}`);
                        }
                    } else if (lstat.isDirectory()) {
                        dirPromises.push(this.scanDirectoryForPatchFiles(dirPath.concat([filename]), fileData));
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
    validatePatchFileTemplate: function(){
        let template = this.config.patchFileTemplate;
        let found = {
            action: /\$ACTION/g.test(template),
            version: /\$VERSION/g.test(template),
            source: /\$SOURCE/g.test(template),
            target: /\$TARGET/g.test(template)
        };

        if((found.action || found.version) && (found.source || found.target)){
            return q.reject("Invalid patch file template: action/version cannot be mixed with source/target");    
        }else if(found.action && found.version){
            return q(patchFileTemplateMode.AV);
        }else if(found.source && found.target){
            return q(patchFileTemplateMode.ST);
        }
        
        return q.reject("Invalid patch file template: you need to supply (action AND version) OR (source AND target)");
    },
    createPatchFileRegex: function(group){
        //TODO: take into account this.patchFileTemplate

        let versionImp = (group === 'version') ? '' : '?:';
        let actionImp = (group === 'action') ? '' : '?:';
        let descriptionImp = (group === 'description') ? '' : '?:';
        let sourceImp = (group === 'source') ? '' : '?:';
        let targetImp = (group === 'target') ? '' : '?:';

        let versionTemplatePart = `(${versionImp}\\d+)`;
        let actionTemplatePart = `(${actionImp}${this.config.actionUpdate}|${this.config.actionRollback})`;
        let descriptionTemplatePart = `(${descriptionImp}[0-9a-zA-Z\-\_]+)`;
        let sourceTemplatePart = `(${sourceImp}\\d+)`;
        let targetTemplatePart = `(${targetImp}\\d+)`;

        let regexString = this.config.patchFileTemplate
            .replace(/\$VERSION/g, versionTemplatePart)
            .replace(/\$ACTION/g, actionTemplatePart)
            .replace(/\$DESCRIPTION/g, descriptionTemplatePart)
            .replace(/\$SOURCE/g, sourceTemplatePart)
            .replace(/\$TARGET/g, targetTemplatePart);

        return new RegExp(regexString, 'ig');
    },
    getPatchFileAction: function (filename) {
        let match = this.createPatchFileRegex('action').exec(filename)[1];
        if (match === this.config.actionUpdate) {
            return actions.UPDATE;
        }
        if (match === this.config.actionRollback) {
            return actions.ROLLBACK;
        }
        return null;
    },
    getPatchFileVersion: function (filename) {
        let match = this.createPatchFileRegex('version').exec(filename)[1];
        if (match !== null) {
            return parseInt(match, 10);
        }
        return match;
    },
    getPatchFileSource: function (filename) {
        let match = this.createPatchFileRegex('source').exec(filename)[1];
        if (match !== null) {
            return parseInt(match, 10);
        }
        return match;
    },
    getPatchFileTarget: function (filename) {
        let match = this.createPatchFileRegex('target').exec(filename)[1];
        if (match !== null) {
            return parseInt(match, 10);
        }
        return match;
    },
    getPatchFileDescription: function (filename) {
        return this.createPatchFileRegex('description').exec(filename)[1];
    },
    isPatchFile: function (filename) {
        return this.createPatchFileRegex().test(filename);
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
    }
};

module.exports = FileScanner;