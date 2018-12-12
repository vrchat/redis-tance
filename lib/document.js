/*
    document.js

    this is a very simple document CRUD
    it doesn't do any write-locking, so simultaneous writes will race one another
    a long-running changeFn could be brutal because it's read-change-then-write
    but it'll do, especially for documents that don't change much or experience simultaneous changes

 */
const uuid = require('uuid/v4');

class document{

    constructor({tance, id, schema, expiry}){
        this.tance = tance;
        this.id = id || uuid();
        this.schema = schema;
        this.expiry = schema.expiry || expiry;
    }

    key(){
        return `${this.schema.type}_${this.id}`;
    }

    serialize(x){
        return JSON.stringify(x);
    }

    deserialize(x){
        return JSON.parse(x);
    }

    async set(doc){
        // create the object

        if(!this.schema.isValid(doc)){
            throw new Error("Can't create new object, schema error");
        }

        if(this.expiry != null){
            return this.tance.set(this.key(), this.serialize(doc), 'EX', this.expiry);
        }
        else{
            return this.tance.set(this.key(), this.serialize(doc) );
        }
    }

    async get(){
        // given the ID, produce the object
        let result = await this.tance.get(this.key());

        if(result == null){
            return null;
        }

        result = this.deserialize(result);

        if(!this.schema.isValid(result)){
            throw new Error("Tried to get object, but schema invalid!");
        }

        // upgrade the result to the most recent version of the schema,
        result = this.schema.upgrade(result);

        return result;
    }

    async modify(changeFn){
        // changeFn is an x=>x transformation on the object
        // this does a read, then a whole document write, so, YEAH
        // it's possible for two of these happening at the same time to run over one another
        let doc = await get();
        let newDoc = await changeFn(doc);
        return this.set(this.serialize(newDoc));
    }

    async delete(){
        return this.del(this.key());
    }


}

module.exports = document;