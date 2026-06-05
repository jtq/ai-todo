import { validationError } from "./errors.js";

const utcDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function nowUtc(): string {
  return new Date().toISOString();
}

export function assertUtcDateTime(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== "string" || !utcDateTimePattern.test(value) || Number.isNaN(Date.parse(value))) {
    throw validationError(`${fieldName} must be a UTC ISO 8601 datetime ending in Z`);
  }
}

export function assertDateOnly(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== "string" || !datePattern.test(value)) {
    throw validationError(`${fieldName} must be a date string in YYYY-MM-DD format`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw validationError(`${fieldName} must be a valid calendar date`);
  }
}
