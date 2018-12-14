let WholeTableIndex = require("./Indexes/WholeTableIndex");

class Table{
    constructor({tance, schema, documentClass, indexes, disableFullTableSearch, expirySeconds}){

        this.tance = tance;
        this.schema = schema;
        this.documentClass = documentClass;
        this.expirySeconds = expirySeconds;

        this.defaultIndex = new WholeTableIndex({
            tance,
            type: this.schema.type,
            expirySeconds,
            disableFullTableSearch});



        this.indexes = [this.defaultIndex].concat(indexes);
    }

    async insertObjectIntoIndexes(object){
        this.indexes.forEach((index)=>{
            index.insertObject(object);
        })
    }

    async modifyObjectInIndexes(oldObject, newObject){
        this.indexes.forEach((index)=>{
            index.modifyObject(oldObject, newObject);
        })
    }

    async deleteObjectFromIndexes(id){
        this.indexes.forEach((index)=>{
            index.deleteObject(id);
        })
    }

    async insert(object){
        let document = new this.documentClass({tance: this.tance, schema: this.schema, expiry: this.expirySeconds});
        let newObject = await document.set(object);
        await this.insertObjectIntoIndexes(newObject);
        return newObject;
    }

    async get(id){
        let document = new this.documentClass({tance: this.tance, schema: this.schema, id: id});
        return document.get();
    }

    async delete(id){
        let document = new this.documentClass({tance: this.tance, schema: this.schema, id: id});
        this.deleteObjectFromIndexes(id);
        return document.delete();
    }

    async modify(id, changeFn){
        let document = new this.documentClass({tance: this.tance, schema: this.schema, id: id});
        let change = await document.modify(changeFn);
        await this.modifyObjectInIndexes(change);
        return change.changed;
    }

    async count(){
        return this.defaultIndex.count();
    }

    async find(args){
        if(args.id != null){
            return this.get(args.id);
        }
        let arrayOfResultArraysWithNulls = await Promise.all(this.indexes.map((index)=>index.find(args)));
        let arrayOfResultArrays = arrayOfResultArraysWithNulls.filter(x => x != null);

        if(arrayOfResultArrays.length === 0){
            return [];
        }

        // this is definitely an "AND" search: we're only interested in objects that exist in
        //      ALL of the indexes that are interested in this object
        let resultIdSet = new Set(arrayOfResultArrays[0]);
        arrayOfResultArrays.forEach((arrayOfResultsFromASingleIndex)=>{
            let setOfResultsFromASingleIndex = new Set(arrayOfResultsFromASingleIndex);
            // set the resultIdSet to the intersection of the resultIdSet and this set of results
            resultIdSet = [...resultIdSet].filter(x => setOfResultsFromASingleIndex.has(x));
        });

        let resultIds = [].concat.apply([], arrayOfResultArrays);
        let uniqueResultIds = Array.from(new Set(resultIds));

        let results = await this.tance.mget(uniqueResultIds);

        return results;
    };
}

module.exports = Table;