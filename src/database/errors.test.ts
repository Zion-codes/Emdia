import { DatabaseError, isDatabaseError } from "./errors";

describe("DatabaseError", () => {
  it("creates an error with code, message, and name", () => {
    const error = new DatabaseError("NOT_FOUND", "Registro não encontrado.");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(DatabaseError);
    expect(error.name).toBe("DatabaseError");
    expect(error.code).toBe("NOT_FOUND");
    expect(error.message).toBe("Registro não encontrado.");
  });

  it("identifies DatabaseError instances with isDatabaseError", () => {
    expect(isDatabaseError(new DatabaseError("CONFLICT", "Conflito."))).toBe(
      true
    );
    expect(
      isDatabaseError(new DatabaseError("VALIDATION_ERROR", "Inválido."))
    ).toBe(true);
    expect(isDatabaseError(new DatabaseError("FORBIDDEN", "Proibido."))).toBe(
      true
    );
    expect(isDatabaseError(new Error("generic"))).toBe(false);
    expect(isDatabaseError("not an error")).toBe(false);
    expect(isDatabaseError(null)).toBe(false);
  });
});
