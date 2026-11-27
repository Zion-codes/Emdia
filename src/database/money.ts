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

  const cents = Math.round((amount + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents)) {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      "Valor monetário excede o limite seguro."
    );
  }

  return cents;
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

  if (!Number.isSafeInteger(cents)) {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      "Valor monetário excede o limite seguro."
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

export function distributeCents(
  totalCents: number,
  parts: number,
  mode: "last" | "first" = "last"
): number[] {
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      "Valor em centavos deve ser um inteiro positivo."
    );
  }

  if (!Number.isInteger(parts) || parts <= 0) {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      "A quantidade de parcelas deve ser um inteiro positivo."
    );
  }

  if (totalCents < parts) {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      "O valor total deve ser de pelo menos 1 centavo por parcela."
    );
  }

  const base = Math.floor(totalCents / parts);
  const remainder = totalCents % parts;

  return Array.from({ length: parts }, (_, index) => {
    const receivesExtra =
      mode === "first" ? index < remainder : index >= parts - remainder;
    return receivesExtra ? base + 1 : base;
  });
}
