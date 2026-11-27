import * as Crypto from "expo-crypto";
import { generateUuid, nowIsoUtc } from "./utils";

describe("database utils", () => {
  it("delegates UUID generation to expo-crypto randomUUID", () => {
    const uuid = generateUuid();

    expect(Crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it("returns current UTC timestamp in ISO 8601 format", () => {
    jest.setSystemTime(new Date("2026-05-10T12:34:56.789Z"));

    expect(nowIsoUtc()).toBe("2026-05-10T12:34:56.789Z");
  });
});
