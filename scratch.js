//const uuid = require('node-uuid');
//const murmurhash = require('murmurhash');
//const util = require('util');

// the default cache duraiton is 180 seconds, the scientifically correct amount of
//     time to cache literally anything.
const DEFAULT_CACHE_DURATION = 180;


/*
 * This class wraps redis calls with ES5 promises..
 *
 */
class Tance {
    constructor(redisUri, options){
        this.redis_client = redis_client;

        // For each function of the standard redis client, replace it with a function that returns an ES6 Promise
        operations.forEach((op)=>{
            if(this.redis_client[op] != null){
                this[op] = util.promisify(this.redis_client[op]).bind(this.redis_client);
            } else {
                console.warn(`${op} is not supported by redisClient`)
            }
        });

        // this function should be able to wrap any function (that produces a serialized result) in a caching layer
        this.cache = (fn, duration, name) => {

            if(name == null){
                name = fn.name;
            }
            if(name == null || name === ''){
                name = uuid.v4();
            }
            if(fn == null){
                throw(new Error("Cache called with null function. Serious problem, yo."));
            }

            console.info("Creating cache function for "+name);

            return (...args) => {

                if(duration == null){
                    duration = DEFAULT_CACHE_DURATION;
                }

                let values = [];
                let noCache = false;
                if(typeof(args[0]) === 'object') {
                    values = Object.keys(args[0]).sort().map(key => args[0][key]);
                    noCache = args[0].noCache != null;
                } else {
                    values = args;
                }

                if(noCache){
                    return fn.apply(fn, args);
                }

                let searchId = values.filter(x => x != null).join("_");

                console.info("cache key:", searchId);

                let searchIdHash = murmurhash.v3(searchId);

                return this.get(`cache_${name}_${searchIdHash}`)
                    .then((result)=>{
                        if(result == null){
                            console.info("cache miss: ", searchId);
                            return fn.apply(fn, args)
                                .then((serializedReturnVal)=>{
                                    this.set(`cache_${name}_${searchIdHash}`, serializedReturnVal, 'EX', duration)
                                        .catch((err)=>{
                                            console.error(err);
                                        });
                                    this.sadd(`${name}_keys`, `${name}_${searchIdHash}`)
                                        .catch((err)=>{
                                            console.error(err);
                                        });
                                    return Promise.resolve(serializedReturnVal);
                                });

                        }
                        else {
                            console.info("cache HIT:", searchId);
                            return Promise.resolve(result);
                        }
                    });
            };
        };

        this.clearCache = (args, name) => {
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
    }
}

/*
 * Creates a PromiseRedisClient and returns a Promise that triggers when it's ready.
 */
const createClient = ({redisUri, prefix, serverName}) =>{
    if(redisUri.toLowerCase() === 'dummy'){
        return new DummyRedisClient();
    }
    let vanillaClient = redis.createClient(redisUri, {prefix: prefix, enable_offline_queue: false});
    let promiseRedisClient = new PromiseRedisClient(vanillaClient);
    vanillaClient.on('ready', ()=>{
        let uuid_v4 = uuid.v4();
        let key = `${serverName}:${uuid_v4}`;

        promiseRedisClient.set(key, uuid_v4, 'EX', 10, 'NX')
            .then(()=>{return promiseRedisClient.get(key)})
            .then((val)=>{console.log(`Redis Test Value: ${val}`)})
            .catch((err)=>{console.error("ERROR: ", err);})
    });
    return promiseRedisClient;
};

const createVanillaClient = ({redisUri, prefix}) => {
    if(redisUri.toLowerCase() === 'dummy'){
        return new DummyRedisClient();
    }
    return redis.createClient(redisUri, {prefix: prefix, enable_offline_queue: false});
};

// now we're doing testing stuff
const redisUri = process.env.REDIS_URI || 'redis://localhost:6379';
redis.createClient(redisUri, {prefix: 'redis_test'});

