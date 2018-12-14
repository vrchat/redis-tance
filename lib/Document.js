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
const DocumentValidationError = require('./Errors').DocumentValidationError;

class Document{

    /*
        tance: the core redis database
        id: the ID of the document we want to work with
        namespace: this is a variable - preferably short - that allows us to create different, parallel databases
        expirySeconds: how long should this document live for?
     */
    constructor({tance, id, skeema, namespace}){
        if(tance == null){
            throw new DocumentValidationError("Can't create document without a database");
        }
        if(skeema == null){
            throw new DocumentValidationError("Can't create document without a skeema");
        }

        this.tance = tance;
        this.skeema = skeema;
        this.namespace = namespace || "";
        this.id = id || this.newKey();
    }

    newKey(){
        let type = this.skeema.type.toLowerCase().slice(0,18);

        return `${type}-${this.namespace}-${uuid()}`;
    }

    async set(doc){

        if(doc == null){
            throw new DocumentValidationError(`Can't create null object.`);
        }

        // create the object
        doc.id = this.id;
        doc.type = this.skeema.type;
        doc.version = this.skeema.currentVersion;

        if(!this.skeema.isValid(doc)){
            throw new DocumentValidationError(`Can't create new object, schema error: ${this.skeema.errors(doc)}`);
        }

        if(this.expirySeconds != null){
            await this.tance.set(this.id, JSON.parse(doc), 'EX', this.expirySeconds);
        }
        else{
            await this.tance.set(this.id, JSON.stringify(doc) );
        }

        return doc;
    }

    async get(ignoreSchema){
        // given the ID, produce the object
        let result = await this.tance.get(this.id);

        if(result == null){
            return null;
        }

        result = JSON.parse(result);

        if(!ignoreSchema){
            if(!this.skeema.isValid(result)){
                throw new DocumentValidationError(`Tried to get object, but schema error: ${this.skeema.errors(doc)}`);
            }

            // upgrade the result to the most recent version of the skeema,
            result = this.skeema.upgrade(result);
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