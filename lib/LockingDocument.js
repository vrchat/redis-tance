/*
    LockingDocument.js

    this is exactly Document but with basic spinlocking to prevent modify-contention at the expense of
    * the chance of a modify failing
    * the chance of a modify taking way longer than expected

 */
const uuid = require('uuid/v4');
const Document = require('./Document');
const LockError = require('./Errors').LockError;

const LOCK_EXPIRY_MILLISECONDS = 300;
const SPIN_INTERVAL_MILLISECONDS = 50;
const SPIN_RETRIES = parseInt((LOCK_EXPIRY_SECONDS * 1000) / SPIN_INTERVAL_MILLISECONDS, 10) + 1;
const this_server = uuid();

const timeout = () => {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, SPIN_INTERVAL_MILLISECONDS);
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

        let lockKey = this.key()+"_lock";
        try{
            let ok = await this.tance.set(lockKey, this_server, "NX", "PX", LOCK_EXPIRY_MILLISECONDS);
            if(ok !== "OK"){
                // someone else has locked this variable
                if(retries <= 0){
                    throw new LockError(`Could not get lock to write object ${this.id}`);
                }
                await timeout();
                retries = retries - 1;
                return modify(changeFn, retries);
            }
            let doc = await this.get();
            let copyDoc = {...doc};
            let newDoc = await changeFn(copyDoc);
            let response = await this.set(newDoc);
            return response;
        }
        finally{
            await this.del(lockKey);
        }
    }
}

module.exports = LockingDocument;