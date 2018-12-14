/*
    Document.js

    this is a very simple document CRUD

    WARNING: Document is not appropriate for documents that are fast-updating!
    it doesn't do any write-locking, so simultaneous writes will race one another
    you'll get inconsistent data, and you don't want that!
    a long-running changeFn could be brutal because it's read-change-then-write

 */
const uuid = require('uuid/v4');
const DocumentValidationError = require('./Errors').DocumentValidationError;

class Document{

    constructor({tance, id, schema, expiry}){
        this.tance = tance;
        this.schema = schema;
        this.id = id || this.newKey();
        this.expiry = schema.expiry || expiry;
    }

    newKey(){
        let type = this.schema.type.toLowerCase().slice(0,18);

        return `${type}-${uuid()}`;
    }

    serialize(x){
        return JSON.stringify(x);
    }

    deserialize(x){
        return JSON.parse(x);
    }

    async set(doc){

        if(doc == null){
            throw new DocumentValidationError(`Can't create null object.`);
        }

        // create the object
        doc.id = this.id;
        doc.type = this.schema.type;
        doc.version = this.schema.currentVersion;

        if(!this.schema.isValid(doc)){
            throw new DocumentValidationError(`Can't create new object, schema error: ${this.schema.errors(doc)}`);
        }

        //console.info(`setting ${this.key()} to ${JSON.stringify(doc)}`);
        if(this.expiry != null){
            await this.tance.set(this.id, this.serialize(doc), 'EX', this.expiry);
        }
        else{
            await this.tance.set(this.id, this.serialize(doc) );
        }

        return doc;
    }

    async get(ignoreSchema){
        // given the ID, produce the object
        let result = await this.tance.get(this.id);

        if(result == null){
            return null;
        }

        result = this.deserialize(result);

        //console.info(`getting ${this.key()}: ${JSON.stringify(result)}`);

        if(!ignoreSchema){
            if(!this.schema.isValid(result)){
                throw new DocumentValidationError(`Tried to get object, but schema error: ${this.schema.errors(doc)}`);
            }

            // upgrade the result to the most recent version of the schema,
            result = this.schema.upgrade(result);
        }

        return result;
    }

    async modify(changeFn){
        // changeFn is an x=>x transformation on the object
        // this does a read, then a whole document write, so, YEAH
        // it's possible for two of these happening at the same time to run over one another
        let doc = await this.get();
        let copyDoc = {...doc};
        let newDoc = await changeFn(copyDoc);
        if(newDoc == null){
            throw new Error("changeFn returned a null value");
        }
        return {original: doc, changed: this.set(newDoc)};
    }

    async delete(){
        return this.tance.del(this.id);
    }


}

module.exports = Document;