const redis = require('redis');
const Tance = require('../lib/Tance').Tance;
const uuid = require('uuid/v4');
const luxon = require('luxon').DateTime;

const LockingDocument = require('../lib/LockingDocument');
const Table = require('../lib/Table');
const SimpleSetIndex = require('../lib/Indexes/SimpleSetIndex');
const Skeema = require('../lib/Tance').Skeema;

const assert = require('chai').assert;

class WidgetTable extends Table{
    constructor(tance){
        let widgetSchemaV1 = {
            "type": "object",
            "properties": {
                // these three properties are mandatory for every object
                "id": {"type": "string"},
                "type": {"type": "string"},
                "version": {"type": "integer"},
                // these are our real properties:
                "widgetOwnerId": {"type": "string"},
                "widgetName": {"type": "string"},
                "created_at_timestamp": {"type": "integer", "minimum": 0},
                "created_at_iso": {"type": "string"},
            },
            "additionalProperties": false,
            "required": ["id", "type", "version", "widgetOwnerId", "widgetName", "created_at_timestamp", "created_at_iso"]
        };

        let schema = new Skeema({type: "Widget", v1: widgetSchemaV1});
        let widgetOwnerIndex = new SimpleSetIndex({tance: tance, type: "Widget", indexedProperty: "widgetOwnerId", sparse: false});

        super({tance: tance, schema:schema, documentClass:LockingDocument, indexes: [widgetOwnerIndex]});
    };
}

let tance = null;

describe("Widget tests", function() {

    before(async function () {
        const redisClient = redis.createClient();
        let verbose = true;
        tance = new Tance(redisClient, verbose);

        await tance.ready();
        await tance.flushall();
        return;
    });

    it("Create and retrieve a widget", async function () {
        let table = new WidgetTable(tance);
        let object = await table.insert({
            "widgetOwnerId": "user-"+uuid(),
            "widgetName": "testWidget",
            "created_at_timestamp": luxon.local().valueOf(),
            "created_at_iso": luxon.local().toString(),
        });

        //console.warn("Created:");
        //console.warn(object);

        assert.exists(object.id);
        assert.equal(object.type, "Widget");
        assert.equal(object.version, 1);
        assert.exists(object.widgetOwnerId);
        assert.exists(object.created_at_timestamp);
        assert.exists(object.created_at_iso);

        let widgey = await table.get(object.id);

        //console.warn("Retrieved:");
        //console.warn(widgey);

        assert.exists(widgey.id);
        assert.equal(widgey.type, "Widget");
        assert.equal(widgey.version, 1);
        assert.exists(widgey.widgetOwnerId);
        assert.exists(widgey.created_at_timestamp);
        assert.exists(widgey.created_at_iso);

    });
});
