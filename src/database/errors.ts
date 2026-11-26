export type DatabaseErrorCode =
  "VALIDATION_ERROR" | "NOT_FOUND" | "CONFLICT" | "FORBIDDEN";

export class DatabaseError extends Error {
  readonly code: DatabaseErrorCode;

  constructor(code: DatabaseErrorCode, message: string) {
    super(message);
    this.name = "DatabaseError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isDatabaseError(error: unknown): error is DatabaseError {
  return error instanceof DatabaseError;
}
