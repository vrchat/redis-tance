const redis = require('redis');
const Tance = require('../lib/Tance').Tance;
const uuid = require('uuid/v4');
const luxon = require('luxon').DateTime;

const Table = require('../lib/Table');
const SimpleSetIndex = require('../lib/Indexes/SimpleSetIndex');
const MigratingSchema = require('../lib/Tance').MigratingSchema;

const assert = require('chai').assert;

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
                "widgetNumber": {"type": "integer", "index": "integer"},
                "created_at_timestamp": {"type": "integer", "minimum": 0, "index": "integer"},
                "created_at_iso": {"type": "string"},
            },
            "additionalProperties": false,
            "required": ["id", "type", "version", "widgetName", "widgetNumber", "created_at_timestamp", "created_at_iso"]
        };

        let schema = new MigratingSchema({type: "NumberWidget", v1: widgetSchemaV1});

        super({tance, schema, namespace});
    };
}

let tance = null;

describe("Widget tests", function() {

    before(async function () {
        const redisClient = redis.createClient();
        tance = new Tance(redisClient);

        await tance.ready();
        await tance.flushall();
        return;
    });

    beforeEach(async function () {
        await tance.flushall();
        return;
    });

    it("Create and retrieve a widget", async function () {
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
        let fourAndFive = await table.find({widgetNumber: {"$lte": 5}});
        let justFour = await table.find({widgetNumber: {"$lt": 5}});
        let justFive = await table.find({widgetNumber: {"$gt": 4, "$lt": 5}});

        //console.warn("Retrieved:");
        //console.warn(widgey);

        assert.deepEqual(fiveAndSix.map(x => x.widgetNumber), ["5", "6"]);
        assert.deepEqual(justSix.map(x => x.widgetNumber), ["6"]);
        assert.deepEqual(fourAndFive.map(x => x.widgetNumber), ["4", "5"]);
        assert.deepEqual(justFour.map(x => x.widgetNumber), ["4"]);
        assert.deepEqual(justFive.map(x => x.widgetNumber), ["5"]);
    });

});
