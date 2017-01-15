'use strict';

let BasicReporter = function (config) {
    this.msgHandlers = [];

    /* istanbul ignore else */
    if (config) {
        this.registerMsgHandlers(config);
    }
};

BasicReporter.prototype = {
    getAllMsgHandlerFunctionsForMsg: function (msg) {
        let ret = [];
        this.msgHandlers.forEach((handlerData) => {
            /* istanbul ignore else */
            if (handlerData.check(msg)) {
                ret.push(handlerData.hanflerFn);
            }
        });
        return ret;
    },
    registerMsgHandlers: function (data) {
        Object.keys(data).forEach(key => {
            this.registerMsgHandler(key, data[key]);
        });
    },
    registerMsgHandler: function (msgCheck, cb) {
        this.msgHandlers.push({
            regex: new RegExp(`^${msgCheck}$`),
            check: function (msgType) {
                return this.regex.test(msgType);
            },
            hanflerFn: cb
        });
    },
    onMsg: function (id, data) {
        let handlerFunctions = this.getAllMsgHandlerFunctionsForMsg(id);
        if (handlerFunctions.length) {
            handlerFunctions.forEach((fn) => {
                let params = id.split(":");
                let combined = {};
                let combinedCurrent = [];

                params.forEach((param, idx) => {
                    combinedCurrent.push(param);
                    combined[idx + 1] = combinedCurrent.join(':');
                });

                fn(data, params, combined);
            });
            return true; //handled
        } else {
            return false; //not handled
        }
    }
};

module.exports = BasicReporter;
