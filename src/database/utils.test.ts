import { generateUuid, nowIsoUtc } from "./utils";

describe("database utils", () => {
  const originalCrypto = globalThis.crypto;

  afterEach(() => {
    Object.defineProperty(globalThis, "crypto", {
      value: originalCrypto,
      configurable: true,
    });
  });

  it("generates UUID using crypto.randomUUID when available", () => {
    const mockRandomUuid = jest.fn(
      () => "12345678-1234-4234-8234-123456789abc"
    );

    Object.defineProperty(globalThis, "crypto", {
      value: { randomUUID: mockRandomUuid },
      configurable: true,
    });

    expect(generateUuid()).toBe("12345678-1234-4234-8234-123456789abc");
    expect(mockRandomUuid).toHaveBeenCalledTimes(1);
  });

  it("falls back to crypto.getRandomValues and formats RFC 4122 UUIDv4", () => {
    const getRandomValues = jest.fn((bytes: Uint8Array) => {
      bytes.fill(0xff);
      return bytes;
    });

    Object.defineProperty(globalThis, "crypto", {
      value: { getRandomValues },
      configurable: true,
    });

    const uuid = generateUuid();

    expect(getRandomValues).toHaveBeenCalledTimes(1);
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(uuid).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
  });

  it("throws when crypto lacks randomUUID and getRandomValues", () => {
    Object.defineProperty(globalThis, "crypto", {
      value: {},
      configurable: true,
    });

    expect(() => generateUuid()).toThrow(
      "Crypto API unavailable for UUID generation"
    );

    Object.defineProperty(globalThis, "crypto", {
      value: undefined,
      configurable: true,
    });

    expect(() => generateUuid()).toThrow(
      "Crypto API unavailable for UUID generation"
    );
  });

  it("returns current UTC timestamp in ISO 8601 format", () => {
    jest.setSystemTime(new Date("2026-05-10T12:34:56.789Z"));

    expect(nowIsoUtc()).toBe("2026-05-10T12:34:56.789Z");
  });
});
