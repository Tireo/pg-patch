'use strict';

module.exports = {
    actions: Object.freeze({
        UPDATE: 'update',
        ROLLBACK: 'rollback',
        INVALID: 'invalid'
    }),
    dryRun: Object.freeze({
        LOG_ONLY: 'log_only',
        TEST_SQL: 'test_sql'
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
    },
    determineAction: function(source, target){
        if(source === target){
            return this.actions.INVALID;
        }
        return (source < target) ? this.actions.UPDATE : this.actions.ROLLBACK;
    },
    generateSequence: function(source, target){
        let seq = [],
            i = source;

        for(; i !== target; (source < target) ? i++ : i--){
            seq.push(i);
        }
        seq.push(i);

        return seq;
    },
    generateVersionSequence: function(source, target) {
        let action = this.determineAction(source, target);

        if (action === this.actions.UPDATE) {
            return this.generateSequence(source + 1, target);
        } else {
            return this.generateSequence(source, target + 1);
        }
    }
};
