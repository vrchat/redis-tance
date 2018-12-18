const redis = require('redis');
const Tance = require('../lib/Tance').Tance;
const uuid = require('uuid/v4');
const luxon = require('luxon').DateTime;

const Table = require('../lib/Table');
const SimpleSetIndex = require('../lib/Indexes/SimpleSetIndex');
const MigratingSchema = require('../lib/Tance').MigratingSchema;

const assert = require('chai').assert;

let delay = (delayMs) => {
    return new Promise((resolve, reject)=>{
        setTimeout(()=>{
            resolve();
        }, delayMs);
    })
};

class ExpiringWidgetTable extends Table{
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
                "created_at_timestamp": {"type": "integer", "minimum": 0},
                "created_at_iso": {"type": "string"},
            },
            "additionalProperties": false,
            "required": ["id", "type", "version", "widgetOwnerId", "widgetName", "created_at_timestamp", "created_at_iso"]
        };

        let schema = new MigratingSchema({type: "Widget", v1: widgetSchemaV1, expirySeconds: 1});

        super({tance, schema, namespace});
    };
}

let tance = null;

describe("Expiring Widget Tests", function() {

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

    it("Create and don't retrieve a widget, 'cause it expired", async function () {
        this.timeout(3000);
        let table = new ExpiringWidgetTable({tance});
        let widgeotto = await table.insert({
            "widgetOwnerId": "user-"+uuid(),
            "widgetName": "testWidget",
            "created_at_timestamp": luxon.local().valueOf(),
            "created_at_iso": luxon.local().toString(),
        });

        await delay(1100);

        let widgey = await table.get(widgeotto.id);

        console.warn(widgey);

        assert.isNull(widgey);
    });
});
