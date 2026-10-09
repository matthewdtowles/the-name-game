import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import type { Session, SessionStorage } from "./client";
import type { CodeStorage } from "./screenClient";

const KEY = "tng.session";

// SecureStore on iOS and Android. On the web there's no keychain, so the session
// lives in localStorage, which can be missing or throw (private browsing).
export const deviceSessionStorage: SessionStorage =
  Platform.OS === "web"
    ? {
        load: async () => parse(tryLocalStorage((s) => s.getItem(KEY))),
        save: async (session) =>
          void tryLocalStorage((s) => s.setItem(KEY, JSON.stringify(session))),
        clear: async () => void tryLocalStorage((s) => s.removeItem(KEY)),
      }
    : {
        load: async () => parse(await SecureStore.getItemAsync(KEY)),
        save: (session) =>
          SecureStore.setItemAsync(KEY, JSON.stringify(session)),
        clear: () => SecureStore.deleteItemAsync(KEY),
      };

// The room a TV is showing, so a reload goes back to it. TVs are browsers.
const TV_KEY = "tng.tv";
export const tvCodeStorage: CodeStorage = {
  load: () => tryLocalStorage((s) => s.getItem(TV_KEY)),
  save: (code) => void tryLocalStorage((s) => s.setItem(TV_KEY, code)),
  clear: () => void tryLocalStorage((s) => s.removeItem(TV_KEY)),
};

function tryLocalStorage<T>(access: (storage: Storage) => T): T | null {
  try {
    return access(window.localStorage);
  } catch {
    return null;
  }
}

function parse(raw: string | null | undefined): Session | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Session>;
    if (value.code && value.playerId && value.sessionToken)
      return value as Session;
  } catch {
    // Unreadable: treat as no session.
  }
  return null;
}
