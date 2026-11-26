import Storage from "expo-sqlite/kv-store";

export async function getStored(key: string): Promise<string | null> {
  try {
    return await Storage.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setStored(key: string, value: string): Promise<void> {
  try {
    await Storage.setItemAsync(key, value);
  } catch {
    return;
  }
}

export async function removeStored(key: string): Promise<void> {
  try {
    await Storage.removeItemAsync(key);
  } catch {
    return;
  }
}
