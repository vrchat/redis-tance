/*
    Document.js

    this is a very simple document CRUD

    WARNING: Document is not appropriate for documents that are fast-updating!
    it doesn't do any write-locking, so simultaneous writes will race one another
    you'll get inconsistent data, and you don't want that!
    a long-running changeFn could be brutal because it's read-change-then-write

 */
const uuid = require('uuid/v4');

class Document{

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
        doc.id = this.id;
        doc.type = this.schema.type;
        doc.version = this.schema.currentVersion;

        if(!this.schema.isValid(doc)){
            throw new Error(`Can't create new object, schema error: ${this.schema.errors(doc)}`);
        }

        if(this.expiry != null){
            await this.tance.set(this.key(), this.serialize(doc), 'EX', this.expiry);
        }
        else{
            await this.tance.set(this.key(), this.serialize(doc) );
        }

        return doc;
    }

    async get(ignoreSchema){
        // given the ID, produce the object
        let result = await this.tance.get(this.key());

        if(result == null){
            return null;
        }

        result = this.deserialize(result);

        if(!this.schema.isValid(result) && !ignoreSchema){
            throw new Error(`Tried to get object, but schema error: ${this.schema.errors(doc)}`);
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
        let copyDoc = {...doc};
        let newDoc = await changeFn(copyDoc);
        return this.set(newDoc);
    }

    async delete(){
        return this.del(this.key());
    }


}

module.exports = Document;