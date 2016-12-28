'use strict';

let fs = require('fs');
let q = require('q');

const common = require('./common');
const routeData =  require('./patchData');

const actions = common.actions;
const patchFileTemplateMode = common.patchFileTemplateMode;

let FileScanner = function(config){
    config = common.determineValue(config, {});

    this.actionUpdate = common.determineValue(config.actionUpdate, 'up');
    this.actionRollback = common.determineValue(config.actionRollback, 'rb');
    this.patchFileTemplate = common.determineValue(config.patchFileTemplate, '^patch-$VERSION-$ACTION(?:-$DESCRIPTION)?\\.sql$');
    this.patchDir = common.determineValue(config.patchDir, 'pg-patch');
};

let createNumericalRegexGetFn = function(group){
    return function (filename) {
        let match = this.createPatchFileRegex(group).exec(filename)[1];
        if (match !== null) {
            return parseInt(match, 10);
        }
        return match;
    }
};

FileScanner.prototype = {
    msg: function(){
        if(this.process){
            this.process.msg.apply(this.process, arguments);
        }
    },
    createEmptyRouteDataObject: function(){
        return new routeData();
    },
    getPatchFileProperties: function(fName){
        let version, action, source, target, diff;
        if(this.patchFileTemplateMode === patchFileTemplateMode.AV){
            version = this.getPatchFileVersion(fName);
            action = this.getPatchFileAction(fName);
        }else if(this.patchFileTemplateMode === patchFileTemplateMode.ST){
            source = this.getPatchFileSource(fName);
            target = this.getPatchFileTarget(fName);

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

        return {
            action: action,
            version: version,
            description: this.getPatchFileDescription(fName)
        };
    },
    scanDirectoryForPatchFiles: function (dirPath, rData) {
        let deferred = q.defer();

        dirPath = common.determineValue(dirPath, []);
        rData = common.determineValue(rData, this.createEmptyRouteDataObject());

        let currentSubDir = dirPath.join('/');
        let currentFullDir = `${this.patchDir ? this.patchDir : '.'}${currentSubDir ? '/' + currentSubDir : ''}`;

        this.msg('DIR_SCAN:START', currentFullDir);

        fs.readdir(currentFullDir, (err, files) => {
            if (err) {
                deferred.reject(err);
            } else {
                let dirPromises = [];
                files.forEach(fName => {
                    let lstat = fs.lstatSync(`${currentFullDir}/${fName}`); //TODO: rewrite sync

                    if (lstat.isFile() && this.isPatchFile(fName)) {
                        this.msg('LOG:DEBUG', `found patch file: ${fName}`);

                        let patchFileProps = this.getPatchFileProperties(fName);

                        if (patchFileProps.action && patchFileProps.version) {
                            rData.addData({
                                dir: currentFullDir,
                                name: fName,
                                type: 'FILE',
                                description: patchFileProps.description,
                                action: patchFileProps.action,
                                version: patchFileProps.version
                            });
                        }
                    } else if (lstat.isDirectory()) {
                        dirPromises.push(this.scanDirectoryForPatchFiles(dirPath.concat([fName]), rData));
                    }
                });

                q.all(dirPromises).then(function () {
                    deferred.resolve(rData);
                }).catch(function (err) {
                    deferred.reject(err);
                });
            }
        });

        return deferred.promise;
    },
    validatePatchFileTemplate: function(){
        let template = this.patchFileTemplate;
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
    createPatchFileRegexGroup: function(key, capturing){
        let groupSubstitution = {
            version: '\\d+',
            action: `${this.actionUpdate}|${this.actionRollback}`,
            source: `\\d+`,
            target: `\\d+`,
            description: `[0-9a-zA-Z\-\_]+`,
        }[key];
        return `(${capturing ? '' : '?:'}${groupSubstitution})`;
    },
    createPatchFileRegex: function(key){
        let versionTemplatePart, actionTemplatePart, sourceTemplatePart, targetTemplatePart;

        let descriptionTemplatePart = this.createPatchFileRegexGroup('description', key === 'description');
        if(this.patchFileTemplateMode === patchFileTemplateMode.AV){
            versionTemplatePart = this.createPatchFileRegexGroup('version', key === 'version');
            actionTemplatePart = this.createPatchFileRegexGroup('action', key === 'action');
        }else if(this.patchFileTemplateMode === patchFileTemplateMode.ST){
            sourceTemplatePart = this.createPatchFileRegexGroup('source', key === 'source');
            targetTemplatePart = this.createPatchFileRegexGroup('target', key === 'target');
        }

        let regexString = this.patchFileTemplate.replace(/\$DESCRIPTION/g, descriptionTemplatePart);

        if(this.patchFileTemplateMode === patchFileTemplateMode.AV){
            regexString = regexString
                .replace(/\$VERSION/g, versionTemplatePart)
                .replace(/\$ACTION/g, actionTemplatePart);
        }else if(this.patchFileTemplateMode === patchFileTemplateMode.ST){
            regexString = regexString
                .replace(/\$SOURCE/g, sourceTemplatePart)
                .replace(/\$TARGET/g, targetTemplatePart);
        }

        return new RegExp(regexString, 'ig');
    },
    getPatchFileAction: function (filename) {
        let match = this.createPatchFileRegex('action').exec(filename)[1];
        if (match === this.actionUpdate) {
            return actions.UPDATE;
        }
        if (match === this.actionRollback) {
            return actions.ROLLBACK;
        }
        return null;
    },
    getPatchFileVersion: createNumericalRegexGetFn('version'),
    getPatchFileSource: createNumericalRegexGetFn('source'),
    getPatchFileTarget: createNumericalRegexGetFn('target'),
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