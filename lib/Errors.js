'use strict';

class SchemaError extends Error {};
class DocumentValidationError extends Error {};
class LockError extends Error {};
class IndexError extends Error {};
class TableError extends Error {};
class CrossSlotError extends Error {};

module.exports = {
    SchemaError,
    DocumentValidationError,
    LockError,
    IndexError,
    TableError,
    CrossSlotError,
};