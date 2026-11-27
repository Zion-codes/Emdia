import * as Crypto from "expo-crypto";

export function generateUuid(): string {
  return Crypto.randomUUID();
}

export function nowIsoUtc(): string {
  return new Date().toISOString();
}
