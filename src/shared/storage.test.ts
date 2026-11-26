import Storage from "expo-sqlite/kv-store";
import { getStored, removeStored, setStored } from "./storage";

describe("storage", () => {
  it("stores, reads and removes values", async () => {
    expect(await getStored("missing")).toBeNull();

    await setStored("theme", "dark");
    expect(await getStored("theme")).toBe("dark");

    await removeStored("theme");
    expect(await getStored("theme")).toBeNull();
  });

  it("swallows storage errors safely", async () => {
    jest.mocked(Storage.getItemAsync).mockRejectedValueOnce(new Error("read"));
    jest.mocked(Storage.setItemAsync).mockRejectedValueOnce(new Error("write"));
    jest
      .mocked(Storage.removeItemAsync)
      .mockRejectedValueOnce(new Error("remove"));

    expect(await getStored("k")).toBeNull();
    await expect(setStored("k", "v")).resolves.toBeUndefined();
    await expect(removeStored("k")).resolves.toBeUndefined();
  });
});
