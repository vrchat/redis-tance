const Index = require("./Index");
const IndexError = require("../Errors").IndexError;
const RedisSet = require("../Primitives/RedisSet");
const Schema = require("../Schema/Schema");
const murmurhash = require('murmurhash');

class SimpleSetIndex extends Index{
    /*
        This index is represented using Redis Sets

        This index can only find exact matches.

        It's most useful when a lot of documents are likely to share the same value.

        It's least useful when a field is totally unique
     */

    constructor({tance, type, indexedProperty, sparse, expirySeconds, namespace=""}){
        super({tance, type, namespace});

        this.indexedProperty = indexedProperty;   //e.g. firstname
        this.sparse = true;
        if(sparse != null && sparse === false){
            this.sparse = false;
        }
        this.expirySeconds = expirySeconds;
    }

    indexKey(indexedParameter){
        // if indexedparameter is not a string, make it into one?
        if(indexedParameter != null && indexedParameter.length != null && indexedParameter.length > 100){
            indexedParameter = murmurhash.v3(indexedParameter);
        }
        return `{index-${this.type}-${this.namespace}}-${this.indexedProperty}:${indexedParameter}`;
    }

    async insertObject(object){
        if(object == null){
            throw new IndexError("Attempting to index null object");
        }
        let indexedParameter = object[this.indexedProperty];

        if(indexedParameter == null){
            if(!this.sparse) {
                throw new IndexError(`Object provided without required index parameter ${this.indexedProperty}`);
            }
            else{
                return null;
            }
        }

        // if the indexed parameter is an array, we got trouble
        if(Array.isArray(indexedParameter)){
            let promises = indexedParameter.map(async (individualParam)=>{
                await this.tance.sadd(this.indexKey(individualParam), object.id);
                await this.tance.sadd(`all-${this.indexKey("")}`, this.indexKey(individualParam));

                // if the object itself expires in 300 seconds, then the index should expire after 300 seconds
                if(this.expirySeconds){
                    await this.tance.expire(this.indexKey(individualParam), this.expirySeconds);
                    await this.tance.expire(`all-${this.indexKey("")}`, this.expirySeconds)
                }
                return;
            });
            return Promise.all(promises);
        }
        else{
            await this.tance.sadd(this.indexKey(indexedParameter), object.id);
            await this.tance.sadd(`all-${this.indexKey("")}`, this.indexKey(indexedParameter));

            // if the object itself expires in 300 seconds, then the index should expire after 300 seconds
            if(this.expirySeconds){
                await this.tance.expire(this.indexKey(indexedParameter), this.expirySeconds);
                await this.tance.expire(`all-${this.indexKey("")}`, this.expirySeconds)
            }
        }

    }

    async deleteObject(object){
        let indexedParameter = object[this.indexedProperty];

        if(indexedParameter == null){
            return null;
        }
        else if(Array.isArray(indexedParameter)){
            let promises = indexedParameter.map(individualParam => this.tance.srem(this.indexKey(individualParam), object.id));
            return Promise.all(promises);
        }
        else{
            await this.tance.srem(this.indexKey(indexedParameter), object.id);
        }
    }

    async modifyObject({original, changed}){
        if(original == null && changed == null){
            return;
        }
        if(original == null){
            return this.insertObject(changed);
        }
        if(changed == null){
            return this.deleteObject(original);
        }

        if(original.id !== changed.id){
            throw new IndexError(`Changing an object id shouldn't ever be OK - ${original.id} to ${changed.id}`);
        }

        let oldIndexedParameter = original[this.indexedProperty];
        let newIndexedParameter = changed[this.indexedProperty];

        if(oldIndexedParameter == null && newIndexedParameter == null){
            return;
        }
        if(oldIndexedParameter == null){
            return this.insertObject(changed);
        }
        if(newIndexedParameter == null){
            return this.deleteObject(original);
        }
        if(Array.isArray(oldIndexedParameter) || Array.isArray(newIndexedParameter)){
            let promises = [
                this.insertObject(changed),
                this.deleteObject(original),
            ];

            return Promise.all(promises);
        }

        // man it's a hot one; like seven inches from the midday sun
        // well, I hear you whispering the words, to melt everyone
        // but you stay so cooooool
        await this.tance.smove(this.indexKey(oldIndexedParameter), this.indexKey(newIndexedParameter), changed.id)
        await this.tance.sadd(`all-${this.indexKey("")}`, this.indexKey(newIndexedParameter));
        if(this.expirySeconds != null){
            await this.tance.expire(this.indexKey(newIndexedParameter), this.expirySeconds);
            await this.tance.expire(`all-${this.indexKey("")}`, this.expirySeconds)
        }
    }

    async find(args){
        if(args[this.indexedProperty] == null){
            return null;
        }

        return new RedisSet({
            tance: this.tance,
            id: this.indexKey(args[this.indexedProperty]),
            schema: Schema.Id(this.expirySeconds),
            namespace: this.namespace,
            expirySeconds: this.expirySeconds
        });

        /*
        if(args.n != null){
            //offsets don't make sense in the context of an unsorted set, so we just get you n random objects from the set
            return this.tance.srandmember(this.indexKey(args[this.indexedProperty]), args.n);
        }
        else{
            return this.tance.smembers(this.indexKey(args[this.indexedProperty]));
        }
        */
    }

    async clear(){
        await this.tance.del(this.indexKey());
        let allKeys = await this.tance.smembers(`all-${this.indexKey("")}`);
        return Promise.all(allKeys.map(key => this.tance.del(key)));
    }
}

module.exports = SimpleSetIndex;
