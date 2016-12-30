'use strict';

module.exports = {
    action: Object.freeze({
        UPDATE: 'UPDATE',
        ROLLBACK: 'ROLLBACK',
        INVALID: 'INVALID'
    }),
    dryRunMode: Object.freeze({
        LOG_ONLY: 'LOG_ONLY',
        TEST_SQL: 'TEST_SQL'
    }),
    transactionMode: Object.freeze({
        PER_VERSION_STEP: 1,
        SINGLE: 2
    }),
    logLevel: Object.freeze({
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
        AV: 'AV',  //action-version
        ST: 'ST',   //source-target
        INVALID: 'INVALID'
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
            return this.action.INVALID;
        }
        return (source < target) ? this.action.UPDATE : this.action.ROLLBACK;
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
    generateVersionPatchSequence: function(source, target) {
        let action = this.determineAction(source, target);

        if (action === this.action.UPDATE) {
            return this.generateSequence(source + 1, target);
        } else {
            return this.generateSequence(source, target + 1);
        }
    },
    msgHandler: function(){
        /* istanbul ignore else */
        if(this.process){
            this.process.msg.apply(this.process, arguments);
        }
    }
};
