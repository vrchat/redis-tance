

const LockingDocument = require('../lib/LockingDocument');
const Skeema = require('../lib/Skeema');
const Table = require('../lib/Table');
const SimpleSetIndex = require('../lib/Indexes/SimpleSetIndex');

class WidgetTable extends Table{
    constructor(tance){
        let widgetSchemaV1 = {
            "type": "object",
            "properties": {
                "id": {"type": "string"},
                "type": {"type": "string"},
                "version": {"type": "integer"},
                "widgetOwnerId": {"type": "string"},
                "widgetName": {"type": "string"},
                "created_at_unix": {"type": "integer", "minimum": 0},
                "created_at_iso": {"type": "string"},
            },
            "additionalProperties": false,
            "required": ["id", "type", "version", "widgetOwnerId", "widgetName", "created_at_unix", "created_at_iso"]
        };

        let schema = new Skeema({type: "Widget", v1: widgetSchemaV1});
        let widgetOwnerIndex = new SimpleSetIndex({tance: tance, type: "Widget", indexedProperty: "widgetOwnerId", sparse: false});

        super({tance: tance, schema:schema, documentClass:LockingDocument, indexes: [widgetOwnerIndex]});
    };
}
