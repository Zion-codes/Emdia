import { DatabaseError, isDatabaseError } from "../../database";
import { extractErrorMessage } from "./error";

jest.mock("../../database", () => {
  const actual =
    jest.requireActual<typeof import("../../database")>("../../database");
  return {
    ...actual,
    isDatabaseError: jest.fn(actual.isDatabaseError),
  };
});

const mockIsDatabaseError = jest.mocked(isDatabaseError);

describe("extractErrorMessage", () => {
  it("returns the database error message when present", () => {
    const error = new DatabaseError("VALIDATION_ERROR", "Nome inválido");
    expect(extractErrorMessage(error, "Fallback")).toBe("Nome inválido");
    expect(mockIsDatabaseError).toHaveBeenCalledWith(error);
  });

  it("falls back when the database error message is empty or whitespace", () => {
    expect(
      extractErrorMessage(new DatabaseError("VALIDATION_ERROR", ""), "Fallback")
    ).toBe("Fallback");
    expect(
      extractErrorMessage(
        new DatabaseError("VALIDATION_ERROR", "   "),
        "Fallback"
      )
    ).toBe("Fallback");
  });

  it("falls back for plain errors and unknown values", () => {
    expect(extractErrorMessage(new Error("boom"), "Fallback")).toBe("Fallback");
    expect(extractErrorMessage("erro", "Fallback")).toBe("Fallback");
    expect(extractErrorMessage(null, "Fallback")).toBe("Fallback");
  });
});
