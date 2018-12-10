
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

Because this is a wrapper around [redis](https://github.com/NodeRedis/node_redis), 
you will need to construct a valid redis client and pass it to Tance.


```
const redis = require('redis');
const Tance = require('./lib/tance').Tance;

const redisClient = redis.createClient();
const tance = new Tance(redisClient);

async function doThings(){
    await tance.set("argle", "bargle");
    let margle = await tance.get("argle");
    
    console.log("argle? ", margle); // argle? bargle
};
```

## Imaginary Documentation

* sync objects using streams
*  each object has a separate stream
*  only makes sense for large objects 
    like "all of my friends"
* modify an object with an x => x function
* create a little table (Tance.Table) 
    with a schema and indexes
* create a list sorted by date (Tance.LastTen)

- a user has sessions
- each session comes with a subscription to an object like
    "all of my friends" and "notifications for me"
- the status of that object is synced between the
    server, the connected client, and the API client
- a world has instances
- each instance comes with a subscription to an object like
    "all of the users in this instance" 
    and "the memory of this instance" 


## Patching Redis-Tance

### Running Redis

This library includes tools for setting up a local 
redis for testing using docker.

In order for this to work, you'll need docker installed.

You can test that everything's working with a 

    jake redis.start

Or, if you need sudo to docker, 

    sudo jake redis.start
