'use strict';

const redis = require('redis');
const commands = require('redis-commands');
const util = require('util');
const uuid = require('uuid/v4');

// the default cache duraiton is 180 seconds, the scientifically correct amount of
//     time to cache literally anything.
const DEFAULT_DURATION = 180;

class Tance{

    constructor(redisClient){
        this.redis_client = redisClient;
        this.isConnect = false;
        this.isReady = false;
        this.redis_client.on('connect', ()=>{
            this.isConnect = true;
        });
        this.redis_client.on('ready', ()=>{
            this.isReady = true;
        });
        commands.list.forEach((command)=>{
            if(this.redis_client[command] != null){
                //console.log(`promisifiying ${command}`);
                this[command] = util.promisify(this.redis_client[command]).bind(this.redis_client);
            } else {
                //console.warn(`${command} is not supported by redisClient`)
            }
        });
    }

    async connect(){
        if(this.isConnect){
            return Promise.resolve();
        }

        return new Promise((resolve, reject)=>{
            this.redis_client.on('connect', ()=>{
                this.isConnect = true;
                resolve();
            });
        });
    }
    async ready(){
        if(this.isReady){
            return Promise.resolve();
        }

        return new Promise((resolve, reject)=>{
            this.redis_client.on('ready', ()=>{
                this.isReady = true;
                resolve();
            });
        });
    }

    // this function should be able to wrap an arbitrary function in a caching layer
    cache(fn, duration, name, serializationFn, deserializationFn){

        if(name == null){
            name = fn.name;
        }
        if(name == null || name === ''){
            name = uuid.v4();
        }

        if(serializationFn == null){
            serializationFn = x => x;
        }

        if(deserializationFn == null){
            deserializationFn = x => x;
        }

        //console.log("Creating cache function for "+name);
        if(fn == null){
            throw(new Error("Cache called with null function"));
        }

        return async (...args) => {

            if(duration == null){
                duration = DEFAULT_DURATION;
            }

            let values = [];
            let noCache = false;
            if(typeof(args[0]) === 'object'){
                values = Object.keys(args[0]).sort().map(key => args[0][key]);
                noCache = args[0].noCache != null;
            } else {
                values = args;
            }

            if(noCache){
                return fn.apply(fn, args);
            }

            let searchId = values.filter(x => x != null).join("_");

            //console.info("cache key:", searchId);

            let searchIdHash = murmurhash.v3(searchId);

            let result = await this.get(`${name}_${searchIdHash}`);

            if(result == null){
                //console.info("cache MISS: ", searchId);
                let returnVal = await fn.apply(fn, args);
                let serializedReturnVal = serializationFn(returnVal);
                await this.set(`${name}_${searchIdHash}`, serializedReturnVal, 'EX', duration);
                await this.sadd(`${name}_keys`, `${name}_${searchIdHash}`);
                await this.expire(`${name}_keys`, duration);
                return Promise.resolve(serializedReturnVal);

            }
            else {
                //console.info("cache HIT:", searchId);
                let deserializedResult = deserializationFn(result);
                return Promise.resolve(deserializedResult);
            }
        };
    };

    async clearCache(args, name){
        if(args == null){
            let keysToClear = await this.smembers(`${name}_keys`);
            keysToClear.push(`${name}_keys`);
            let promises = keysToClear.map(key => this.del(key));
            return Promise.all(promises);
        }

        let values = [];
        if(typeof(args[0]) === 'object') {
            values = Object.keys(args[0]).sort().map(key => args[0][key]);
        } else if(typeof(args) === 'object'){
            values = Object.keys(args).sort().map(key => args[key]);
        } else {
            values = args;
        }

        let searchId = values.filter(x => x != null).join("_");

        console.info("cache clear: ", searchId);

        let searchIdHash = murmurhash.v3(searchId);

        return this.del(`${name}_${searchIdHash}`);
    };
};

module.exports = {
    Tance
};
