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
                "widgetArray": {"type": "array", "index": "simple"},
            },
            "additionalProperties": false,
            "required": ["id", "type", "version", "widgetName", "widgetArray"]
        };

        let schema = new MigratingSchema({type: "ArrayWidget", v1: widgetSchemaV1});

        super({tance, schema, namespace});
    };
}

let tance = null;

describe("Array Widget tests", function() {

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

    it("Create and retrieve, indexing on array", async function () {
        let table = new WidgetTable({tance});
        await table.insert({
            "widgetName": "spanish",
            "widgetArray": ["uno", "dos", "tres"],
        });

        await table.insert({
            "widgetName": "operating systems",
            "widgetArray": ["windows", "dos", "darwin"],
        });

        await table.insert({
            "widgetName": "architectural",
            "widgetArray": ["windows", "doors", "floors", "pillars"],
        });

        await table.insert({
            "widgetName": "scientists",
            "widgetArray": ["darwin", "einstein", "curie"],
        });

        let spanishOs = await table.find({widgetArray: "dos"});
        let scientistOs = await table.find({widgetArray: "darwin"});
        let architectureOs = await table.find({widgetArray: "windows"});

        //console.warn("Retrieved:");
        //console.warn(widgey);

        assert.deepEqual(spanishOs.map(x => x.widgetName).sort(), ["operating systems", "spanish"]);
        assert.deepEqual(scientistOs.map(x => x.widgetName).sort(), ["operating systems", "scientists"]);
        assert.deepEqual(architectureOs.map(x => x.widgetName).sort(), ["architectural", "operating systems"]);
    });
});
