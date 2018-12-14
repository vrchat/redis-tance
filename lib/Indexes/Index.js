
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
}

module.exports = Index;

