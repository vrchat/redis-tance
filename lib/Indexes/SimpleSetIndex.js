const Index = require("./Index");
const IndexError = require("../Errors").IndexError;

class SimpleSetIndex extends Index{
    /*
        This index is represented using Redis Sets

        This index can only find exact matches.
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
        return `index-${this.type}-${this.namespace}-${this.indexedProperty}:${indexedParameter}`;
    }

    async insertObject(object){
        let indexedParameter = object[this.indexedProperty];

        if(indexedParameter == null){
            if(!this.sparse) {
                throw new IndexError(`Object provided without required index parameter ${this.indexedProperty}`);
            }
            else{
                return null;
            }
        }

        await this.tance.sadd(this.indexKey(indexedParameter), object.id);

        // if the object itself expires in 300 seconds, then the index should expire after 300 seconds
        if(this.expirySeconds){
            this.tance.expire(this.indexKey(indexedParameter), this.expirySeconds);
        }
    }

    async deleteObject(object){
        let indexedParameter = object[this.indexedProperty];

        if(indexedParameter == null){
            return null;
        }

        await this.tance.srem(this.indexKey(indexedParameter), object.id);
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

        // man it's a hot one; like seven inches from the midday sun
        // well, I hear you whispering the words, to melt everyone
        // but you stay so cooooool
        await this.tance.smove(this.indexKey(oldIndexedParameter), this.indexKey(newIndexedParameter), changed.id)
    }

    async find(args){
        if(args[this.indexedProperty] == null){
            return null;
        }

        if(args.n != null){
            //offsets don't make sense in the context of an unsorted set, so we just get you n random objects from the set
            return this.tance.srandmember(this.indexKey(args[this.indexedProperty]), args.n);
        }
        else{
            return this.tance.smembers(this.indexKey(args[this.indexedProperty]));
        }
    }
}

module.exports = SimpleSetIndex;
