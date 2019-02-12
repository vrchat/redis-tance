'use strict';

const redis = require('redis');
const commands = require('redis-commands');
const util = require('util');
const uuid = require('uuid/v4');
const murmurhash = require('murmurhash');
const Table = require('./Table');
const Errors = require('./Errors');
const Schema = require('./Schema/Schema');
const MigratingSchema = require('./Schema/MigratingSchema');
const Document = require('./Primitives/Document');
const LockingDocument = require('./Primitives/LockingDocument');
const RedisSet = require('./Primitives/RedisSet');
const RedisStream = require('./Primitives/RedisStream');

// the default cache duration is 180 seconds, the scientifically correct amount of
//     time to cache literally anything.
const DEFAULT_DURATION_IN_SECONDS = 180;

redis.add_command('xadd');
redis.add_command('xtrim');
redis.add_command('xrange');
redis.add_command('xinfo');
redis.add_command('xdel');
redis.add_command('xlen');
redis.add_command('xread');
redis.add_command('xgroup');
redis.add_command('xreadgroup');
redis.add_command('xack');
redis.add_command('xclaim');
redis.add_command('xpending');

class Tance{

    constructor(redisClient, verbose){

        if(verbose == null){
            verbose = process.env.TANCE_VERBOSE != null;
        }

        this.redis_client = redisClient;
        this.isConnect = false;
        this.isReady = false;
        this.redis_client.on('connect', ()=>{
            this.isConnect = true;
        });
        this.redis_client.on('ready', ()=>{
            this.isReady = true;
        });
        this.indexes = {};
        this.durations = {};
        commands.list.forEach((command)=>{
            if(this.redis_client[command] != null){
                //console.log(`promisifiying ${command}`);
                this[command] = (...args) => {
                    if(verbose === true){
                        console.info(`${command} ${args.join(" ")}`);
                    }
                    let fn = util.promisify(this.redis_client[command]).bind(this.redis_client);
                    return fn(args);
                }
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

    document(args){
        args.tance = this;
        return new Document(args);
    }

    lockingDocument(args){
        args.tance = this;
        return new LockingDocument(args);
    }

    redisSet(args){
        args.tance = this;
        return new RedisSet(args);
    }

    _argsToKey(args, argsToIgnore){
        /*
            convert a functions arguments into a stable search key
            {b: 2, a: 1} => a_1_b_2

            if your first arg is an object, assumes a function of style ({a, b, c})
            if you write a function that takes (object, object, object), this'll bite you

         */
        let values = [];
        let noCache = false;
        if(argsToIgnore == null){
            argsToIgnore = [];
        }
        let setOfArgsToIgnore = new Set(argsToIgnore);
        if(typeof(args[0]) === 'object'){
            values = Object
                .keys(args[0])
                .sort()
                .filter(key => !setOfArgsToIgnore.has(key))
                .map(key => `${key}_${JSON.stringify(args[0][key])}`);
            noCache = args[0].noCache != null;
        } else if(Array.isArray(args)){
            values = args;
        } else {
            values = Object.keys(args).sort().map(key => `${key}_${JSON.stringify(args[key])}`);
            noCache = args.noCache != null;
        }

        if(noCache){
            return fn.apply(fn, args);
        }

        let searchId = values.filter(x => x != null).join("_");

        //console.info("cache key:", searchId);

        let searchIdHash = murmurhash.v3(searchId);

        //console.info("cache hash:", searchIdHash);

        return searchIdHash;
    }

    cacheIndex(keys, name){
        // let's imagine we wanted to be able to delete all fruit searches that shared the same color
        // we could go `tance.cacheIndex(['color'], '_getFruits');
        // then, if we call `tance.clearCache({'color': 'pink'}, '_getFruits), it'll clear all searches
        //   with color pink, even ones that included _other parameters_.

        if(this.indexes[name] == null){
            this.indexes[name] = [];
        }

        this.indexes[name].push(keys);
    };

    async _indexItemOnEntry (searchObject, fnName, cachedSearchKey, duration) {
        // having created an index with cacheIndex, this puts a new search into the index
        if(this.indexes[fnName] == null){
            // there's no index on this function at all
            // console.warn(`not indexing ${fnName} because no indexes are present`);
            return;
        }

        if(Array.isArray(searchObject)){
            searchObject = searchObject[0];
        }

        // console.warn(`searchObject: ${JSON.stringify(searchObject)}`);

        return Promise.all(this.indexes[fnName].map((keys) => {
            let newObject = {};

            keys.forEach((key) => {
                if(searchObject[key] != null){
                    newObject[key] = searchObject[key];
                }
            });

            // at this point we have a new object that only contains the keys of the index
            /*
                i.e., if we have
                { "authorId": "usr_222...",
                  "releaseStatus": "public",
                  "n": "10",
                  "offset": "0"}
                and an index of ["authorId", "releaseStatus"],
                we create:
                newObject = {
                    "authorId": "usr_222..."
                    "releaseStatus": "public"
                }
             */

            let newKeys = Object.keys(newObject);

            if(newKeys.length === 0){
                // we have nothing worth indexing in this search
                // console.warn(`not indexing ${fnName} because ${newKeys} is empty`);

                return;
            }

            // this would give us _searchWorlds_keys_authorId_usr_222_releaseStatus_public
            let indexKey = `${fnName}_keys_${this._argsToKey(newObject)}`;

            // console.info(`creating index key: ${indexKey}, putting ${cachedSearchKey} in it`);

            // and this will put that search in that index, that we might clear it later
            let promises = [];
            promises.push(this.sadd(indexKey, cachedSearchKey))
            promises.push(this.expire(indexKey, duration));
            return Promise.all(promises);
        }));
    };

    // this function should be able to wrap an arbitrary function in a caching layer
    cache(fn, durationInSeconds, fnName, serializationFn, deserializationFn, ignoreArgs){

        if(fnName == null){
            fnName = fn.name;
        }
        if(fnName == null || fnName === ''){
            fnName = uuid();
        }

        this.durations[fnName] = durationInSeconds;

        if(serializationFn == null){
            serializationFn = x => x;
        }

        if(deserializationFn == null){
            deserializationFn = x => x;
        }

        //console.log("Creating cache function for "+fnName);
        if(fn == null){
            throw(new Error("Cache called with null function"));
        }

        return async (...args) => {

            if(durationInSeconds == null){
                durationInSeconds = DEFAULT_DURATION_IN_SECONDS;
            }

            let noCache = false;
            if(typeof(args[0]) === 'object'){
                noCache = args[0].noCache != null;
            } else {
            }

            if(noCache){
                return fn.apply(fn, args);
            }

            let searchIdHash = this._argsToKey(args, ignoreArgs);

            let result = await this.get(`${fnName}_${searchIdHash}`);

            if(result == null){
                //console.info("cache MISS: ", searchId);
                let returnVal = await fn.apply(fn, args);
                let serializedReturnVal = serializationFn(returnVal);
                await this.set(`${fnName}_${searchIdHash}`, serializedReturnVal, 'EX', durationInSeconds);
                await this._indexItemOnEntry(args, fnName, `${fnName}_${searchIdHash}`, durationInSeconds);
                await this.sadd(`${fnName}_keys`, `${fnName}_${searchIdHash}`);
                await this.expire(`${fnName}_keys`, durationInSeconds);
                return Promise.resolve(returnVal);
            }
            else {
                //console.info("cache HIT:", searchId, result);
                let deserializedResult = deserializationFn(result);
                return Promise.resolve(deserializedResult);
            }
        };
    };

    cacheFn({fn, durationInSeconds, fnName, serializationFn, deserializationFn, ignoreArgs}){
        return this.cache(fn, durationInSeconds, fnName, serializationFn, deserializationFn, ignoreArgs);
    }

    async clearCacheIndex(args, fnName){
        if(this.indexes[fnName] == null || this.indexes[fnName].length === 0){
            return Promise.resolve();
        }
        return Promise.all(this.indexes[fnName].map(async (keys) => {
            let newObject = {};

            keys.forEach((key) => {
                if (args[key] != null) {
                    newObject[key] = args[key];
                }
            });

            let newKeys = Object.keys(newObject);

            if (newKeys.length === 0) {
                // we have nothing worth indexing in this search
                return;
            }

            if (Object.keys(args).length !== newKeys.length){
                return;
            }

            // this would give us _searchWorlds_keys_authorId_usr_222_releaseStatus_public
            let indexKey = `${fnName}_keys_${this._argsToKey(newObject)}`;

            // console.warn(`looking at index key ${indexKey}`);
            let keysToDelete = await this.smembers(indexKey);
            // console.warn(`deleting keys ${keysToDelete}`);

            if(this.durations[fnName] != null){
                await this.expire(indexKey, this.durations[fnName]);
            }
            else{
                await this.del(indexKey);
            }
            let promises = keysToDelete.map(key => this.del(key));
            return Promise.all(promises);
        }));
    };

    async clearCache(args, fnName){
        if(args == null){
            let keysToClear = await this.smembers(`${fnName}_keys`);
            keysToClear.push(`${fnName}_keys`);
            let promises = keysToClear.map(key => this.del(key));
            return Promise.all(promises);
        }

        await this.clearCacheIndex(args, fnName);

        let searchIdHash = this._argsToKey(args);

        return this.del(`${fnName}_${searchIdHash}`);
    };
};

module.exports = {
    Tance,
    Schema,
    MigratingSchema,
    Table,
    Errors,
    Document,
    LockingDocument,
    RedisSet,
    RedisStream,
};
