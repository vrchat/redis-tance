const redis = require('redis');
const Tance = require('../lib/tance').Tance;
const assert = require('chai').assert;

let tance = null;

describe("Cache tests", function() {

    before(async function(){
        const redisClient = redis.createClient();
        tance = new Tance(redisClient);

        await tance.ready();
        return;
    });

    it("Basic GETs & SETs", async function() {
        await tance.set("argle", "bargle");

        let argle = await tance.get("argle");

        assert.equal(argle, "bargle");
    });

});
