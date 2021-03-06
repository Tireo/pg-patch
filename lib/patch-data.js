'use strict';

const common = require('./common');

let PgPatchData = function () {
    this.data = []; //new structure (raw data)
    this.routeData = {}; //initial is empty
};

PgPatchData.prototype = {
    addData: function (data) {
        this.data.push(data);
    },
    getData: function () {
        return this.data;
    },
    prepareRouteContainer: function (version, action) {
        this.routeData[version] = common.determineValue(this.routeData[version], {});
        this.routeData[version][action] = common.determineValue(this.routeData[version][action], []);
    },
    createRouteData: function () {
        this.routeData = {};

        //TODO: unify internal format
        this.getData().forEach(data => {
            let action = data.action;
            let version = data.version;
            let tmp;

            this.prepareRouteContainer(version, action);

            if (data.type === 'FILE') {
                let fName = data.name;
                tmp = {
                    type: data.type,
                    file: fName,
                    fullPath: `${data.dir}/${fName}`,
                    description: data.description
                };
            } else /* istanbul ignore else */ if (data.type === 'CUSTOM') {
                tmp = {
                    type: data.type,
                    sql: data.sql,
                    description: data.description
                };
            }

            this.routeData[version][action].push(tmp);
        });
    },
    getMaxPatchVersion: function () {
        let i = 1, max = false;
        while (this.routeData[i]) {
            max = i++;
        }
        return max;
    },
    patchRouteExists: function (sourceVersion, targetVersion) {
        let routeData = this.routeData;

        let action = common.determineAction(sourceVersion, targetVersion);
        let versionSeq = common.generateVersionPatchSequence(sourceVersion, targetVersion);

        for (let i = 0; i < versionSeq.length; i++) {
            let version = versionSeq[i];

            /* istanbul ignore else */
            if ((!routeData[version]) || (!routeData[version][action])) {
                return false;
            }
        }
        return true;
    }
};

module.exports = PgPatchData;