'use strict';

let fsp = require('./fs-promise');
let q = require('q');

const common = require('./common');
const patchData =  require('./patch-data');

const actions = common.action;
const patchFileTemplateMode = common.patchFileTemplateMode;

let FileScanner = function(config){
    config = common.determineValue(config, {});

    this.actionUpdate = common.determineValue(config.actionUpdate, 'up');
    this.actionRollback = common.determineValue(config.actionRollback, 'rb');
    this.patchFileTemplate = common.determineValue(config.patchFileTemplate, '^patch-$VERSION-$ACTION(?:-$DESCRIPTION)?\\.sql$');
    this.patchDir = common.determineValue(config.patchDir, 'pg-patch');

    this.patchFileTemplateMode = patchFileTemplateMode.INVALID;
};

let createNumericalRegexGetFn = function(group){
    return function (filename) {
        let match = this.createPatchFileRegex(group).exec(filename);
        /* istanbul ignore else */
        if(match){
            match = match[1];
            /* istanbul ignore else */
            if (match) {
                return parseInt(match, 10);
            }
        }

        return common.determineValue(match, null);
    };
};

FileScanner.prototype = {
    msg: common.msgHandler,
    createEmptyPatchDataObject: function(){
        return new patchData();
    },
    getPatchFileProperties: function(fName){ //TODO: improve handling of invalid templateMode?
        let version = null, action = null, source = null, target = null, diff = null;

        if(this.patchFileTemplateMode === patchFileTemplateMode.AV){
            version = this.getPatchFileVersion(fName);
            action = this.getPatchFileAction(fName);
        }else /* istanbul ignore else */ if(this.patchFileTemplateMode === patchFileTemplateMode.ST){
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
            description: common.determineValue(this.getPatchFileDescription(fName), null)
        };
    },
    scanDirectoryForPatchFiles: function (dirPath, rData) {
        dirPath = common.determineValue(dirPath, []);
        rData = common.determineValue(rData, this.createEmptyPatchDataObject());

        let currentSubDir = dirPath.join('/');
        let currentFullDir = `${this.patchDir ? this.patchDir : '.'}${currentSubDir ? '/' + currentSubDir : ''}`;

        this.msg('DIR_SCAN:START', currentFullDir);

        return fsp.readDir(currentFullDir).then(files => {
            let dirPromises = [];
            files.forEach(fName => {

                let pathPromise = fsp.lstat(`${currentFullDir}/${fName}`).then(lstat => {
                    if (lstat.isFile() && this.isPatchFile(fName)) {
                        this.msg('PATCH_FILE:FOUND', fName);

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
                        return true;
                    } else if (lstat.isDirectory()) {
                        return this.scanDirectoryForPatchFiles(dirPath.concat([fName]), rData);
                        //dirPromises.push(this.scanDirectoryForPatchFiles(dirPath.concat([fName]), rData));
                    }
                });

                dirPromises.push(pathPromise);
            });

            return q.all(dirPromises).then(function () {
                return rData;
            });
        });
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
            return q(this.patchFileTemplateMode = patchFileTemplateMode.AV);
        }else if(found.source && found.target){
            return q(this.patchFileTemplateMode = patchFileTemplateMode.ST);
        }else{
            return q.reject("Invalid patch file template: you need to supply (action AND version) OR (source AND target)");
        }
    },
    createPatchFileRegexGroup: function(key, capturing){
        let groupSubstitution = {
            version: '\\d+',
            action: `${this.actionUpdate}|${this.actionRollback}`,
            source: `\\d+`,
            target: `\\d+`,
            description: `[0-9a-zA-Z\-\_]+`
        }[key];
        return `(${capturing ? '' : '?:'}${groupSubstitution})`;
    },
    createPatchFileRegex: function(key){
        let versionTemplatePart, actionTemplatePart, sourceTemplatePart, targetTemplatePart;

        let descriptionTemplatePart = this.createPatchFileRegexGroup('description', key === 'description');
        if(this.patchFileTemplateMode === patchFileTemplateMode.AV){
            versionTemplatePart = this.createPatchFileRegexGroup('version', key === 'version');
            actionTemplatePart = this.createPatchFileRegexGroup('action', key === 'action');
        }else /* istanbul ignore else */ if(this.patchFileTemplateMode === patchFileTemplateMode.ST){
            sourceTemplatePart = this.createPatchFileRegexGroup('source', key === 'source');
            targetTemplatePart = this.createPatchFileRegexGroup('target', key === 'target');
        }

        let regexString = this.patchFileTemplate.replace(/\$DESCRIPTION/g, descriptionTemplatePart);

        if(this.patchFileTemplateMode === patchFileTemplateMode.AV){
            regexString = regexString
                .replace(/\$VERSION/g, versionTemplatePart)
                .replace(/\$ACTION/g, actionTemplatePart);
        }else /* istanbul ignore else */ if(this.patchFileTemplateMode === patchFileTemplateMode.ST){
            regexString = regexString
                .replace(/\$SOURCE/g, sourceTemplatePart)
                .replace(/\$TARGET/g, targetTemplatePart);
        }

        return new RegExp(regexString, 'ig');
    },
    getPatchFileAction: function (filename) {
        let match = this.createPatchFileRegex('action').exec(filename);

        /* istanbul ignore else */
        if(!match){
            return null;
        }
        match = match[1];

        if (match === this.actionUpdate) {
            return actions.UPDATE;
        }else /* istanbul ignore else */ if (match === this.actionRollback) {
            return actions.ROLLBACK;
        }
    },
    getPatchFileVersion: createNumericalRegexGetFn('version'),
    getPatchFileSource: createNumericalRegexGetFn('source'),
    getPatchFileTarget: createNumericalRegexGetFn('target'),
    getPatchFileDescription: function (filename) {
        let match = this.createPatchFileRegex('description').exec(filename);
        return match ? common.determineValue(match[1], null) : null;
    },
    isPatchFile: function (filename) {
        return this.createPatchFileRegex().test(filename);
    }
};

module.exports = FileScanner;