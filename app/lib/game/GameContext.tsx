import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";

import { GAME_SERVER_URL } from "../config";
import { GameClient } from "./client";
import { deviceSessionStorage } from "./storage";

const GameContext = createContext<GameClient | null>(null);

// `enabled` is false on TV pages: a TV only watches, and a player session
// resumed there would take that player's updates away from their phone.
export function GameProvider({
  children,
  client,
  enabled = true,
}: {
  children: ReactNode;
  client?: GameClient;
  enabled?: boolean;
}) {
  const [instance] = useState(
    () =>
      client ??
      new GameClient({
        url: GAME_SERVER_URL,
        storage: deviceSessionStorage,
        createSocket: (url) => new WebSocket(url),
      }),
  );
  useEffect(() => {
    if (!enabled) return;
    void instance.start();
    return () => instance.stop();
  }, [instance, enabled]);
  return (
    <GameContext.Provider value={instance}>{children}</GameContext.Provider>
  );
}

export function useGame() {
  const client = useContext(GameContext);
  if (!client) throw new Error("useGame must be used inside a GameProvider");
  const state = useSyncExternalStore(client.subscribe, client.getState);
  return { ...state, send: client.send, clearError: client.clearError };
}
