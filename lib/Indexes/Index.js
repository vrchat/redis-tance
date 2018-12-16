'use strict';

class Index{
    constructor({tance, type, namespace}){
        this.tance = tance;
        this.type = type;
        this.namespace = namespace;
    }

    async insertObject(object){
        return object;
    }

    async modifyObject(object){
        return object;
    }

    async deleteObject(object){
        return object;
    }

    async find(args){
        return null;
    }

    async clear(){
        return null;
    }

    static createIndexFromSchema({tance, property, schema, namespace}){

        let schemaVersion = schema.get();
        let type = schema.type;
        let expirySeconds = schema.expirySeconds || null;

        let properties = schemaVersion.properties;
        let required = schemaVersion.required || [];

        let propertySet = new Set(Object.keys(schemaVersion.properties));
        let requiredPropertySet = new Set(required);

        if(!propertySet.has(property)){
            throw new IndexError(`Trying to create index for property ${property} in schema that doesn't have ${property}`);
        }
        let sparse = true;
        if(requiredPropertySet.has(property)){
            sparse = false;
        }

        if(schemaVersion.properties[property] == null){
            throw new IndexError(`Trying to create index for property ${property} in schema that doesn't have ${property}`);
        }
        if(schemaVersion.properties[property].index == null){
            return null;
        }

        let indexType = schemaVersion.properties[property].index;

        switch(indexType) {
            case 'simple':
                const SimpleSetIndex = require('./SimpleSetIndex');
                return new SimpleSetIndex({tance, type, indexedProperty:property, sparse, expirySeconds, namespace});
            default:
                throw new IndexError(`Unknown index type ${indexType}`);
        }

    }
}

module.exports = Index;

