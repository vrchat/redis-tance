'use strict';
/*
    LockingDocument.js

    this is exactly Document but with basic spinlocking to prevent modify-contention at the expense of
    * the chance of a modify failing
    * the chance of a modify taking way longer than expected

 */
const uuid = require('uuid/v4');
const Document = require('./Document');
const LockError = require('../Errors').LockError;
const DocumentValidationError = require('../Errors').DocumentValidationError;

const LOCK_EXPIRY_MILLISECONDS = 500;
const SPIN_INTERVAL_MILLISECONDS = 50;
const SPIN_RETRIES = parseInt(LOCK_EXPIRY_MILLISECONDS / SPIN_INTERVAL_MILLISECONDS, 10) + 1;
const this_server = uuid();

const delay = (ms) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {resolve("delay");}, ms);
    })
};

class LockingDocument extends Document{

    constructor(args){
        super(args);
    }

    async modify(changeFn, retries){
        // changeFn is an x=>x transformation on the object
        // this does a read, then a whole document write, so, YEAH
        // it's possible for two of these happening at the same time to run over one another

        if(retries == null){
            retries = SPIN_RETRIES;
        }

        let lockKey = this.id+"_lock";

        let ok = await this.tance.set(lockKey, this_server, "NX", "PX", LOCK_EXPIRY_MILLISECONDS);
        if(ok !== "OK"){
            //console.warn("Lock not got");
            // someone else has locked this variable
            if(retries <= 0){
                throw new LockError(`Could not get lock to write object ${this.id}`);
            }
            await delay(SPIN_INTERVAL_MILLISECONDS);
            retries = retries - 1;
            return this.modify(changeFn, retries);
        }
        else{
            //console.warn("Lock got!");
        }

        try{
            let timeout = delay(LOCK_EXPIRY_MILLISECONDS);
            let doc = await this.get();
            let copyDoc = {...doc};
            let newDoc = await Promise.race([timeout, changeFn(copyDoc)]);
            if(newDoc == null){
                throw new DocumentValidationError(`changeFn returned null value`);
            }
            if(newDoc === "delay"){
                throw new LockError(`Couldn't modify ${this.id} before lock expired.`);
            }
            let response = await this.set(newDoc);
            return {original: doc, changed: response};
        }
        finally{
            //console.warn("releasing lock!");
            await this.tance.del(lockKey);
        }
    }
}

module.exports = LockingDocument;