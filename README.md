
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



## Working on Redis-Tance

### Running Redis

This library includes tools for setting up a local 
redis for testing using docker.

In order for this to work, you'll need docker installed.

You can test that everything's working with a 

    jake redis.start

Or, if you need sudo to docker, 

    sudo jake redis.start
