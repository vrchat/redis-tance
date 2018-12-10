const redis = require('redis');
const Tance = require('../lib/tance').Tance;
const assert = require('chai').assert;
const uuid = require('uuid/v4');

let tance = null;

describe("Cache tests", function() {

    before(async function(){
        const redisClient = redis.createClient();
        tance = new Tance(redisClient);

        await tance.ready();
        await tance.flushall();
        return;
    });

    it("Basic GETs & SETs", async function() {
        await tance.set("argle", "bargle");

        let argle = await tance.get("argle");

        assert.equal(argle, "bargle");
    });

    it("More complicated GETs & SETs", async function() {
        await tance.set("slappy", "pappy", "EX", 150);

        let argle = await tance.get("slappy");

        assert.equal(argle, "pappy");
    });

    it("Cache", async function() {

        async function _rng1(){
            return uuid();
        }

        let rng = tance.cache(_rng1, 100);

        let rng1 = await rng();
        let rng2 = await rng();


        assert.equal(rng1, rng2);
    });

    it("A null argument should completely clear the cache", async function() {

        async function _rng2(){
            return uuid();
        }

        let rng = tance.cache(_rng2, 100);

        let rng1 = await rng();
        await tance.clearCache(null, "_rng2");

        let rng2 = await rng();


        assert.notEqual(rng1, rng2);
    });

    it("Caching should only cache on matching parameters", async function() {

        async function _rng3({x, y, z}){
            return uuid();
        }

        let rng = tance.cache(_rng3, 100);

        let rng1 = await rng({x: 1, y: 1, z: 1});
        let rng2 = await rng({x: 1, y: 2, z: 2});
        let rng3 = await rng({x: 1, y: 1, z: 1});

        assert.equal(rng1, rng3);
        assert.notEqual(rng1, rng2);
    });

    it("Caching should only cache on matching parameters (even without an object arg)", async function() {

        async function _rng4(x, y, z){
            return uuid();
        }

        let rng = tance.cache(_rng4, 100);

        let rng1 = await rng(1, 1, 1);
        let rng2 = await rng(1, 2, 2);
        let rng3 = await rng(1, 1, 1);

        assert.equal(rng1, rng3);
        assert.notEqual(rng1, rng2);
    });

    it("We should be able to clear the cache for just one set of arguments", async function() {

        async function _rng5({x, y, z}){
            return uuid();
        }

        let rng = tance.cache(_rng5, 100);

        let rng1 = await rng({x: 1, y: 1, z: 1});
        let rng2 = await rng({x: 2, y: 2, z: 2});

        await tance.clearCache({x: 1, y: 1, z: 1}, "_rng5");
        let rng3 = await rng({x: 1, y: 1, z: 1});
        let rng4 = await rng({x: 2, y: 2, z: 2});


        assert.notEqual(rng1, rng3);
        assert.equal(rng2, rng4);
    });

    it("We should be able to deal in objects, if we have a deserialization/serialization strategy", async function() {

        async function _rng6({x, y, z}){
            return {
                'gargle': 'margle',
                'bargle': 'fargle',
                'targle': 'chargle',
                'rng': uuid(),
            };
        }

        let rng = tance.cache(_rng6, 100, '_rng6', JSON.stringify, JSON.parse);

        let rng1 = await rng({x: 1, y: 1, z: 1});
        let rng2 = await rng({x: 1, y: 1, z: 1});

        assert.deepEqual(rng1, rng2);
        assert.isObject(rng1);
        assert.isObject(rng2);
    });


});
