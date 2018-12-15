const Index = require("./Index");
const IndexError = require("../Errors").IndexError;

class IntegerIndex extends Index{
    /*
        This index is represented using Redis ZSets

        This index can find values greater than a value, less then a value, uh... that kind of thing.
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

    indexKey(){
        return `index-${this.type}-${this.namespace}-${this.indexedProperty}:integer`;
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

        if(!Number.isInteger(indexedParameter)){
            throw new IndexError(`Trying to put a non-integer value ${this.indexedProperty} into an integer index`);
        }

        await this.tance.zadd(this.indexKey(), indexedParameter, object.id);

        // if the object itself expires in 300 seconds, then the index should expire after 300 seconds
        if(this.expirySeconds){
            this.tance.expire(this.indexKey(), this.expirySeconds);
        }
    }

    async deleteObject(object){
        await this.tance.zrem(this.indexKey(), object.id);
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

        await this.insertObject(changed);
    }

    async find(args){
        if(args[this.indexedProperty] == null){
            return null;
        }
        //TODO: put something here I guess
    }

    async clear(){
        return this.tance.del(this.indexKey());
    }
}

module.exports = SimpleSetIndex;
