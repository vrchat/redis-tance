
# Redis-Tance

> he's going the redistance
>
> he's going for speed
>
> she's all alone (all alone) 
>
> all alone in her time of need

Redis-Tance is a wrapper around `redis` that's mostly 
for the sake of convenience.

It promisifies the entire library, and provides a function
that automatically caches functions passed through it.

## Basic Usage

### Getting Started

Because this is a wrapper around [redis](https://github.com/NodeRedis/node_redis), 
you will need to construct a valid redis client and pass it to Tance.

```
const redis = require('redis');
const Tance = require('./lib/tance').Tance;

const redisClient = redis.createClient();
const tance = new Tance(redisClient);
```

### Gets & Sets
Every command against Tance is just a [redis command](https://redis.io/commands) 
(i.e. "set"),
but it returns a promise that resolves when the command completes.

```
async function doThings(){
    await tance.set("argle", "bargle");
    let margle = await tance.get("argle");
    
    console.log("argle? ", margle); // argle? bargle
};
```

Commands that have many arguments just lay out those 
arguments one at a time. 

```
async function doThings(){
    await tance.set("slappy", "pappy", "EX", 180);
    let pappy = await tance.get("slappy");
    
    console.log("slappy? ", pappy); // slappy? pappy
};
```

### Cache

Tance provides a cache wrapper that provides a sane-but-not-comprehensive
 default cache behavior for asynchronous functions.
 
It might struggle if given a function with very complex inputs. 

```
    async function _rng(){
        return uuid();
    }

    const rng = tance.cache(_rng, 100);

    let rng1 = await rng();
    let rng2 = await rng();
    
    // rng2 should be the same as rng1, even though the 
    // function would otherwise produce a random value every time

    assert.equal(rng1, rng2);
```

#### Caching Functions With Arguments

Tance will only cache functions if their arguments exactly match.

```
    async function _rng({x, y, z}){
        return uuid();
    }

    let rng = tance.cache(_rng, 100);

    let rng1 = await rng({x: 1, y: 1, z: 1});
    let rng2 = await rng({x: 1, y: 2, z: 2});
    let rng3 = await rng({x: 1, y: 1, z: 1});

    // rng1 and rng3 should be the same, because they share arguments
    assert.equal(rng1, rng3);
    
    // rng1 and rng2 should not be the same, because they don't
    assert.notEqual(rng1, rng2);
```

#### Clearing the Cache

`tance.clearCache` will clear the cache of any cached items 
that exactly match the parameters they've been provided.

```
    async function _rng(){
        return uuid();
    }
    let rng = tance.cache(_rng, 100);

    let rng1 = await rng({x: 1, y: 1, z: 1});
    let rng2 = await rng({x: 2, y: 2, z: 2});

    await tance.clearCache({x: 1, y: 1, z: 1}, "_rng5");
    let rng3 = await rng({x: 1, y: 1, z: 1});
    let rng4 = await rng({x: 2, y: 2, z: 2});


    assert.notEqual(rng1, rng3);
    assert.equal(rng2, rng4);
```

This stuff won't work when caching functions 
that don't take named parameters - the only way to clear
the cache for these functions is to completely clear the cache.

`tance.clearCache` with a null argument will completely clear
the cache. 

```
    async function _rng(){
        return uuid();
    }

    let rng = tance.cache(_rng, 100);

    let rng1 = await rng();
    await tance.clearCache(null, "_rng2");

    let rng2 = await rng();

    assert.notEqual(rng1, rng2);
```

## Working on Redis-Tance

### Running Redis

This library includes tools for setting up a local 
redis for testing using docker.

In order for this to work, you'll need docker installed.

You can test that everything's working with a 

    jake redis.start

Or, if you need sudo to docker, 

    sudo jake redis.start
