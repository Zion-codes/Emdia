import { isDatabaseError } from "../../database";

export function extractErrorMessage(error: unknown, fallback: string): string {
  if (isDatabaseError(error) && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}
