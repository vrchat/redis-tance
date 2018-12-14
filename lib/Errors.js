class SchemaError extends Error {};
class DocumentValidationError extends Error {};
class LockError extends Error {};
class IndexError extends Error {};

module.exports = {
    SchemaError,
    DocumentValidationError,
    LockError,
    IndexError,
};