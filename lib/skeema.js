/*
    skeema.js

    DA BOSS ORK WANTS YOU TA VALADATE THA DATAZ, YOU NOBS

    this represents an object's schema
 */
const Validator = require('jsonschema').Validator;


class Skeema{

    constructor(){
        this.schema = [{}];
        this.upgradeFns = [x=>x];
        this.currentVersion = 0;
    }

    isSchema(){
        // an inadequate blood supply to an organ or part of the body, especially the heart muscles.
        return true;
    }

    addVersion(schema, upgradeFn){
        if(schema == null){
            throw new Error("Cannot create schema without ... schema");
        }
        if(this.schema.length > 0 && upgradeFn == null){
            throw new Error("Cannot add schema version without upgrade function");
        }
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
            throw new Error("Object without version won't pass any schema");
        }
        if(object.version === this.currentVersion){
            // nothing needs to change, we're already good to go
            return object;
        }

        // console.warn(`version is ${object.version}, looking for ${this.currentVersion}`);

        let version = object.version + 1;
        let newObject = this.upgradeFns[version](object);
        newObject.version = version;

        if(!this.isValid(newObject)){
            throw new Error(`Validation error when trying to upgrade object ${JSON.stringify(newObject)} to version ${newObject.version}`);
        }

        return this.upgrade(newObject);
    }

    validate(object){
        if(object.version == null){
            throw new Error("Object without version won't pass any schema");
        }

        var v = new Validator();

        return v.validate(object, this.schema[object.version]);
    }

    isValid(object){
        let results = this.validate(object);

        return results.errors.length === 0;
    }

}

module.exports = Skeema;
