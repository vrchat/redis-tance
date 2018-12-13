const redis = require('redis');
const Tance = require('../lib/Tance').Tance;
const Skeema = require('../lib/Tance').Skeema;
const assert = require('chai').assert;

let tance = null;

let delay = (delayMs) => {
    return new Promise((resolve, reject)=>{
        setTimeout(()=>{
            resolve();
        }, delayMs);
    })
};

describe("Locking document tests", function() {

    before(async function () {
        const redisClient = redis.createClient();
        tance = new Tance(redisClient);

        await tance.ready();
        await tance.flushall();
        return;
    });

    it("Modify an employee twice at the same time", async function() {
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

        let employeeSchema = new Skeema({type: "Employee", v1: empl});

        let document = tance.lockingDocument({schema: employeeSchema});

        let employee = {
            "firstname": "No",
            "lastname": "Change",
        };

        await document.set(employee);

        let slowChange = async(a) => {
            await delay(300);
            //console.warn("finishing slow");
            a.firstname = "Slow";
            return a;
        };

        let fastChange = async(a) => {
            await delay(50);
            //console.warn("finishing fast");
            a.lastname = "Fast";
            return a;
        };

        let promise_A = document.modify(slowChange);
        await delay(50);
        let promise_B = document.modify(fastChange);

        await Promise.all([promise_A, promise_B]).catch((err)=>{
            console.warn(err);
        });

        let getEmployee = await document.get();

        assert.equal(getEmployee.firstname, "Slow");
        assert.equal(getEmployee.lastname, "Fast");
    });


    it("Modify an employee twice at the same time, but time out", async function() {
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

        let employeeSchema = new Skeema({type: "Employee", v1: empl});

        let document = tance.lockingDocument({schema: employeeSchema});

        let employee = {
            "firstname": "No",
            "lastname": "Change",
        };

        await document.set(employee);

        let verySlowChange = async(a) => {
            await delay(1000);
            a.firstname = "Slow";
            return a;
        };

        let fastChange = async(a) => {
            await delay(50);
            a.lastname = "Fast";
            return a;
        };

        let promise_A = document.modify(verySlowChange);
        await delay(50);
        let promise_B = document.modify(fastChange);

        let throwsATimeoutError = false;
        await Promise.all([promise_A, promise_B]).catch((err)=>{
            throwsATimeoutError = true;
        });

        assert.isTrue(throwsATimeoutError);
    });


});
