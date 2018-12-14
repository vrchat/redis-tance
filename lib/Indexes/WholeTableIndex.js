const Index = require("./Index");
const IndexError = require("../Errors").IndexError;

class WholeTableIndex extends Index{
    /*
        This index is for the entire table
     */

    constructor({tance, type, expirySeconds, disableFullTableSearch, namespace}){
        super({tance, type, namespace});

        this.expirySeconds = expirySeconds;
        this.disableFullTableSearch = disableFullTableSearch;
    }

    indexKey(){
        return `index-${this.type}-${this.namespace}-table`;
    }

    async insertObject(object){
        await this.tance.sadd(this.indexKey(), object.id);

        // if the object itself expires in 300 seconds, then the index should expire after 300 seconds
        if(this.expirySeconds){
            this.tance.expire(this.indexKey(), this.expirySeconds);
        }
    }

    async deleteObject(object){
        await this.tance.srem(this.indexKey(), object.id);
    }

    async modifyObject({original, changed}){
        if(original.id !== changed.id){
            throw new IndexError(`Changing an object id shouldn't ever be OK - ${original.id} to ${changed.id}`);
        }

        // no change required, it's still in the table, right?

        return;
    }

    async find(args){
        // obviously we don't always want to even be _allowed_ to do a full table scan
        if(this.disableFullTableSearch === true){
            return null;
        }

        if(args.n != null){
            //offsets don't make sense in the context of an unsorted set, so we just get you n random objects from the set
            return this.tance.srandmember(this.indexKey(), args.n);
        }
        else{
            return this.tance.smembers(this.indexKey());
        }
    }

    async count(){
        return this.tance.scard(this.indexKey());
    }
}

module.exports = WholeTableIndex;
