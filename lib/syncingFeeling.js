/*
    syncingFeeling.js

    this represents an object in redis that we can modify with x=>x transitions
 */

class syncingFeeling{

    constructor(tance, id, schema){
        this.tance = tance;
        this.id = id;
        this.schema = schema;
    }

    async create(object, expiry){
        // create the object

    }

    async get(){
        // given the ID, produce the object
    }

    async modify(changeFn){
        // changeFn is an x=>x transformation on the object

    }

    async delete(){
        // given
    }


}

module.exports = syncingFeeling;