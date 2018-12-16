'use strict';
/*
    Document.js

    this is a very simple document CRUD

    WARNING: Document is not appropriate for documents that are fast-updating!
    it doesn't do any write-locking, so simultaneous writes will race one another
    you'll get inconsistent data, and you don't want that!
    a long-running changeFn could be brutal because it's read-change-then-write

 */
const uuid = require('uuid/v4');
const DocumentValidationError = require('../Errors').DocumentValidationError;

class Document{

    /*
        tance: the core redis database
        id: the ID of the document we want to work with
        schema: the description of data that goes into this document
        namespace: this is a variable - preferably short - that allows us to create different, parallel databases
        expirySeconds: how long should this document live for?
     */
    constructor({tance, id, schema, namespace, expirySeconds}){
        if(tance == null){
            throw new DocumentValidationError("Can't create document without a database");
        }
        if(schema == null){
            throw new DocumentValidationError("Can't create document without a schema");
        }

        this.tance = tance;
        this.schema = schema;
        this.namespace = namespace || "";
        this.id = id || this.newKey();
        this.expirySeconds = expirySeconds;
    }

    newKey(){
        let type = this.schema.type.toLowerCase().slice(0,18);

        return `doc-${type}-${this.namespace}-${uuid()}`;
    }

    async set(doc){

        if(doc == null){
            throw new DocumentValidationError(`Can't create null object.`);
        }

        // create the object
        if(this.schema.constructor.name === "MigratingSchema"){
            doc.id = this.id;
            doc.type = this.schema.type;
            doc.version = this.schema.currentVersion;
        }

        if(!this.schema.isValid(doc)){
            throw new DocumentValidationError(`Can't create new object, schema error: ${this.schema.errors(doc)}`);
        }

        if(this.expirySeconds != null){
            await this.tance.set(this.id, this.schema.serializationFn(doc), 'EX', this.expirySeconds);
        }
        else{
            await this.tance.set(this.id, this.schema.serializationFn(doc) );
        }

        return doc;
    }

    async get(){
        // given the ID, produce the object
        let result = await this.tance.get(this.id);

        if(result == null){
            return null;
        }

        result = this.schema.deserializationFn(result);

        // upgrade the result to the most recent version of the schema,
        result = this.schema.upgrade(result);

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