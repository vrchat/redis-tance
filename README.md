
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
const Tance = require('redistance').Tance;

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

Some redis commands call for a long list of arguments. If you
have these as an array, you can provide them with the ***spread
operator***.

```
async function getABunchOfIds(){
    let ids = ["key1", "key2", "key3"];
    return tance.mget(...ids);
}
```

### Cache

Tance provides a cache wrapper that provides a sane-but-not-comprehensive
 default cache behavior for asynchronous functions.
 
_It might struggle if given a function with very complex inputs._

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

#### Caching Stuff With a Non-String Return Value

Because everything that gets returned is pushed through Redis,
it's hard to cache a function that returns a non-string value, 
unless you first pass it through a serializer and deserializer.

Here, we create tance.cache with JSON.stringify as the serializer
and JSON.parse as the deserializer, which allows us to cache a 
function that returns an object. 

```
async function _rng({x, y, z}){
    return {
        'gargle': 'margle',
        'bargle': 'fargle',
        'targle': 'chargle',
        'rng': uuid(),
    };
}

let rng = tance.cache(_rng, 100, '_rng', JSON.stringify, JSON.parse);

let rng1 = await rng({x: 1, y: 1, z: 1});
let rng2 = await rng({x: 1, y: 1, z: 1});

assert.deepEqual(rng1, rng2);
assert.isObject(rng1);
assert.isObject(rng2);
```

#### Cache Indexing

Normally, clearing the cache only works on sets of arguments that are
an exact match - so, for example, if I wanted to clear 
`{x: 1, y: 1, z:1}`, I'd have to call clearCache with exactly 
`{x: 1, y: 1, z:1}`. 

It's not, however, always possible to know exactly which cache entries
we want to clear &mdash; but clearing the entire cache for the
function wouldn't be granular enough.

That's why we have cache indexing: a way to define a subset
of arguments that we can clear all at once.

```
async function _rng({x, y, z}){
    return uuid();
}

let rng = tance.cache(_rng, 100);
tance.cacheIndex(['x'], '_rng');

let rng1 = await rng({x: 1, y: 1, z: 1});
let rng2 = await rng({x: 1, y: 2, z: 3});
let rng3 = await rng({x: 2, y: 2, z: 3});
// this should clear everything with x=1
await tance.clearCache({'x': 1}, '_rng');
// whereas this would ONLY clear {x: 1, y: 2, z: 3}
await tance.clearCache({'x': 1, 'y': 2, 'z': 3}, '_rng');
let rng4 = await rng({x: 1, y: 1, z: 1});
let rng5 = await rng({x: 1, y: 2, z: 3});
let rng6 = await rng({x: 2, y: 2, z: 3});

assert.notEqual(rng1, rng4);
assert.notEqual(rng2, rng5);
assert.equal(rng3, rng6);
```


### Mock Tables

_What's a database got that Redis don't got?_

Well, schema validation and secondary indexes, for one.

But there's nothing stopping us from cramming this stuff in, ourselves.

#### Creation

Here's an example of creating a Table with a Schema: 

```
const table = require("redis-tance").Table;
const migratingSchema = require("redis-tance").MigratingSchema;

class WidgetTable extends Table{
    constructor({tance, namespace=""}){
        let widgetSchemaV1 = {
            "type": "object",
            "properties": {
                // these three properties are mandatory for every object
                "id": {"type": "string"},
                "type": {"type": "string"},
                "version": {"type": "integer"},
                // these are our real properties:
                "widgetName": {"type": "string", "index": "simple"},
                // note that widgetOptional isn't in "required"
                "widgetOptional": {"type": "string", "index": "simple"},
                "widgetTags": {"type": "array", "index": "simple"},
                "widgetInteger": {"type": "integer", "index": "integer"},
                "created_at_timestamp": {"type": "integer", "minimum": 0, "index": "integer"},
                "created_at_iso": {"type": "string"},
            },
            "additionalProperties": false,
            "required": ["id", "type", "version", "widgetOwnerId", "widgetName", "widgetTags", "widgetInteger", "created_at_timestamp", "created_at_iso"]
        };

        let schema = new MigratingSchema({type: "Widget", v1: widgetSchemaV1});

        super({tance, schema, namespace});
    };
}

let table = new WidgetTable({tance});
```

Every instance of WidgetTable will point to the **same** database:

```
// table1 and table2 both refer to the same table; data entered in one will be available in the other
let table1 = new WidgetTable({tance});
let table2 = new WidgetTable({tance});
```

It's possible to create separate WidgetTables with the `namespace` parameter

```
// table1, table2 and table3 now refer to different tables
let table1 = new WidgetTable({tance});
let table2 = new WidgetTable({tance, namespace="spargharg"});
let table3 = new WidgetTable({tance, namespace="daaaaaang"});
let table4 = new WidgetTable({tance, namespace="daaaaaang"});
// table3 and table4 refer to the same table
```

#### Schema & MigratingSchema

The Schema used to create the `table` is written in the language of [json-schema](https://json-schema.org/). 
Our json schema validating library assures us that it can deal with schema up to draft-v4.

Tance provides both a `Schema` and a `MigratingSchema`.

If you're building a table there's a good chance you'll want to use `MigratingSchema` &mdash; 
it comes with tools for upgrading and modifying the schema against live data. 

##### Migrating with MigratingSchema

Let's imagine we have data that looks like:

```
class WidgetTable extends Table{
    constructor({tance, namespace=""}){
        let widgetSchemaV1 = {
            "type": "object",
            "properties": {
                // these three properties are mandatory for every object
                "id": {"type": "string"},
                "type": {"type": "string"},
                "version": {"type": "integer"},
                // these are our real properties:
                "widgetName": {"type": "string", "index": "simple"},
                // note that widgetOptional isn't in "required"
                "widgetOptional": {"type": "string", "index": "simple"},
                "widgetTags": {"type": "array", "index": "simple"},
                "widgetInteger": {"type": "integer", "index": "integer"},
                "created_at_timestamp": {"type": "integer", "minimum": 0, "index": "integer"},
                "created_at_iso": {"type": "string"},
            },
            "additionalProperties": false,
            "required": ["id", "type", "version", "widgetOwnerId", "widgetName", "widgetTags", "widgetInteger", "created_at_timestamp", "created_at_iso"]
        };

        let schema = new MigratingSchema({type: "Widget", v1: widgetSchemaV1});

        super({tance, schema, namespace});
    };
}
```

we want to upgrade the WidgetTable to have a new mandatory field, `widgetNameUppercase`,
as well as remove the field `widgetInteger`

We do that by adding another version to the schema, as well as an `versionX => versionY` function
responsible for taking an object of the previous version and updating it to an object of the new version.

```
class WidgetTable extends Table{
    constructor({tance, namespace=""}){
        let widgetSchemaV1 = {
            "type": "object",
            "properties": {
                // these three properties are mandatory for every object
                "id": {"type": "string"},
                "type": {"type": "string"},
                "version": {"type": "integer"},
                // these are our real properties:
                "widgetName": {"type": "string", "index": "simple"},
                // note that widgetOptional isn't in "required"
                "widgetOptional": {"type": "string", "index": "simple"},
                "widgetTags": {"type": "array", "index": "simple"},
                "widgetInteger": {"type": "integer", "index": "integer"},
                "created_at_timestamp": {"type": "integer", "minimum": 0, "index": "integer"},
                "created_at_iso": {"type": "string"},
            },
            "additionalProperties": false,
            "required": ["id", "type", "version", "widgetOwnerId", "widgetName", "widgetTags", "widgetInteger", "created_at_timestamp", "created_at_iso"]
        };
        
        // added widgetNameUppercase, removed widgetInteger
        let widgetSchemaV2 = {
            "type": "object",
            "properties": {
                "id": {"type": "string"},
                "type": {"type": "string"},
                "version": {"type": "integer"},
                "widgetName": {"type": "string", "index": "simple"},
                "widgetNameUppercase": {"type": "string"},
                "widgetOptional": {"type": "string", "index": "simple"},
                "widgetTags": {"type": "array", "index": "simple"},
                "created_at_timestamp": {"type": "integer", "minimum": 0, "index": "integer"},
                "created_at_iso": {"type": "string"},
            },
            "additionalProperties": false,
            "required": ["id", "type", "version", "widgetOwnerId", "widgetName", "widgetNameUppercase", "widgetTags", "created_at_timestamp", "created_at_iso"]
        };
        let v1ToV2 = (object) =>{
            object.widgetNameUppercase = object.widgetName.toUpperCase();
            delete object.widgetInteger;
            return object;
        };

        let schema = new MigratingSchema({type: "Widget", v1: widgetSchemaV1});
        
        schema.addVersion(widgetSchemaV2, v1ToV2);

        super({tance, schema, namespace});
    };
}
```

This schema now contains both types of Widget, `v1` widgets and `v2` widgets.
Any time the codebase encounters a `v1` widget in the database, it will upgrade it to a `v2` widget
using the `v1ToV2` function before returning it.

We can `addVersion` as many times as we update the object. 

#### Schema

For situations where migration is not likely to be an issue, we can also create a regular Schema.

```
class WidgetTable extends Table{
    constructor({tance, namespace=""}){
        let widgetSchemaV1 = {
            "type": "object",
            "properties": {
                // these three properties are mandatory for every object
                "id": {"type": "string"},
                "type": {"type": "string"},
                "version": {"type": "integer"},
                // these are our real properties:
                "widgetName": {"type": "string", "index": "simple"},
                // note that widgetOptional isn't in "required"
                "widgetOptional": {"type": "string", "index": "simple"},
                "widgetTags": {"type": "array", "index": "simple"},
                "widgetInteger": {"type": "integer", "index": "integer"},
                "created_at_timestamp": {"type": "integer", "minimum": 0, "index": "integer"},
                "created_at_iso": {"type": "string"},
            },
            "additionalProperties": false,
            "required": ["id", "type", "version", "widgetOwnerId", "widgetName", "widgetTags", "widgetInteger", "created_at_timestamp", "created_at_iso"]
        };

        let schema = new Schema({type: "Widget", schema: widgetSchemaV1});

        super({tance, schema, namespace});
    };
}
```

##### Schema Expiry

Passing the `expirySeconds` argument to Schema creates a Schema for an object that will expire.

Any objects, tables, and indexes created for this Schema will _also_ expire in that many seconds.

```
class ExpiringWidgetTable extends Table{
    constructor({tance, namespace=""}){
        let widgetSchemaV1 = {
            ...
        };

        let schema = new Schema({type: "Widget", schema: widgetSchemaV1, expirySeconds: 10});

        super({tance, schema, namespace});
    };
}
```

##### Static Schema

The Schema class also comes with a bunch of Schema baked in for really common data types:

```
let schemaForJustIds = Schema.Id();
let schemaForJustNumbers = Schema.Number();
let schemaForJustInts = Schema.Int();
```

These aren't that useful in a table (they don't represent objects, which we store) &mdash; they're useful when we're working with RedisSet, which we 
haven't talked about yet. 

##### Schema automatic indexes

The JSON Schema format doesn't have any mention of these crazy `index` things:

```
"widgetTags": {"type": "array", "index": "simple"},
"widgetInteger": {"type": "integer", "index": "integer"},
}
```

These are special instructions that instruct the Table to automatically create Indexes for these fields.

The two available types of index are `simple` and `integer` (for now).

More details on that when we get to `find`.

#### insert

Now that we have a `table`, we can put stuff in it!

```
const luxon = require('luxon').DateTime;

let createdObject = await table.insert({
    "widgetName": "Widgeotto",
    "widgetTags": ["bippity", "boppity", "boo"],
    "widgetInteger": 7,
    "created_at_timestamp": luxon.local().valueOf(),
    "created_at_iso": luxon.local().toString(),
});

console.log(createdObject.id); // each object is automatically given an id, if we don't create it with one already
```

It will fail if we try to put stuff in that doesn't match the Schema that we created earlier. 

```
// this will throw an error! 
let createdObject = await table.insert({
    "NOOOOOOOOOOOOOO": "nooooo?",
    "widgetName": "Widgeotto",
    "widgetTags": ["bippity", "boppity", "boo"],
    "widgetInteger": 7,
    "created_at_timestamp": luxon.local().valueOf(),
    "created_at_iso": luxon.local().toString(),
});
```

The object created by the `insert` operation will have an `id` automatically generated for it.
It's possible to choose your own ID:

```
let createdObject = await table.insert({
    "id": "7",
    "widgetName": "Widgeotto",
    "widgetTags": ["bippity", "boppity", "boo"],
    "widgetInteger": 7,
    "created_at_timestamp": luxon.local().valueOf(),
    "created_at_iso": luxon.local().toString(),
});
```

This `insert` is an UPSERT &mdash; that means it'll insert if the ID doesn't already exist, and UPDATE if the ID _does_ already exist.

Table objects will be automatically serialized to JSON.

#### get

Use `table.get(id)` to get stuff.

Table objects will automatically be deserialized from JSON. 

```
let createdObject = await table.insert({
    "widgetName": "Widgeotto",
    "widgetTags": ["bippity", "boppity", "boo"],
    "widgetInteger": 7,
    "created_at_timestamp": luxon.local().valueOf(),
    "created_at_iso": luxon.local().toString(),
});

let id = createdObject.id;

let widgeotto = await table.get(id);

// poof, widgeotto is (deep) equal to createdObject
```

#### delete

Use `table.delete(id)` to delete stuff.

```
await table.delete(id);
```

#### modify

While it's entirely possible to modify an object by `get`-ing it, then `insert`-ing it again, this can cause a problem 
where data is read-then-written out of order, causing data inconsistency.

The `table.modify(id, changeFn)` function wraps this operation in a _lock_ &mdash; only one operation can 
modify this document at a time.

The `changeFn` expected by this is an `async object=>object` &mdash; it expects to receive an object
and produce a modified version of that object.

If the `changeFn` takes more than `500ms` to resolve (an eternity!) the lock will expire and the write
will fail. If you have something really complicated to calculate, it might be best to do it outside
of this critical path.

```
let widgey = await table.modify(widgeotto.id, (object)=>{
    object.widgetName = "bestWidget";
    return object;
});
```

#### clear

Wanna be incredibly destructive? Of course you do! 
```
// this empties the entire table
table.clear()
```

#### find

Now it's time to find some things in the table!

Getting everything in the entire table is as easy as: 
```
let everythingInTheWholeDamnTable = find({});
```

We probably, uh, don't want to do that so often.

While it's possible to limit the results of this query with `.find({'$n': 10})`, 
that will start by loading every single ID in the entire table &mdash; it's a bad idea.
The `$n` and `$offset` parameters are best when working with an already restricted set size (under 1000).

One important note about Tance Tables is that they just _don't support full table searches_.

> IMPORTANT NOTE: Full Table Search is something to work on for the future!

In Mongo you can search on an unindexed field &mdash; it'll just take a really long time.

In Tance, if you search on an unindexed field, it'll _just treat that like an empty search_.

##### `simple` and the SimpleSetIndex

On any fields with `index: 'simple'`, we can perform a search for _exact matches only_.

```
let createdObject = await table.insert({
    "widgetName": "Widgeotto",
    "widgetTags": ["bippity", "boppity", "boo"],
    "widgetInteger": 7,
    "created_at_timestamp": luxon.local().valueOf(),
    "created_at_iso": luxon.local().toString(),
});

let results = await table.find({widgetName: "Widgeotto"})

// results is now an array containing the one object we just created.
```

Arrays are configured to match if the search matches _anything in the array_, so:
```
let createdObject = await table.insert({
    "widgetName": "Widgeotto",
    "widgetTags": ["bippity", "boppity", "boo"],
    "widgetInteger": 7,
    "created_at_timestamp": luxon.local().valueOf(),
    "created_at_iso": luxon.local().toString(),
});

let results = await table.find({widgetTags: "bippity"})

// results is still an array containing the one object we just created.
```

It's possible to combine these search parameters to create compound AND searches:

```
let createdObject = await table.insert({
    "widgetName": "Widgeotto",
    "widgetTags": ["bippity", "boppity", "boo"],
    "widgetInteger": 7,
    "created_at_timestamp": luxon.local().valueOf(),
    "created_at_iso": luxon.local().toString(),
});

let results = await table.find({widgetTags: "bippity", widgetName: "Widgeotto"});

// results is *still* an array containing the one object we just created.
```


##### IntegerIndex

On fields with `index: 'integer'` we have more options for searching!

We can search for any values `$gt` (greater than), `$gte` (greater than or equal),
`$lt` (less than), or `$lte` (less than or equal) an integer value.

```
let table = new WidgetTable({tance});
await table.insert({
    "widgetName": "three",
    "widgetNumber": 3,
    "created_at_timestamp": luxon.local().valueOf(),
    "created_at_iso": luxon.local().toString(),
});

await table.insert({
    "widgetName": "four",
    "widgetNumber": 4,
    "created_at_timestamp": luxon.local().valueOf(),
    "created_at_iso": luxon.local().toString(),
});

await table.insert({
    "widgetName": "five",
    "widgetNumber": 5,
    "created_at_timestamp": luxon.local().valueOf(),
    "created_at_iso": luxon.local().toString(),
});

await table.insert({
    "widgetName": "six",
    "widgetNumber": 6,
    "created_at_timestamp": luxon.local().valueOf(),
    "created_at_iso": luxon.local().toString(),
});

let fiveAndSix = await table.find({widgetNumber: {"$gte": 5}});
let justSix = await table.find({widgetNumber: {"$gt": 5}});
let threeFourFive = await table.find({widgetNumber: {"$lte": 5}});
let threeFour = await table.find({widgetNumber: {"$lt": 5}});
let justFive = await table.find({widgetNumber: {"$gt": 4, "$lt": 6}});
let alsoJustFive = await table.find({widgetNumber: {"$gt": 4, "$lt": 6}, widgetName: "five"});
```

We can also use `$top` and `$bottom` to get the top and bottom-ranked values against a table.

```
let fiveAndSix = await table.find({widgetNumber: {"$top": 2}});
let threeAndFour = await table.find({widgetNumber: {"$bottom": 2}});
let justFour = await table.find({widgetNumber: {"$gt": 0, "$n": 1, "$offset": 1}});
let justThree = await table.find({widgetNumber: {"$bottom": 2, "$n": 1}});
```

If we only want to get a few items from a table, creating a `created_timestamp` integer parameter and then querying `$top` on it
is one way to reliably and efficiently get a few objects.


#### recalculateIndexes

If we, as the result of a Migration (above) add indexes to a Table, new objects will be created according to the new indexes, 
but old objects will not be in the newly-created indexes.

`table.recalculateIndexes` takes the nuclear step of deleting and recreating all indexes. Yikes! 

> IMPORTANT NOTE: More granular index recalculation is something to work on for the future!

### RedisSet

The `RedisSet` object works a lot like a `Table` - it allows for objects to have a Schema and handles automatic serialization and deserialization,
but it _doesn't_ have indexes &mdash; it's just a plain ol' Redis Set. 

```
let set = tance.redisSet({id: "12345", schema: Schema.Integer()});

// "set" and "add" are interchangeable operations for putting things in the set
await set.set(1);
await set.add(2);
await set.set(3);
await set.add(4);
await set.set(5);

let getThreeItemsFromTheSet = await set.randmember(3);
let thisShouldBeTrue = await set.has(3);
let thisShouldBeFalse = await set.has(9);

// "get" and "members" are interchangeable operations for getting things from the set
let everythingFromTheSet = await set.get();
let alsoEverything = await set.members();

let probablyAboutFive = await set.count();

// remove an item from the set
await set.rem(2);

let probablyAboutFour = await set.count();

// clear the whole set
await set.delete()

let probablyAboutZero = await set.count();

assert.equal(response.length, 3);
```

#### Intersect, Diff, and Union

`RedisSet` can perform Intersections, Diffs, and Unions.

Here's an example using `union` and `unionStore` but it works the same way for `intersect` and `intersectStore`, as well as `diff` and `diffStore`:

```
let set = tance.redisSet({id: "12345", schema: Schema.Integer()});

await set.set(1);
await set.set(2);
await set.set(3);
await set.set(4);
await set.set(5);

let set2 = tance.redisSet({id: "34567", schema: Schema.Integer()});

await set2.set(3);
await set2.set(4);
await set2.set(5);
await set2.set(6);
await set2.set(7);

let oneToSeven = await set.union(set2);

assert.deepEqual(oneToSeven, [1,2,3,4,5,6,7]);

let oneToSevenButAsARedisSet = await set.unionStore(set2);

assert.deepEqual(await unionObj.members(), [1,2,3,4,5,6,7]);
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


### Running Tests

In order for the tests to work, Redis must be running, locally (see above).

```
mocha test
```

### Holy Debug Output Batman

Set the environment variable `TANCE_VERBOSE=true` to spit out 
every single Redis command run by Tance, no matter how inconsequential
