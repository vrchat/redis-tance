const redis = require('redis');
const Tance = require('../lib/Tance').Tance;
const MigratingSchema = require('../lib/Tance').MigratingSchema;
const assert = require('chai').assert;
const Schema = require('../lib/Schema/Schema');

let tance = null;

let empl = {
    "type": "object",
    "properties": {
        "id": {"type": "string"},
        "type": {"type": "string"},
        "version": {"type": "integer"},
        "firstname": {"type": "string"},
        "lastname": {"type": "string"},
    },
    "additionalProperties": false,
    "required": ["id", "type", "version", "firstname", "lastname"]
};

let employeeSchema = new MigratingSchema({type: "Employee", v1: empl});

describe("Redis Expiring Set tests", function() {

    before(async function () {
        const redisClient = redis.createClient();
        tance = new Tance(redisClient);

        await tance.ready();
        await tance.flushall();
        return;
    });

    it("Let an employee expire", async function() {
        let set = tance.expiringSet({schema: employeeSchema});

        let employee = {
            "firstname": "Dang",
            "lastname": "Son",
        };

        let setEmployee = await set.set(employee);

        let results = await set.get();

        //Dang should be in there
        assert.equal(results.length, 1);

        //Dang should STILL be in there
        await set.expire();

        let getEmployee = await set.get();

        assert.deepEqual(setEmployee, getEmployee[0]);

        assert.equal(getEmployee[0].firstname, "Dang");

        await set.expire();

        let finalResults = await set.members();

        assert.equal(finalResults.length, 0);
    });

    it("Invalid set employee throws an error", async function() {
        let set = tance.expiringSet({schema: employeeSchema});

        let employee = {
            "data": "wrong"
        };

        try{
            await set.set(employee);
            assert.isTrue(false);
        }
        catch(err){
            assert.isTrue(true);
        }
    });

    it("Modify a set employee", async function() {
        let set = tance.expiringSet({schema: employeeSchema});

        let employee = {
            "firstname": "Dang",
            "lastname": "Son",
        };

        await set.set(employee);

        await set.expire();

        await set.modify((x) => {
            return new Set([...x].map(x => {x.firstname="Hang"; return x;}))
        });

        let getEmployee = await set.get();

        assert.equal(getEmployee[0].firstname, "Hang");
    });

    it("Created sets are unique", async function() {
        let setA = tance.expiringSet({schema: Schema.Integer()});
        let setB = tance.expiringSet({schema: Schema.Integer()});

        await setA.set(1);
        await setA.set(2);
        await setA.set(3);

        let getNums = await setB.get();

        assert.equal(getNums.length, 0);
    });

    it("Delete an employee", async function() {
        let set = tance.expiringSet({schema: employeeSchema});

        let employee = {
            "firstname": "Dang",
            "lastname": "Son",
        };

        await set.set(employee);

        await set.rem(employee);

        let hurg = await set.get();

        assert.deepEqual(hurg, []);
    });

    it("Clear the whole set", async function() {
        let set = tance.expiringSet({schema: employeeSchema});

        let employee = {
            "firstname": "Dang",
            "lastname": "Son",
        };

        await set.set(employee);

        await set.delete();

        let hurg = await set.get();

        assert.deepEqual(hurg, []);
    });

    it("Get random members of the set", async function() {
        let set = tance.expiringSet({id: "12345", schema: Schema.Integer()});

        await set.set(1);
        await set.set(2);
        await set.set(3);
        await set.set(4);
        await set.set(5);

        let response = await set.randmember(3);

        assert.equal(response.length, 3);
    });

    it("Check if set has something", async function() {
        let set = tance.expiringSet({id: "12345", schema: Schema.Integer()});

        await set.set(1);
        await set.set(2);
        await set.set(3);
        await set.set(4);
        await set.set(5);

        let response = await set.has(3);
        let otherResponse = await set.has(9);

        assert.equal(response, true);
        assert.equal(otherResponse, false);
    });

    it("Get a number out of the set", async function() {
        let set = tance.expiringSet({id: "12345", schema: Schema.Integer()});

        await set.set(1);
        await set.set(2);
        await set.set(3);
        await set.set(4);
        await set.set(5);

        let members = await set.members();

        assert.deepEqual(members.sort(), [1,2,3,4,5] );
    });

    it("Count members of the set", async function() {
        let set = tance.expiringSet({id: "12345", schema: Schema.Integer()});

        await set.set(1);
        await set.set(2);
        await set.set(3);
        await set.set(4);
        await set.set(5);

        let count = await set.count();

        assert.equal(count, 5);
    });

    it("Intersect", async function() {
        let set = tance.expiringSet({id: "12345", schema: Schema.Integer()});

        await set.set(1);
        await set.set(2);
        await set.set(3);
        await set.set(4);
        await set.set(5);

        let set2 = tance.expiringSet({id: "34567", schema: Schema.Integer()});

        await set2.set(3);
        await set2.set(4);
        await set2.set(5);
        await set2.set(6);
        await set2.set(7);

        let intersection = await set.intersect(set2);

        assert.deepEqual(intersection, [3,4,5]);
    });

    it("IntersectStore", async function() {
        let set = tance.expiringSet({id: "12345", schema: Schema.Integer()});

        await set.set(1);
        await set.set(2);
        await set.set(3);
        await set.set(4);
        await set.set(5);

        let set2 = tance.expiringSet({id: "34567", schema: Schema.Integer()});

        await set2.set(3);
        await set2.set(4);
        await set2.set(5);
        await set2.set(6);
        await set2.set(7);

        let intersectionObj = await set.intersectStore(set2);

        assert.deepEqual(await intersectionObj.members(), [3,4,5]);
    });

    it("Union", async function() {
        let set = tance.expiringSet({id: "12345", schema: Schema.Integer()});

        await set.set(1);
        await set.set(2);
        await set.set(3);
        await set.set(4);
        await set.set(5);

        let set2 = tance.expiringSet({id: "34567", schema: Schema.Integer()});

        await set2.set(3);
        await set2.set(4);
        await set2.set(5);
        await set2.set(6);
        await set2.set(7);

        let oneToSeven = await set.union(set2);

        assert.deepEqual(oneToSeven, [1,2,3,4,5,6,7]);
    });

    it("UnionStore", async function() {
        let set = tance.expiringSet({id: "12345", schema: Schema.Integer()});

        await set.set(1);
        await set.set(2);
        await set.set(3);
        await set.set(4);
        await set.set(5);

        let set2 = tance.expiringSet({id: "34567", schema: Schema.Integer()});

        await set2.set(3);
        await set2.set(4);
        await set2.set(5);
        await set2.set(6);
        await set2.set(7);

        let unionObj = await set.unionStore(set2);

        assert.deepEqual(await unionObj.members(), [1,2,3,4,5,6,7]);
    });

    it("Diff", async function() {
        let set = tance.expiringSet({id: "12345", schema: Schema.Integer()});

        await set.set(1);
        await set.set(2);
        await set.set(3);
        await set.set(4);
        await set.set(5);

        let set2 = tance.expiringSet({id: "34567", schema: Schema.Integer()});

        await set2.set(3);
        await set2.set(4);
        await set2.set(5);
        await set2.set(6);
        await set2.set(7);

        let differenceLeft = await set.diff(set2);
        let differenceRight = await set2.diff(set);

        assert.deepEqual(differenceLeft, [1,2]);
        assert.deepEqual(differenceRight, [6,7]);
    });

    it("DiffStore", async function() {
        let set = tance.expiringSet({id: "12345", schema: Schema.Integer()});

        await set.set(1);
        await set.set(2);
        await set.set(3);
        await set.set(4);
        await set.set(5);

        let set2 = tance.expiringSet({id: "34567", schema: Schema.Integer()});

        await set2.set(3);
        await set2.set(4);
        await set2.set(5);
        await set2.set(6);
        await set2.set(7);

        let differenceLeft = await set.diffStore(set2);
        let differenceRight = await set2.diffStore(set);

        assert.deepEqual(await differenceLeft.members(), [1, 2]);
        assert.deepEqual(await differenceRight.members(), [6, 7]);
    });

});
