'use strict';

/*
    Schema
 */
const Validator = require('jsonschema').Validator;
const SchemaError = require('../Errors').SchemaError;

class Schema{

    constructor({type, expirySeconds, schema}){
        /*
            type: what's the name of this schema? "Employee", "world", "user_address"?
            expirySeconds: (optional) how long should objects of this type live, in seconds?
            schema: what's the schema?
         */

        if(type == null){
            throw new SchemaError("Cannot create Schema without a type");
        }
        if(schema == null){
            throw new SchemaError("Cannot create Schema without a ... schema");
        }

        this.type = type;
        this.expirySeconds = expirySeconds;
        this.schema = schema;
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

    upgrade(object){
        return object;
    }

    validate(object){
        var v = new Validator();

        return v.validate(object, this.schema);
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
        return JSON.stringify(this);
    }

    serializationFn(...args){
        let schema = this.schema;
        if(schema.type != null &&
            schema.type.toLowerCase() === "id" ||
            schema.type.toLowerCase() === "number" ||
            schema.type.toLowerCase() === "integer" ||
            schema.type.toLowerCase() === "string"){
            if(args == null){
                return x => x;
            }
            else{
                return args[0];
            }
            return x=>x
        }
        if(args == null){
            return JSON.stringify;
        }
        else{
            return JSON.stringify(...args)
        }
    }

    deserializationFn(...args){
        let schema = this.schema;
        if(schema.type != null &&
            schema.type.toLowerCase() === 'id'){
            if(args == null){
                return x=>x;
            }
            else{
                return args[0];
            }
        }
        if(schema.type != null &&
            schema.type.toLowerCase() === "string"){
            if(args == null){
                return x=>x;
            }
            else{
                return args[0];
            }
        }
        else if(schema.type != null &&
            schema.type.toLowerCase() === "number"){
            if(args == null){
                return parseFloat;
            }
            else{
                return parseFloat(args[0]);
            }
        }
        else if(schema.type != null &&
            schema.type.toLowerCase() === "integer"){
            if(args == null){
                return x=>parseInt(x, 10);
            }
            else{
                return parseInt(args[0], 10);
            }
        }
        else{
            if(args == null){
                return JSON.parse;
            }
            else{
                return JSON.parse(...args);
            }
        }
    }

    static deserialize(schemaString){
        let schemaUnpacked = JSON.parse(schemaString);

        let schema = new Schema({type: schemaUnpacked.type, expirySeconds: schemaUnpacked.expirySeconds, schema: schemaUnpacked.schema});

        return schema;
    }

    static Id(expirySeconds){
        /*
            describes a UUID - like "123e4567-e89b-12d3-a456-426655440000"
            can also include a prefix, like "sandwich-123e4567-e89b-12d3-a456-426655440000"
         */
        let idSchema = {
            "type": "string",
            "pattern": "[{}A-Za-z0-9-_]*\\b[0-9a-f]{8}\\b-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-\\b[0-9a-f]{12}\\b"
        };
        return new Schema({type: "Id", schema: idSchema, expirySeconds})
    }

    static String(expirySeconds){
        let stringSchema = {
            "type": "string",
        };
        return new Schema({type: "String", schema: stringSchema, expirySeconds})
    }

    static Number(expirySeconds){
        let numberSchema = {
            "type": "number",
        };
        return new Schema({type: "Number", schema: numberSchema, expirySeconds})
    }

    static Integer(expirySeconds){
        let numberSchema = {
            "type": "integer",
        };
        return new Schema({type: "Integer", schema: numberSchema, expirySeconds})
    }

}

module.exports = Schema;
