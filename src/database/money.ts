import { DatabaseError } from "./errors";

export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) {
    throw new DatabaseError("VALIDATION_ERROR", "Valor monetário inválido.");
  }

  if (amount < 0) {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      "O valor não pode ser negativo."
    );
  }

  return Math.round((amount + Number.EPSILON) * 100);
}

export function toPositiveCents(amount: number): number {
  if (!Number.isFinite(amount)) {
    throw new DatabaseError("VALIDATION_ERROR", "Valor monetário inválido.");
  }

  if (amount <= 0) {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      "O valor deve ser maior que zero."
    );
  }

  const cents = Math.round((amount + Number.EPSILON) * 100);
  if (cents <= 0) {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      "O valor deve ser maior que zero."
    );
  }

  return cents;
}

export function fromCents(cents: number): number {
  if (!Number.isFinite(cents)) {
    throw new DatabaseError("VALIDATION_ERROR", "Valor em centavos inválido.");
  }

  return Math.round(cents) / 100;
}
