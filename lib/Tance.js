'use strict';

const crypto = require('crypto');
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
const ExpiringSet = require('./Primitives/ExpiringSet');
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
            if(command === 'multi'){
                 // don't do multi, it has a non-callback result
                this[command] = (...args) => {
                    if(verbose === true){
                        console.info(`${command} ${args.join(" ")}`);
                    }
                    let fn = this.redis_client[command].bind(this.redis_client);
                    let multi = fn(args);
                    let multi_exec = multi.exec;
                    multi_exec = multi_exec.bind(multi);

                    multi.exec = async () => {
                        return new Promise((resolve, reject) => {
                            multi_exec((err, results)=>{
                                if(err){
                                    reject(err);
                                }
                                else{
                                    resolve(results);
                                }
                            })
                        })
                    };

                    return multi;
                }
            }
            else if(this.redis_client[command] != null){
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

    expiringSet(args){
        args.tance = this;
        return new ExpiringSet(args);
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
                .filter(key => args[0][key] != null)
                .map(key => `${key}_${JSON.stringify(args[0][key])}`);
            noCache = !!args[0].noCache;
        } else if(Array.isArray(args)){
            values = args;
        } else {
            values = Object
                .keys(args)
                .sort()
                .filter(key => !setOfArgsToIgnore.has(key))
                .filter(key => args[key] != null)
                .map(key => `${key}_${JSON.stringify(args[key])}`);
            noCache = !!args.noCache;
        }

        if(noCache){
            return fn.apply(fn, args);
        }

        let searchId = values.filter(x => x != null).join("_");

        //console.info("cache key:", searchId);

        let searchIdHash = murmurhash.v3(searchId);
        let searchIdSha1 = crypto.createHash("sha1").update(searchId).digest("hex");

        //console.info("cache hash:", searchIdHash);

        return { murmur: searchIdHash, sha1: searchIdSha1 };
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
            let indexKey = `${fnName}_keys_${this._argsToKey(newObject).murmur}`;

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
                noCache = !!args[0].noCache;
            } else {
            }

            if(noCache){
                return fn.apply(fn, args);
            }

            let searchIdHashes = this._argsToKey(args, ignoreArgs);
            let searchIdMurm = searchIdHashes.murmur;
            let searchIdSha1 = searchIdHashes.sha1;

            let results = await this.mget(`${fnName}_${searchIdSha1}`, `${fnName}_${searchIdMurm}`);

            // Check for first non-null result. Sha1 will always return before murmur if both exist.
            for (const result of results) {
              if (result == null) {
                continue;
              }

              //console.info("cache HIT:", searchId, result);
              let deserializedResult = deserializationFn(result);
              return Promise.resolve(deserializedResult);
            }

            // If neither result exists, fall back to provided get fn, and store as sha1.
            //console.info("cache MISS: ", searchId);
            let returnVal = await fn.apply(fn, args);
            let serializedReturnVal = serializationFn(returnVal);
            await this.set(`${fnName}_${searchIdSha1}`, serializedReturnVal, 'EX', durationInSeconds);
            await this._indexItemOnEntry(args, fnName, `${fnName}_${searchIdSha1}`, durationInSeconds);
            await this.sadd(`${fnName}_keys`, `${fnName}_${searchIdSha1}`);
            await this.expire(`${fnName}_keys`, durationInSeconds);
            return Promise.resolve(returnVal);
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
            let indexKey = `${fnName}_keys_${this._argsToKey(newObject).murmur}`;

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

        let searchIdHashes = this._argsToKey(args);
        let searchIdMurm = searchIdHashes.murmur;
        let searchIdSha1 = searchIdHashes.sha1;

        return this.del(`${fnName}_${searchIdMurm}`, `${fnName}_${searchIdSha1}`);
    };

    async multiAsync(...commands){
        return new Promise(async (resolve, reject) => {
            let multi = this.multi(commands);
            console.warn(multi);
            multi.exec((err, replies)=>{
                if(err){
                    reject(err);
                }
                else{
                    resolve(replies);
                }
            })
        })
    }

    async sload(key, ...loadables){
        /*
            SADD has a problem: past about 1K entries, the SADD operation starts to slow down the rest of the server.
            For cases like that, we have SLOAD, which is a series of successive, batched SADD operations
         */

        if(loadables.length <= 0){
            return Promise.resolve();
        }
        if(loadables.length < 1000){
            return this.sadd(key, ...loadables);
        }
        else{
            let firstThousandLoadables = loadables.splice(0, 1000);
            return this.sadd(key, ...firstThousandLoadables).then(()=>{
                return this.sload(key, ...loadables);
            })
        }
    }
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
