// src/errors/general.errors.ts
export class AppError extends Error {
  constructor(
    message: string,
    public code: string = 'APP_ERROR',
    public status: number = 400
  ) {
    super(message)
    this.name = this.constructor.name
  }
}

export class InvalidInputError extends AppError {
  constructor(message = 'Invalid input') {
    super(message, 'INVALID_INPUT', 400)
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 'FORBIDDEN', 403)
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 'NOT_FOUND', 404)
  }
}
