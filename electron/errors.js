class AppError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super('VALIDATION_ERROR', message);
  }
}

class NotFoundError extends AppError {
  constructor(message) {
    super('NOT_FOUND', message);
  }
}

class InsufficientStockError extends AppError {
  constructor(message) {
    super('INSUFFICIENT_STOCK', message);
  }
}

class ConflictError extends AppError {
  constructor(message) {
    super('CONFLICT', message);
  }
}

class DatabaseError extends AppError {
  constructor(message) {
    super('DATABASE_ERROR', message);
  }
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  InsufficientStockError,
  ConflictError,
  DatabaseError,
};
