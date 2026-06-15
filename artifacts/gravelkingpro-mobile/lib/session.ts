import AsyncStorage from "@react-native-async-storage/async-storage";

const SESSION_KEY = "gk_session";

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function getOrCreateSession(): Promise<string> {
  let session = await AsyncStorage.getItem(SESSION_KEY);
  if (!session) {
    session = generateUUID();
    await AsyncStorage.setItem(SESSION_KEY, session);
  }
  return session;
}

export async function getSession(): Promise<string | null> {
  return AsyncStorage.getItem(SESSION_KEY);
}
