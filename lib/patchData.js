'use strict';

const common = require('./common');

let PgPatchData = function(){
    this.data = []; //new structure (raw data)
};

PgPatchData.prototype = {
    addData: function(data){
        this.data.push(data);
    },
    createRouteData: function(){
        this.routeData = {};

        this.data.forEach(data => {
            if(data.type === 'FILE'){
                let fName = data.name;
                let action = data.action;
                let version = data.version;

                this.routeData[version] = common.determineValue(this.routeData[version], {});
                this.routeData[version][action] = common.determineValue(this.routeData[version][action], []);
                this.routeData[version][action].push({
                    file: fName,
                    fullPath: `${data.dir}/${fName}`,
                    description: data.description
                });
                this.maxPatchVersion = Math.max(this.maxPatchVersion || 0, version);
            }
        });
    },
    patchRouteExists: function(sourceVersion, targetVersion) {
        let routeData = this.routeData;

        let action = common.determineAction(sourceVersion, targetVersion);
        let versionSeq = common.generateVersionSequence(sourceVersion, targetVersion);

        for(let i=0; i<versionSeq.length; i++){
            let version = versionSeq[i];
            if ((!routeData[version]) || (!routeData[version][action])) {
                return false;
            }
        }

        return true;
    }
};

module.exports = PgPatchData;