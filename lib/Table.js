'use strict';

const WholeTableIndex = require("./Indexes/WholeTableIndex");
const LockingDocument = require("./LockingDocument");
const Index = require('./Indexes/Index');
const TableError = require('./Errors').TableError;

class Table{
    constructor({tance, skeema, indexes, documentClass=LockingDocument, namespace="", disableFullTableSearch=false}){

        if(tance == null){
            throw new TableError("Can't create a Table without a database");
        }
        if(skeema == null){
            throw new TableError("Can't create a Table without a Skeema");
        }

        this.tance = tance;
        this.skeema = skeema;
        this.documentClass = documentClass;
        this.type = this.skeema.type;
        this.expirySeconds = this.skeema.expirySeconds;
        this.namespace = namespace;

        // Build Indexes
        this.defaultIndex = new WholeTableIndex({
            tance,
            type: this.skeema.type,
            expirySeconds: this.expirySeconds,
            disableFullTableSearch,
            namespace});

        this.indexes = [this.defaultIndex].concat(indexes);

        let schema = skeema.get();
        this.properties = new Set(Object.keys(schema.properties));

        this.properties.forEach((property)=>{
            let index = Index.createIndexFromSchema({tance, property, skeema, namespace});
            if(index != null){
                this.indexes.push(index);
            }
        });
        this.indexes = this.indexes.filter(x => x != null);
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
        let document = new this.documentClass({
            tance: this.tance,
            skeema: this.skeema,
            namespace: this.namespace,
            expirySeconds: this.expirySeconds});
        let newObject = await document.set(object);
        await this.insertObjectIntoIndexes(newObject);
        return newObject;
    }

    async get(id){
        let document = new this.documentClass({tance: this.tance, skeema: this.skeema, namespace: this.namespace, id: id});
        return document.get();
    }

    async delete(id){
        let document = new this.documentClass({tance: this.tance, skeema: this.skeema, namespace: this.namespace, id: id});
        this.deleteObjectFromIndexes(id);
        return document.delete();
    }

    async modify(id, changeFn){
        let document = new this.documentClass({tance: this.tance, skeema: this.skeema, namespace: this.namespace, id: id});
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

        let resultIds = Array.from(resultIdSet);
        let uniqueResultIds = Array.from(new Set(resultIds));

        if(uniqueResultIds.length === 0){
            return [];
        }

        //      -- this.tance.mget(...uniqueResultIds);
        // this won't work in Redis Cluster, if the results happen to exist on separate servers
        let serializedResults = await Promise.all(uniqueResultIds.map(id => this.tance.get(id)));
        let results = serializedResults.filter(x => x != null).map(JSON.parse);

        // TODO: validate that results match args, sort?

        return results;
    };
}

module.exports = Table;