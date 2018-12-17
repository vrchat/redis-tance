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

    // prepare means "get ready to stuff into the db"
    prepare(doc){
        if(this.schema.constructor.name === "MigratingSchema"){
            doc.id = this.id;
            doc.type = this.schema.type;
            doc.version = this.schema.currentVersion;
        }

        if(!this.schema.isValid(doc)){
            throw new DocumentValidationError(`Can't create new object, schema error: ${this.schema.errors(doc)}`);
        }

        return this.schema.serializationFn(doc);
    }

    // postpare is the opposite of prepare, obviously
    postpare(serializedDoc){
        if(serializedDoc == null){
            return null;
        }
        let doc = this.schema.deserializationFn(serializedDoc);
        return this.schema.upgrade(doc);
    }

    // add a member to the set
    async add(doc){
        if(doc == null){
            throw new DocumentValidationError(`Can't create null object.`);
        }


        await this.tance.sadd(this.id, this.prepare(doc));
        if(this.expirySeconds){
            this.tance.expire(this.id, expirySeconds);
        }

        return doc;
    }

    // get every member of the set
    async members(){
        let membs = await this.tance.smembers(this.id);

        return membs.map(x => this.postpare(x));
    }

    // just get n random members of the set
    async randmember(n){
        let membs = await this.tance.srandmember(this.id, n);

        return membs.map(x => this.postpare(x));
    }

    // delete an element from the set
    async rem(doc){
        this.tance.srem(this.id, this.prepare(doc));

        return doc;
    }

    // change the set
    async modify(changeFn){
        // changeFn is an set=>set transformation of a set
        let list = await this.members();
        let copyList = JSON.parse(JSON.stringify(list));
        let originalSet = new Set(list);
        let set = new Set(copyList);
        let newSet = await changeFn(set);

        // items that are in originalSet but not in newSet are to be removed
        // items that are in newSet but not in originalSet are to be added
        let itemsToRemove = [...originalSet].filter(x => !newSet.has(x));
        let itemsToAdd = [...newSet].filter(x => !originalSet.has(x));

        let promises = itemsToRemove.map((itemToRemove) => {this.rem(itemToRemove)});
        promises = promises.concat(itemsToAdd.map((itemToAdd) => {this.add(itemToAdd)}));

        await Promise.all(promises);

        return {original: originalSet, changed: newSet};
    }

    // delete the set
    async delete(){
        return this.tance.del(this.id);
    }

    // contains
    async contains(obj){
        return this.tance.sismember(this.id, this.prepare(obj));
    }

    async has(obj){
        return this.contains(obj);
    }

    // count
    async count(obj){
        return this.tance.scard(this.id);
    }

    // diff, union, intersect

}

module.exports = RedisSet;
