'use strict';
/*
    RedisSet.js
 */
const uuid = require('uuid/v4');
const DocumentValidationError = require('../Errors').DocumentValidationError;
const CrossSlotError = require('../Errors').CrossSlotError;

class RedisSet{

    /*
        tance: the core redis database
        id: the ID of the document we want to work with
        schema: the description of data that goes into this set
        namespace: this is a variable - preferably short - that allows us to create different, parallel databases
        expirySeconds: how long should this document live for?

        the schema and namespace are _extra important_ because
        the set is stored on a server by {schema.type-namespace}.

        it is, for example, impossible to do a union between two types that aren't stored on the
        same namespace, as it would cause a CROSSSLOT error in production.
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

        return `set-{${type}-${this.namespace}}-${uuid()}`;
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

        const isIterable = object => object != null && typeof object[Symbol.iterator] === 'function';

        if(isIterable(doc)){
            await this.tance.sadd(this.id, ...doc.map((x) => this.prepare(x)))
        }
        else{
            await this.tance.sadd(this.id, this.prepare(doc));
        }

        if(this.expirySeconds){
            await this.tance.expire(this.id, this.expirySeconds);
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
    validateSetIds(setIds){
        return setIds.map(setId => {
            if(typeof setId === 'string' || setId instanceof String){
                return setId;
            }
            else{
                let set = setId;
                if(set.namespace !== this.namespace){
                    throw new CrossSlotError("Trying to perform a group operation (union/intersect/diff) on RedisSets from different namespaces; this would throw a CROSSLOT error on prod");
                }
                if(set.schema.type !== this.schema.type){
                    throw new CrossSlotError("Trying to perform a group operation (union/intersect/diff) on RedisSets from different schema types; this would throw a CROSSSLOT error on prod");
                }
                return set.id;
            }
        });
    }

    async union(...setIds){
        return this.tance.sunion(...[this.id].concat(this.validateSetIds(setIds)));
    }

    async unionStore(...setIds){
        let newSet = new RedisSet({
            tance: this.tance,
            schema: this.schema,
            namespace: this.namespace,
            expirySeconds: this.expirySeconds
        });
        await this.tance.sunionstore(newSet.id, ...[this.id].concat(this.validateSetIds(setIds)));
        return newSet;
    }

    async intersect(...setIds){
        return this.tance.sinter(...[this.id].concat(this.validateSetIds(setIds)));
    }

    async intersectStore(...setIds){
        let newSet = new RedisSet({
            tance: this.tance,
            schema: this.schema,
            namespace: this.namespace,
            expirySeconds: this.expirySeconds
        });
        await this.tance.sinterstore(newSet.id, ...[this.id].concat(this.validateSetIds(setIds)));
        return newSet;
    }


    async diff(...setIds){
        return this.tance.sdiff(...[this.id].concat(this.validateSetIds(setIds)));
    }

    async diffStore(...setIds){
        let newSet = new RedisSet({
            tance: this.tance,
            schema: this.schema,
            namespace: this.namespace,
            expirySeconds: this.expirySeconds
        });
        await this.tance.sdiffstore(newSet.id, ...[this.id].concat(this.validateSetIds(setIds)));
        return newSet;
    }

    async onion(...setIds){
        throw new Error("Onion error");
    }

}

module.exports = RedisSet;
