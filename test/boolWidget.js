const redis = require('redis');
const Tance = require('../lib/Tance').Tance;
const uuid = require('uuid/v4');
const luxon = require('luxon').DateTime;

const Table = require('../lib/Table');
const SimpleSetIndex = require('../lib/Indexes/SimpleSetIndex');
const MigratingSchema = require('../lib/Tance').MigratingSchema;

const assert = require('chai').assert;

class BoolWidgetTable extends Table{
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
                "widgetBool": {"type": "bool", "index": "simple"},
            },
            "additionalProperties": false,
            "required": ["id", "type", "version", "widgetName", "widgetBool"]
        };

        let schema = new MigratingSchema({type: "BoolWidget", v1: widgetSchemaV1});

        super({tance, schema, namespace});
    };
}

let tance = null;

describe("Bool Widget tests", function() {

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

    it("Create and retrieve an bool widget", async function () {
        let table = new BoolWidgetTable({tance});
        await table.insert({
            "widgetName": "FalsyBoi",
            "widgetBool": false,
        });

        await table.insert({
            "widgetName": "TrueDat",
            "widgetBool": true,
        });

        await table.insert({
            "widgetName": "NiagaraFalse",
            "widgetBool": false,
        });

        await table.insert({
            "widgetName": "TrueLove",
            "widgetBool": true,
        });

        let justTrues = await table.find({widgetBool: true});
        let justFalses = await table.find({widgetBool: false});

        //console.warn("Retrieved:");
        //console.warn(widgey);

        assert.deepEqual(justTrues.map(x => x.widgetName).sort(), ["TrueDat", "TrueLove"]);
        assert.deepEqual(justFalses.map(x => x.widgetName).sort(), ["FalsyBoi", "NiagaraFalse"]);
    });
});
