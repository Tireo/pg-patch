'use strict';

module.exports = {
    actions: Object.freeze({
        UPDATE: 'update',
        ROLLBACK: 'rollback'
    }),
    dryRun: Object.freeze({
        LOG_ONLY: 1,
        TEST_SQL: 2
    }),
    transactionMode: Object.freeze({
        PER_VERSION_STEP: 1,
        SINGLE: 2
    }),
    logLevels: Object.freeze({
        DEBUG: 1,
        LOG: 2,
        INFO: 3,
        WARN: 4,
        SUCCESS: 5,
        ERROR: 6,
        NONE: 7
    }),
    logChalk: {
        DEBUG: 'gray',
        LOG: 'reset',
        INFO: 'blue',
        WARN: 'yellow',
        SUCCESS: 'green',
        ERROR: 'red'
    },
    patchFileTemplateMode: {
        AV: 1,  //action-version
        ST: 2   //source-target
    },
    determineValue: function () {
        for (let i = 0; i < arguments.length; i++) {
            if (arguments[i] !== undefined) {
                return arguments[i];
            }
        }
    }
};
