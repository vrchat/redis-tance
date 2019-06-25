const redis = require('redis');
const Tance = require('../lib/Tance').Tance;
const RedisStream = require('../lib/Tance').RedisStream;
const assert = require('chai').assert;
const uuid = require('uuid/v4');

let tance = null;

describe("Redis Stream Tests", function() {

    before(async function(){
        const redisClient = redis.createClient();
        tance = new Tance(redisClient);

        await tance.ready();
        await tance.flushall();
        return;
    });

    it("Write to and read from the stream", async function() {
        let streamThurmond = new RedisStream({tance, channel:"zero", streamLength: 100});

        let read = await streamThurmond.readFn();

        await streamThurmond.write({
            "agedashi": "tofu",
            "salmon": "sashimi",
        });

        let results = await read();

        assert.equal(results.length, 1);
        assert.deepEqual(results[0], {
            "agedashi": "tofu",
            "salmon": "sashimi"
        });
    });

    it("Read a limited number of things from the stream", async function() {
        let streamThurmond = new RedisStream({tance, channel:"zero", streamLength: 100, maximumNumberOfItemsToRead: 1});

        let read = await streamThurmond.readFn();

        await streamThurmond.write({
            "gurb":"murb",
        });
        await streamThurmond.write({
            "good":"jerb",
        });
        await streamThurmond.write({
            "sassy":"lassy",
        });

        let results = await read();

        assert.equal(results.length, 1);
        assert.deepEqual(results[0], {
            "gurb":"murb"
        });
    });

    it("Read 3 things from the stream", async function() {
        let streamThurmond = new RedisStream({tance, channel:"zero", streamLength: 100, maximumNumberOfItemsToRead: 3});

        let read = await streamThurmond.readFn();

        await streamThurmond.write({
            "gurb":"murb",
        });
        await streamThurmond.write({
            "good":"jerb",
        });
        await streamThurmond.write({
            "sassy":"lassy",
        });

        let results = await read();

        assert.equal(results.length, 3);
    });

});
