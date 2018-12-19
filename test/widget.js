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
                "widgetOwnerId": {"type": "string", "index": "simple"},
                "widgetName": {"type": "string", "index": "simple"},
                // note that widgetOptional isn't in "required"
                "widgetOptional": {"type": "string", "index": "simple"},
                "created_at_timestamp": {"type": "integer", "minimum": 0, "index": "integer"},
                "created_at_iso": {"type": "string"},
            },
            "additionalProperties": false,
            "required": ["id", "type", "version", "widgetOwnerId", "widgetName", "created_at_timestamp", "created_at_iso"]
        };

        let schema = new MigratingSchema({type: "Widget", v1: widgetSchemaV1});

        super({tance, schema, namespace});
    };
}

class WidgetTableV3 extends Table{
    constructor({tance, namespace=""}){
        let widgetSchemaV1 = {
            "type": "object",
            "properties": {
                // these three properties are mandatory for every object
                "id": {"type": "string"},
                "type": {"type": "string"},
                "version": {"type": "integer"},
                // these are our real properties:
                "widgetOwnerId": {"type": "string", "index": "simple"},
                "widgetName": {"type": "string", "index": "simple"},
                // note that widgetOptional isn't in "required"
                "widgetOptional": {"type": "string", "index": "simple"},
                "created_at_timestamp": {"type": "integer", "minimum": 0, "index": "integer"},
                "created_at_iso": {"type": "string"},
            },
            "additionalProperties": false,
            "required": ["id", "type", "version", "widgetOwnerId", "widgetName", "created_at_timestamp", "created_at_iso"]
        };
        // added Polarity, Molarity, and Hilarity, Polarity is mandatory
        let widgetSchemaV2 = {
            "type": "object",
            "properties": {
                // these three properties are mandatory for every object
                "id": {"type": "string"},
                "type": {"type": "string"},
                "version": {"type": "integer"},
                // these are our real properties:
                "widgetOwnerId": {"type": "string", "index": "simple"},
                "widgetName": {"type": "string", "index": "simple"},
                // note that widgetOptional isn't in "required"
                "widgetOptional": {"type": "string", "index": "simple"},
                "widgetIsNamedTed": {"type": "boolean"},
                "widgetPolarity": {"type": "boolean"},
                "widgetMolarity": {"type": "integer"},
                "widgetHilarity": {"type": "integer"},
                "created_at_timestamp": {"type": "integer", "minimum": 0},
                "created_at_iso": {"type": "string"},
            },
            "additionalProperties": false,
            "required": ["id",
                "type",
                "version",
                "widgetOwnerId",
                "widgetName",
                "widgetIsNamedTed",
                "widgetPolarity",
                "created_at_timestamp",
                "created_at_iso"]
        };
        let v1ToV2 = (object) =>{
            object.widgetIsNamedTed = object.widgetName.toLowerCase() === "ted";
            object.widgetPolarity = false;
            object.widgetHilarity = object.widgetIsNamedTed ? 100 : 20;
            object.widgetMolarity = 0;
            return object;
        };
        // removed Hilarity, added a list of tags and a rando object, and add an index on widgetMolarity
        let widgetSchemaV3 = {
            "type": "object",
            "properties": {
                // these three properties are mandatory for every object
                "id": {"type": "string"},
                "type": {"type": "string"},
                "version": {"type": "integer"},
                // these are our real properties:
                "widgetOwnerId": {"type": "string", "index": "simple"},
                "widgetName": {"type": "string", "index": "simple"},
                // note that widgetOptional isn't in "required"
                "widgetOptional": {"type": "string", "index": "simple"},
                "widgetIsNamedTed": {"type": "boolean"},
                "widgetPolarity": {"type": "boolean"},
                "widgetMolarity": {"type": "integer", index: 'simple'},
                "tags": {"type": "array", "maxItems": 10, "items": {"type": "string"}},
                "whatever": {"type": "object"},
                "created_at_timestamp": {"type": "integer", "minimum": 0},
                "created_at_iso": {"type": "string"},
            },
            "additionalProperties": false,
            "required": ["id",
                "type",
                "version",
                "widgetOwnerId",
                "widgetName",
                "widgetIsNamedTed",
                "widgetPolarity",
                "tags",
                "whatever",
                "created_at_timestamp",
                "created_at_iso"]
        };
        let v2ToV3 = (object) =>{
            object.tags = [];
            object.whatever = {};
            delete object.widgetHilarity;
            return object;
        };

        let schema = new MigratingSchema({type: "Widget", v1: widgetSchemaV1});
        schema.addVersion(widgetSchemaV2, v1ToV2);
        schema.addVersion(widgetSchemaV3, v2ToV3);

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
        let widgeotto = await table.insert({
            "widgetOwnerId": "user-"+uuid(),
            "widgetName": "testWidget",
            "created_at_timestamp": luxon.local().valueOf(),
            "created_at_iso": luxon.local().toString(),
        });

        //console.warn("Created:");
        //console.warn(widgeotto);

        assert.exists(widgeotto.id);
        assert.equal(widgeotto.type, "Widget");
        assert.equal(widgeotto.version, 1);
        assert.exists(widgeotto.widgetOwnerId);
        assert.exists(widgeotto.created_at_timestamp);
        assert.exists(widgeotto.created_at_iso);

        let widgey = await table.get(widgeotto.id);

        //console.warn("Retrieved:");
        //console.warn(widgey);

        assert.exists(widgey.id);
        assert.equal(widgey.type, "Widget");
        assert.equal(widgey.version, 1);
        assert.exists(widgey.widgetOwnerId);
        assert.exists(widgey.created_at_timestamp);
        assert.exists(widgey.created_at_iso);

    });

    it("Find a widget", async function () {
        let table = new WidgetTable({tance});
        let widgeotto = await table.insert({
            "widgetOwnerId": "user-"+uuid(),
            "widgetName": "testWidget",
            "created_at_timestamp": luxon.local().valueOf(),
            "created_at_iso": luxon.local().toString(),
        });
        await table.insert({
            "widgetOwnerId": "user-"+uuid(),
            "widgetName": "someOtherWidget",
            "created_at_timestamp": luxon.local().valueOf(),
            "created_at_iso": luxon.local().toString(),
        });

        let results = await table.find({widgetOwnerId: widgeotto.widgetOwnerId});

        //console.warn(results);

        assert.equal(results.length, 1);
        assert.equal(results[0].widgetName, "testWidget");
        assert.equal(results[0].id, widgeotto.id);
        assert.equal(results[0].widgetOwnerId, widgeotto.widgetOwnerId);
    });

    it("Find multiple widgets", async function () {
        let table = new WidgetTable({tance});

        let gary1 = await table.insert({
            "widgetOwnerId": "user-"+uuid(),
            "widgetName": "gary",
            "created_at_timestamp": luxon.local().valueOf(),
            "created_at_iso": luxon.local().toString(),
        });
        let gary2 = await table.insert({
            "widgetOwnerId": "user-"+uuid(),
            "widgetName": "gary",
            "created_at_timestamp": luxon.local().valueOf(),
            "created_at_iso": luxon.local().toString(),
        });

        let results = await table.find({widgetName: "gary"});

        assert.equal(results.length, 2);
        assert.equal(results[0].widgetName, "gary");
        assert.equal(results[1].widgetName, "gary");
    });

    it("Create a new namespace with no widgets", async function () {
        // TODO: we need to test _every feature_ with namespaces
        let garyTable = new WidgetTable({tance});

        let gary1 = await garyTable.insert({
            "widgetOwnerId": "user-"+uuid(),
            "widgetName": "gary",
            "created_at_timestamp": luxon.local().valueOf(),
            "created_at_iso": luxon.local().toString(),
        });

        let gary2 = await garyTable.insert({
            "widgetOwnerId": "user-"+uuid(),
            "widgetName": "gary",
            "created_at_timestamp": luxon.local().valueOf(),
            "created_at_iso": luxon.local().toString(),
        });

        let table = new WidgetTable({tance, namespace:"empty"});

        // no garys in here!
        let results = await table.find({widgetName: "gary"});

        assert.equal(results.length, 0);

        let count = await table.count();

        assert.equal(count, 0);
    });

    it("Try to create an invalid object and it'll throw a DocumentValidationError", async function () {
        let table = new WidgetTable({tance});

        try{
            await table.insert({
                "widgetOwnerId": "user-"+uuid(),
                "widgetName": "gary",
                "created_at_timestamp": -500,
                "created_at_iso": luxon.local().toString(),
            });

            assert.isTrue(false);
        } catch (err){
            assert.equal(err.constructor.name, "DocumentValidationError");
        }

        try{
            await table.insert({
                "widgetName": "gary",
                "created_at_iso": luxon.local().toString(),
            });

            assert.isTrue(false);
        } catch (err){
            assert.equal(err.constructor.name, "DocumentValidationError");
        }
    });

    it("Find nobody, because everybody is named gary", async function () {
        let table = new WidgetTable({tance});

        let gary1 = await table.insert({
            "widgetOwnerId": "user-"+uuid(),
            "widgetName": "gary",
            "created_at_timestamp": luxon.local().valueOf(),
            "created_at_iso": luxon.local().toString(),
        });
        let gary2 = await table.insert({
            "widgetOwnerId": "user-"+uuid(),
            "widgetName": "gary",
            "created_at_timestamp": luxon.local().valueOf(),
            "created_at_iso": luxon.local().toString(),
        });

        let results = await table.find({widgetName: "not gary"});

        assert.equal(results.length, 0);
    });

    it("Find everybody", async function () {
        let table = new WidgetTable({tance});

        let gary1 = await table.insert({
            "widgetOwnerId": "user-"+uuid(),
            "widgetName": "gary",
            "created_at_timestamp": luxon.local().valueOf(),
            "created_at_iso": luxon.local().toString(),
        });
        let gary2 = await table.insert({
            "widgetOwnerId": "user-"+uuid(),
            "widgetName": "gary",
            "created_at_timestamp": luxon.local().valueOf(),
            "created_at_iso": luxon.local().toString(),
        });

        let results = await table.find({});

        assert.equal(results.length, 2);
    });

    it("Create, modify, retrieve, and find a widget, in a namespace", async function () {
        let table = new WidgetTable({tance, namespace: "gorg"});
        let widgeotto = await table.insert({
            "widgetOwnerId": "user-"+uuid(),
            "widgetName": "testWidget",
            "created_at_timestamp": luxon.local().valueOf(),
            "created_at_iso": luxon.local().toString(),
        });

        let otherThing = await table.insert({
            "widgetOwnerId": "user-"+uuid(),
            "widgetName": "brian",
            "created_at_timestamp": luxon.local().valueOf(),
            "created_at_iso": luxon.local().toString(),
        });

        assert.exists(widgeotto.id);
        assert.equal(widgeotto.type, "Widget");
        assert.equal(widgeotto.version, 1);
        assert.exists(widgeotto.widgetOwnerId);
        assert.exists(widgeotto.created_at_timestamp);
        assert.exists(widgeotto.created_at_iso);

        let widgey = await table.modify(widgeotto.id, (object)=>{
            object.widgetName = "bestWidget";
            return object;
        });

        assert.exists(widgey.id);
        assert.equal(widgey.type, "Widget");
        assert.equal(widgey.version, 1);
        assert.equal(widgey.widgetName, "bestWidget");
        assert.exists(widgey.widgetOwnerId);
        assert.exists(widgey.created_at_timestamp);
        assert.exists(widgey.created_at_iso);

        let widgeot = await table.get(widgeotto.id);

        assert.exists(widgeot.id);
        assert.equal(widgeot.type, "Widget");
        assert.equal(widgeot.version, 1);
        assert.equal(widgeot.widgetName, "bestWidget");
        assert.exists(widgeot.widgetOwnerId);
        assert.exists(widgeot.created_at_timestamp);
        assert.exists(widgeot.created_at_iso);

        let findWidge = await table.find({widgetName: "bestWidget"});

        assert.equal(findWidge.length, 1);
        assert.equal(findWidge[0].id, widgeotto.id);
        assert.equal(findWidge[0].widgetName, "bestWidget");
    });


    it("Change the schema for a table and it should still work, I hope", async function () {
        let table = new WidgetTable({tance});
        let widgeotto = await table.insert({
            "widgetOwnerId": "user-"+uuid(),
            "widgetName": "Ted",
            "created_at_timestamp": luxon.local().valueOf(),
            "created_at_iso": luxon.local().toString(),
        });


        let upgradedTable = new WidgetTableV3({tance});

        let widgey = await upgradedTable.get(widgeotto.id);
        //console.warn("Retrieved:");
        //console.warn(widgey);

        assert.exists(widgey.id);
        assert.equal(widgey.type, "Widget");
        assert.equal(widgey.version, 3);
        assert.exists(widgey.widgetOwnerId);
        assert.exists(widgey.created_at_timestamp);
        assert.exists(widgey.created_at_iso);

        assert.equal(widgey.widgetIsNamedTed, true);
        assert.exists(widgey.widgetPolarity);
        assert.deepEqual(widgey.tags, []);
        assert.deepEqual(widgey.whatever, {});
    });

    it("Clear everybody in a table. Nobody in the table.", async function () {
        let table = new WidgetTable({tance});

        let gary1 = await table.insert({
            "widgetOwnerId": "user-"+uuid(),
            "widgetName": "gary",
            "created_at_timestamp": luxon.local().valueOf(),
            "created_at_iso": luxon.local().toString(),
        });
        let gary2 = await table.insert({
            "widgetOwnerId": "user-"+uuid(),
            "widgetName": "gary",
            "created_at_timestamp": luxon.local().valueOf(),
            "created_at_iso": luxon.local().toString(),
        });

        await table.clear();

        let results = await table.find({});

        assert.equal(results.length, 0);
    });

    it("Recalculate indexes, they should still work.", async function () {
        let table = new WidgetTable({tance});

        let gary1 = await table.insert({
            "widgetOwnerId": "user-"+uuid(),
            "widgetName": "gary",
            "created_at_timestamp": luxon.local().valueOf(),
            "created_at_iso": luxon.local().toString(),
        });
        let gary2 = await table.insert({
            "widgetOwnerId": "user-"+uuid(),
            "widgetName": "gary",
            "created_at_timestamp": luxon.local().valueOf(),
            "created_at_iso": luxon.local().toString(),
        });

        await table.recalculateIndexes();

        let results = await table.find({widgetName: "gary"});

        assert.equal(results.length, 2);
    });

    // TODO: integer indexes?
    // TODO: sort?

});
