'use strict';
/*
    ExpiringSet.js

    An ExpiringSet is a complex data structure that maintains two parallel Redis Sets.

    The reason for this is: we have a Set, and we want that set to be available, and active - for example,
    "the list of active users in our system" - but we also want stuff to regularly and quickly expire
    from that set. Redis doesn't have a mechanism for expiring individual set members!

    So, in order to support expiry, we create a system where we expect that every item is regularly re-inserted
    to the set - so, for example, if we have users A, B, C, and D
    we add A, add B, add C, and add D
    and we should have [A, B, C, D]

    then we .expire()
    and we should still have [A, B, C, D],
    because in our last run, we inserted all four of those members

    then, we add A, add B, add D
    and we should have [A, B, C, D], still

    then we .expire() again
    and we should have [A, B, D] - because "C" never checked in.

    It's duck-type compatible with RedisSet, but has ... weird properties of its own.
 */
const uuid = require('uuid/v4');

const DocumentValidationError = require('../Errors').DocumentValidationError;
const RedisSet = require('./RedisSet');
const Schema = require('../Schema/Schema');

class ExpiringSet {

    constructor({tance, id, schema, namespace, expirySeconds}){
        if(tance == null){
            throw new DocumentValidationError("Can't create ExpiringSet without a database");
        }
        this.id = id || this.newKey();
        this.tance = tance;
        this.schema = schema || Schema.String(expirySeconds);
        this.namespace = namespace || "";
        this.expirySeconds = expirySeconds;

        this.set_A = new RedisSet({tance, id: `${this.id}_TEMP`, schema, namespace, expirySeconds});
        this.set_B = new RedisSet({tance, id: `${this.id}`, schema, namespace, expirySeconds});
    }

    newKey(){
        let type = "string";
        if(this.schema != null){
            type = this.schema.type.toLowerCase().slice(0,18);
        }

        let namespace = "default";
        if(this.namespace != null){
            namespace = this.namespace;
        }

        return `set-{${type}-${namespace}}-${uuid()}`;
    }

    async expire(){
        /*
            this is the important one, it's where we move the contents from SET A into SET B.
         */

        let temp_id = `${this.set_B.id}_GARBAGE_${uuid()}`;

        await this.tance.multi()
            .rename(this.set_B.id, temp_id)
            .rename(this.set_A.id, this.set_B.id)
            .exec();

        await this.tance.unlink(temp_id);

        await this.set_A.refreshExpiry();
        await this.set_B.refreshExpiry();

        return;
    }

    async get(){
        return this.members();
    }

    async set(doc){
        return this.add(doc);
    }

    async add(doc){
        /*
            the reason we can't call set_A.add is that set_A.add would automatically set the ID of the document
            to id_TEMP, which we don't want.
         */
        await this.set_A.add(doc);
        return this.set_B.add(doc);
    }

    // get every member of the set
    async members(){
        return this.set_B.members();
    }

    // just get n random members of the set
    async randmember(n){
        return this.set_B.randmember(n);
    }

    // delete an element from the set
    async rem(doc){
        await this.set_A.rem(doc);
        return this.set_B.rem(doc);
    }

    // change the set
    async modify(changeFn){
        await this.set_A.modify(changeFn);
        return this.set_B.modify(changeFn);
    }

    // delete the set
    async delete(){
        await this.set_A.delete();
        return this.set_B.delete();
    }
    async clear(){
        return this.delete();
    }

    // contains
    async contains(obj){
        return this.set_B.contains(obj);
    }

    async has(obj){
        return this.contains(obj);
    }

    // count
    async count(){
        return this.set_B.count();
    }

    async union(...setIds){
        return this.set_B.union(...setIds);
    }

    async unionStore(...setIds){
        return this.set_B.unionStore(...setIds);
    }

    async unionStoreAt(id, ...setIds){
        return this.set_B.unionStoreAt(id, ...setIds);
    }

    async intersect(...setIds){
        return this.set_B.intersect(...setIds);
    }

    async intersectStore(...setIds){
        return this.set_B.intersectStore(...setIds);
    }

    async intersectStoreAt(id, ...setIds){
        return this.set_B.intersectStoreAt(id, ...setIds);
    }

    async copyTo(id){
        return this.set_B.copyTo(id);
    }

    async diff(...setIds){
        return this.set_B.diff(...setIds);
    }

    async diffStore(...setIds){
        return this.set_B.diffStore(...setIds);
    }

    async diffStoreAt(id, ...setIds){
        return this.set_B.diffStoreAt(id, ...setIds);
    }

    async onion(...setIds){
        throw new Error("Onion error");
    }

}

module.exports = ExpiringSet;
