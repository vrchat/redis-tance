'use strict';

const uuid = require('uuid/v4');

const WholeTableIndex = require("./Indexes/WholeTableIndex");
const LockingDocument = require("./Primitives/LockingDocument");
const Index = require('./Indexes/Index');
const TableError = require('./Errors').TableError;
const MigratingSchema = require('./Schema/MigratingSchema');
const RedisSet = require("./Primitives/RedisSet");
const Schema = require("./Schema/Schema");
const intersect = require("./intersect");

class Table{
    constructor({tance, schema, indexes, documentClass=LockingDocument, namespace="", disableFullTableSearch=false}){

        if(tance == null){
            throw new TableError("Can't create a Table without a database");
        }
        if(schema == null){
            throw new TableError("Can't create a Table without a schema");
        }

        this.tance = tance;
        this.schema = schema;
        this.documentClass = documentClass;
        this.type = this.schema.type;
        this.expirySeconds = this.schema.expirySeconds;
        this.namespace = namespace;
        this.error = null;

        // Build Indexes
        this.defaultIndex = new WholeTableIndex({
            tance,
            type: this.schema.type,
            expirySeconds: this.expirySeconds,
            disableFullTableSearch,
            namespace});

        this.indexes = [this.defaultIndex].concat(indexes);

        let currentSchemaVersion = schema.get();
        this.properties = new Set(Object.keys(currentSchemaVersion.properties));

        this.properties.forEach((property)=>{
            let index = Index.createIndexFromSchema({tance, property, schema, namespace});
            if(index != null){
                this.indexes.push(index);
            }
        });
        this.indexes = this.indexes.filter(x => x != null);

        this.createSchemaInDatabase().catch((err)=>{
            this.error = err;
        });
    }

    async createSchemaInDatabase(){

        await this.tance.sadd('tance-tables', this.schemaKey());

        let serializedSchema = await this.tance.get(this.schemaKey());
        if(serializedSchema == null){
            await this.tance.set(this.schemaKey(), this.schema.serialize());
            return;
        }

        let existingSchema = this.schema.constructor.deserialize(serializedSchema);
        if(this.schema.currentVersion < existingSchema.currentVersion){
            this.error = new TableError(`${this.type}-${this.namespace} is running a version ${this.schema.currentVersion}, but the database version is ${existingSchema.currentVersion}`);
            return;
        }
        else if(this.schema.currentVersion > existingSchema.currentVersion){
            // upgrade table?
            // nah, I can't figure how to upgrade table automatically in a way that doesn't suck
            // return this.upgradeTable(existingSchema.currentVersion, this.schema.currentVersion);
            await this.tance.set(this.schemaKey(), this.schema.serialize());
            return;
        }
        else{
            // version matches: we're using the same version as the database is
            return;
        }
    }

    schemaKey(){
        return `table-${this.type}-${this.namespace}-schema`;
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

    throwIfError(){
        // if stuff is weird, we should stop writes until we've figured things out
        if(this.error != null){
            throw this.error;
        }
    }

    async insert(object){
        this.throwIfError();
        let document = new this.documentClass({
            tance: this.tance,
            schema: this.schema,
            namespace: this.namespace,
            expirySeconds: this.expirySeconds});
        let newObject = await document.set(object);
        await this.insertObjectIntoIndexes(newObject);
        return newObject;
    }

    async get(id){
        let document = new this.documentClass({tance: this.tance, schema: this.schema, namespace: this.namespace, id: id});
        return document.get();
    }

    async delete(id){
        let document = new this.documentClass({tance: this.tance, schema: this.schema, namespace: this.namespace, id: id});
        await this.deleteObjectFromIndexes(id);
        return document.delete();
    }

    async renew(id){
        let document = new this.documentClass({tance: this.tance, schema: this.schema, namespace: this.namespace, id: id, expirySeconds: this.expirySeconds});
        return document.renew();
    }

    async modify(id, changeFn){
        this.throwIfError();
        let document = new this.documentClass({tance: this.tance, schema: this.schema, namespace: this.namespace, id: id});
        let change = await document.modify(changeFn);
        await this.modifyObjectInIndexes(change);
        return change.changed;
    }

    async count(){
        return this.defaultIndex.count();
    }

    async find(args){
        /*
            as this develops this is becoming one of the most complicated parts of our application
            but it's probably useful, I promise

            each index has its own "find" that produces the ID of a redis Set
         */
        if(args.id != null){
            return this.get(args.id);
        }

        // a "null" just means that the index has no opinion on the search whatsoever and should be ignored
        let arrayOfResultSetsWithNulls = await Promise.all(this.indexes.map((index)=>index.find(args)));
        let arrayOfResultSets = arrayOfResultSetsWithNulls.filter(x => x != null);

        if(arrayOfResultSets.length === 0){
            return [];
        }

        // if any of the results are [], return []
        let emptyResults = false;
        arrayOfResultSets.map((resultSet)=>{
            if(Array.isArray(resultSet) && resultSet.length == 0){
                emptyResults = true;
            }
        });
        if(emptyResults){
            return [];
        }

        // if we pass all arrays back, we can intersect them in place and return them
        let isAllArrays = true;
        arrayOfResultSets.map((resultSet)=>{
            if(!Array.isArray(resultSet)) {
                isAllArrays = false;
            }
        });
        if(isAllArrays){
            if(arrayOfResultSets.length === 0){
                return [];
            }
            else if(arrayOfResultSets.length === 1){
                return arrayOfResultSets[0];
            }
            else{
                return arrayOfResultSets.reduce(intersect);
            }
        }

        arrayOfResultSets = await Promise.all(arrayOfResultSets.map(async (resultSet) =>{
            if(resultSet.constructor.name !== "RedisSet"){
                if(Array.isArray(resultSet)){
                    let setObject = new RedisSet({
                        id: `{index-${this.type}-${this.namespace}}-temp-${uuid()}`,
                        tance: this.tance,
                        schema: Schema.Id(),
                        namespace: this.namespace,
                        expirySeconds: 5,
                    });
                    await setObject.add(resultSet);
                    return setObject;
                }
                else{
                    throw new TableError("An index has returned a non RedisSet as a result of a find operation.");
                }
            }
            else{
                return resultSet;
            }
        }));
        let arrayOfResultSetIds = arrayOfResultSets.map(set => set.id);

        // SINTERKLAAS is coming to town
        // SINTER all of the Result Sets together and return the result
        //console.warn(arrayOfResultSetIds);
        let resultIdSet = new Set(await this.tance.sinter(...arrayOfResultSetIds));

        let resultIds = Array.from(resultIdSet);
        let uniqueResultIds = Array.from(new Set(resultIds));

        if(uniqueResultIds.length === 0){
            return [];
        }

        //console.warn(uniqueResultIds);

        // do some paging
        if(args["$n"] != null){
            let offset = 0;
            if(args["$offset"] != null){
                offset = parseInt(args["$offset"], 10);
                if(isNan(offset)){
                    offset = 0;
                }
            }
            let n = parseInt(args["$n"], 10);
            if(isNan(n)){
                n = null;
            }

            if(n != null){
                uniqueResultIds = uniqueResultIds.slice(offset, n+offset);
            }
        }

        //      -- this.tance.mget(...uniqueResultIds);
        // this won't work in Redis Cluster, if the results happen to exist on separate servers
        let serializedResults = await Promise.all(uniqueResultIds.map(id => this.tance.get(id)));

        //console.warn(serializedResults);

        let results = serializedResults.filter(x => x != null).map(x => this.schema.deserializationFn(x));

        // TODO: validate that results match args, sort?

        return results;
    };

    async allKeys(){
        let setOfAllKeysInTable = await this.defaultIndex.find({});
        let keys = await setOfAllKeysInTable.members();
        return keys;
    }

    async clear(){
        let keys = await this.allKeys();
        await Promise.all(keys.map(key => this.tance.del(key)));
        await Promise.all(this.indexes.map(index => index.clear()));
        return;
    }

    async recalculateIndexes(){
        let keys = await this.allKeys();
        await Promise.all(this.indexes.map((index)=>{
            return index.clear();
        }));
        return await Promise.all(keys.map(async (key)=>{
            let keyObj = await this.get(key);
            await this.insertObjectIntoIndexes(keyObj);
        }));
    }

    async index({indexedProperty}){
        let indexList = this.indexes.filter(index => index.indexedProperty === indexedProperty);
        if(indexList.length > 0){
            return indexList[0];
        }
        return null;
    }
}

module.exports = Table;