const redis = require('redis');
const Tance = require('../lib/Tance').Tance;
const Schema = require('../lib/Tance').Schema;
const assert = require('chai').assert;
const uuid = require('uuid/v4');

let tance = null;

describe("Schema tests", function() {

    before(async function () {
        const redisClient = redis.createClient();
        tance = new Tance(redisClient);

        await tance.ready();
        await tance.flushall();
        return;
    });

    it("Valid schema", async function() {
        let employeeV1 = {
            "type": "object",
            "properties": {
                "id": {"type": "string"},
                "type": {"type": "string"},
                "version": {"type": "integer"},
                "firstname": {"type": "string"},
                "lastname": {"type": "string"},
            },
            "required": ["firstname", "lastname"]
        };

        let employeeSchema = new Schema({type: "Employee", schema: employeeV1});

        let validEmployee = {
            "version": 1,
            "firstname": "Charles",
            "lastname": "Huckbreimer",
        };

        assert.isTrue(employeeSchema.isValid(validEmployee));
    });

    it("Invalid schema", async function() {
        let employeeV1 = {
            "type": "object",
            "properties": {
                "id": {"type": "string"},
                "type": {"type": "string"},
                "version": {"type": "integer"},
                "firstname": {"type": "string"},
                "lastname": {"type": "string"},
            },
            "required": ["firstname", "lastname"]
        };

        let employeeSchema = new Schema({type: "Employee", schema: employeeV1});

        let invalidEmployee = {
            "version": 1,
            "firstname": "Charles",
        };

        assert.isFalse(employeeSchema.isValid(invalidEmployee));
    });

    it("ID schema", async function() {
        let idSchema = Schema.Id();
        let stringSchema = Schema.String();

        let validIds = [
            "ebb81c06-6a0c-4c62-bdf7-da9f593bdceb",
            "thurmp-ebb81c06-6a0c-4c62-bdf7-da9f593bdceb",
            "this-is-a-thing-ebb81c06-6a0c-4c62-bdf7-da9f593bdceb",
        ];

        let invalidIds = [
            "thurmp-",
            "wad-wad-wad-wad",
            "82838021983uds",
            "skookaboo",
            "\n\n\n"
        ];

        validIds.forEach((validId)=>{
            assert.isTrue(idSchema.isValid(validId));
            assert.isTrue(stringSchema.isValid(validId));
        });
        invalidIds.forEach((invalidId)=>{
            assert.isFalse(idSchema.isValid(invalidId));
            assert.isTrue(stringSchema.isValid(invalidId));
        });
    });

    it("Number schema", async function() {
        let numberSchema = Schema.Number();
        let integerSchema = Schema.Integer();

        let validNumbers = [
            123,
            456,
            789,
        ];

        let invalidNumbers = [
            '123',
            'hey now',
        ];

        validNumbers.forEach((validNumber)=>{
            assert.isTrue(numberSchema.isValid(validNumber));
            assert.isTrue(integerSchema.isValid(validNumber));
        });
        invalidNumbers.forEach((invalidNumber)=>{
            assert.isFalse(numberSchema.isValid(invalidNumber));
            assert.isFalse(integerSchema.isValid(invalidNumber));
        });
    });

});
