'use strict';

/*
    MigratingSchema.js

    DA BOSS ORK WANTS YOU TA VALADATE THA DATAZ, YOU NOBS

    A MigratingSchema represents a database table's schema.
    "Why not just call it schema?"

    Well, the MigratingSchema's a more complicated document that contains potentially *multiple* schema.

    It's versioned, so if an object's schema changes while live data exists,
    you can add a new version to the schema - as well as an x => x function
    for converting an object from the old schema to an object from the new schema
 */
const Validator = require('jsonschema').Validator;
const SchemaError = require('../Errors').SchemaError;

class MigratingSchema{

    constructor({type, expirySeconds, v1}){
        /*
            type: what's the name of this schema? "Employee", "world", "user_address"?
            expirySeconds: (optional) how long should objects of this type live, in seconds?
            v1: (optional) what's the first schema? most objects won't even need a second version.
         */

        if(type == null){
            throw new SchemaError("Cannot create MigratingSchema without a type");
        }

        this.type = type;
        this.expirySeconds = expirySeconds;
        this.schema = [{}];
        this.upgradeFns = [x=>x];
        this.currentVersion = 0;

        if(v1 != null){
            this.addVersion(v1, x => x);
        }
    }

    isSchema(){
        // an inadequate blood supply to an organ or part of the body, especially the heart muscles.
        return true;
    }

    get(version){
        if(version == null){
            version = this.currentVersion;
        }
        return this.schema[version];
    }

    validateSchema(schema){
        // the schema itself might have troubs

        if(schema.properties['id'] == null ||
            schema.properties['type'] == null ||
            schema.properties['version'] == null){
            throw new SchemaError("All migrating schema must have properties for id, type, and version");
        }

        return schema;
    }

    addVersion(schema, upgradeFn){
        if(schema == null){
            throw new SchemaError("Cannot create schema without ... schema");
        }
        if(this.schema.length > 0 && upgradeFn == null){
            throw new SchemaError("Cannot add schema version without upgrade function");
        }
        this.validateSchema(schema);
        this.schema.push(schema);
        this.upgradeFns.push(upgradeFn);
        this.currentVersion += 1;

        /*
        console.warn(JSON.stringify(this.schema));
        console.warn(this.upgradeFns);
        console.warn(this.currentVersion);
        */
    }

    upgrade(object){
        /*
            if the object is not equivalent to its current version in the schema, upgrade it
            until it IS equivalent to its current version in the schema
         */
        if(object.version == null){
            throw new SchemaError("Object without version won't pass any schema");
        }
        if(object.version >= this.currentVersion){
            // nothing needs to change, we're already good to go
            return object;
        }

        // console.warn(`version is ${object.version}, looking for ${this.currentVersion}`);

        let version = object.version + 1;
        let newObject = this.upgradeFns[version](object);
        newObject.version = version;

        if(!this.isValid(newObject)){
            throw new SchemaError(`Validation error when trying to upgrade object ${JSON.stringify(newObject)} ` +
                ` to version ${newObject.version}: ${this.errors(newObject)}`);
        }

        return this.upgrade(newObject);
    }

    validate(object){
        if(object.version == null){
            throw new SchemaError("Object without version won't pass any schema");
        }

        var v = new Validator();

        return v.validate(object, this.schema[object.version]);
    }

    errors(object){
        let result = this.validate(object);
        let errors = result.errors.join(", ");
        return errors;
    }

    isValid(object){
        let results = this.validate(object);

        return results.errors.length === 0;
    }

    serialize(){
        /*
            convert the entire schema into a string
         */

        let stringifyFn = (key, val) => {
            if(typeof(val) === 'function'){
                return val + "";
            }
            else{
                return val;
            }
        };

        return JSON.stringify(this, stringifyFn, 4);
    }

    serializationFn(...args){
        let schema = this.get();
        if(schema.type != null &&
            schema.type.toLowerCase() === "number" ||
            schema.type.toLowerCase() === "integer" ||
            schema.type.toLowerCase() === "string"){
            if(args == null){
                return x=>x;
            }
            else{
                return args[0];
            }
        }
        if(args == null){
            return JSON.stringify;
        }
        else{
            return JSON.stringify(...args);
        }
    }

    deserializationFn(...args){
        let schema = this.get();
        if(schema.type != null &&
            schema.type.toLowerCase() === "number" ||
            schema.type.toLowerCase() === "integer" ||
            schema.type.toLowerCase() === "string"){
            if(args == null){
                return x=>x;
            }
            else{
                return args[0];
            }
        }
        if(args == null){
            return JSON.parse;
        }
        else{
            return JSON.parse(...args);
        }
    }

    static deserialize(schemaString){
        let schemaUnpacked = JSON.parse(schemaString);

        let skeem = new MigratingSchema({type: schemaUnpacked.type, expirySeconds: schemaUnpacked.expirySeconds});
        let schemas = schemaUnpacked.schema.slice(1);
        let functions = schemaUnpacked.upgradeFns.slice(1);

        schemas.forEach((schema, i) => {
            skeem.addVersion(schema, eval(functions[i]));
        });

        return skeem;
    }

}

module.exports = MigratingSchema;
