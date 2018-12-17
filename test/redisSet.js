const redis = require('redis');
const Tance = require('../lib/Tance').Tance;
const MigratingSchema = require('../lib/Tance').MigratingSchema;
const assert = require('chai').assert;

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

describe("Redis Set tests", function() {

    before(async function () {
        const redisClient = redis.createClient();
        tance = new Tance(redisClient);

        await tance.ready();
        await tance.flushall();
        return;
    });

    it("Get and set an employee", async function() {
        let set = tance.redisSet({schema: employeeSchema});

        let employee = {
            "firstname": "Dang",
            "lastname": "Son",
        };

        let setEmployee = await set.set(employee);

        let getEmployee = await set.get();

        assert.deepEqual(setEmployee, getEmployee[0]);

        assert.equal(getEmployee[0].firstname, "Dang");
    });

    it("Invalid set employee throws an error", async function() {
        let set = tance.redisSet({schema: employeeSchema});

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
        let set = tance.redisSet({schema: employeeSchema});

        let employee = {
            "firstname": "Dang",
            "lastname": "Son",
        };

        let setEmployee = await set.set(employee);

        await set.modify((x) => {
            return new Set([...x].map(x => {x.firstname="Hang"; return x;}))
        });

        let getEmployee = await set.get();

        assert.equal(getEmployee[0].firstname, "Hang");
    });

});
