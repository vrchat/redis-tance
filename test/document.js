const redis = require('redis');
const Tance = require('../lib/Tance').Tance;
const MigratingSchema = require('../lib/Tance').MigratingSchema;
const assert = require('chai').assert;

let tance = null;

describe("Document tests", function() {

    before(async function () {
        const redisClient = redis.createClient();
        tance = new Tance(redisClient);

        await tance.ready();
        await tance.flushall();
        return;
    });

    it("Get and set an employee", async function() {
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

        let document = tance.document({schema: employeeSchema});

        let employee = {
            "firstname": "Dang",
            "lastname": "Son",
        };

        let setEmployee = await document.set(employee);

        let getEmployee = await document.get();

        assert.deepEqual(setEmployee, getEmployee);
        assert.equal(getEmployee.firstname, "Dang");
    });

    it("Invalid employee throws an error", async function() {
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

        let document = tance.document({schema: employeeSchema});

        let employee = {
            "data": "wrong"
        };

        try{
            await document.set(employee);
            assert.isTrue(false);
        }
        catch(err){
            assert.isTrue(true);
        }
    });

    it("Set an employee, then change the schema", async function() {
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

        let document = tance.document({schema: employeeSchema});

        let employee = {
            "firstname": "Dang",
            "lastname": "Son",
        };

        let setEmployee = await document.set(employee);
        let id = setEmployee.id;

        let empl2 = {
            "type": "object",
            "properties": {
                "id": {"type": "string"},
                "type": {"type": "string"},
                "version": {"type": "integer"},
                "firstname": {"type": "string"},
                "lastname": {"type": "string"},
                "fullname": {"type": "string"},
            },
            "additionalProperties": false,
            "required": ["id", "type", "version", "firstname", "lastname", "fullname"]
        };

        let newEmployeeSchema = new MigratingSchema({type: "Employee", v1: empl});
        newEmployeeSchema.addVersion(empl2, employee => {
            employee.fullname = `${employee.firstname} ${employee.lastname}`;
            return employee;
        });

        let newDocument = tance.document({schema: newEmployeeSchema, id: id});
        let getEmployee = await newDocument.get();

        // when we get the OLD document, it should, as if by magic, conform to the new schema
        assert.equal(getEmployee.fullname, "Dang Son");
    });

    it("Modify an employee", async function() {
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

        let document = tance.document({schema: employeeSchema});

        let employee = {
            "firstname": "Ilene",
            "lastname": "Dover",
        };

        let setEmployee = await document.set(employee);

        await document.modify((dover)=>{
            dover.firstname = "Ben";
            return dover;
        });

        let getEmployee = await document.get();

        assert.equal(setEmployee.firstname, "Ilene");
        assert.equal(getEmployee.firstname, "Ben");
        assert.equal(getEmployee.lastname, "Dover");
    });

    it("Delete an employee", async function() {
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

        let document = tance.document({schema: employeeSchema});

        let employee = {
            "firstname": "Ilene",
            "lastname": "Dover",
        };

        let setEmployee = await document.set(employee);

        await document.delete();

        let getEmployee = await document.get();

        assert.equal(setEmployee.firstname, "Ilene");
        assert.isNull(getEmployee);
    });

});
