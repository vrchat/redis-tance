'use strict';
/*
    RedisSet.js
 */
const uuid = require('uuid/v4');
const DocumentValidationError = require('../Errors').DocumentValidationError;

class RedisSet{

    /*
        tance: the core redis database
        id: the ID of the document we want to work with
        schema: the description of data that goes into this set
        namespace: this is a variable - preferably short - that allows us to create different, parallel databases
        expirySeconds: how long should this document live for?
     */
    constructor({tance, id, schema, namespace, expirySeconds}){
        if(tance == null){
            throw new DocumentValidationError("Can't create document without a database");
        }

        this.tance = tance;
        this.schema = schema;
        this.namespace = namespace || "";
        this.id = id || this.newKey();
        this.expirySeconds = expirySeconds;
    }

    newKey(){
        let type = this.schema.type.toLowerCase().slice(0,18);

        return `set-${type}-${this.namespace}-${uuid()}`;
    }

    async get(){
        return this.members();
    }

    async set(doc){
        return this.add(doc);
    }

    async add(doc){
        if(doc == null){
            throw new DocumentValidationError(`Can't create null object.`);
        }

        if(!this.schema.isValid(doc)){
            throw new DocumentValidationError(`Can't create new object, schema error: ${this.schema.errors(doc)}`);
        }

        if(this.schema.constructor.name === "MigratingSchema"){
            doc.id = this.id;
            doc.type = this.schema.type;
            doc.version = this.schema.currentVersion;
        }

        await this.tance.sadd(this.id, doc);
        if(this.expirySeconds){
            this.tance.expire(this.id, expirySeconds);
        }

        return doc;
    }

    async members(){
        let membs = await this.tance.smembers(this.id);

        return membs.map((member)=>{
            if(member == null){
                return null;
            }
            let returnVal = this.schema.deserializationFn(member);
            return this.schema.upgrade(returnVal);
        })
    }

    async rem(doc){
        this.tance.srem(this.id, doc);

        return doc;
    }

    async modify(changeFn){
        // changeFn is an x=>x transformation on the object
        // this does a read, then a whole document write, so, YEAH
        // it's possible for two of these happening at the same time to run over one another

        throw new Error("Can't call modify on a RedisSet, because how would that even work?");
    }

    async delete(){
        return this.tance.del(this.id);
    }


}

module.exports = RedisSet;
