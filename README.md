
# Redis-Tance

> he's going the redistance
>
> he's going for speed
>
> she's all alone (all alone) 
>
> all alone in her time of need

Redis-Tance is a wrapper around `redis` that's mostly 
for the sake of convenience. It doesn't do *anything* yet.


## Imaginary Documentation

* modify an object with an x => x function
* create a little table (Tance.Table) 
    with a schema and indexes
* create a list sorted by date (Tance.LastTen)

## Patching Redis-Tance

### Running Redis

This library includes tools for setting up a local 
redis for testing using docker.

In order for this to work, you'll need docker installed.

You can test that everything's working with a 

    jake redis.start

Or, if you need sudo to docker, 

    sudo jake redis.start
