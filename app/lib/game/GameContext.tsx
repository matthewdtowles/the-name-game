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

export function GameProvider({
  children,
  client,
}: {
  children: ReactNode;
  client?: GameClient;
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
    void instance.start();
    return () => instance.stop();
  }, [instance]);
  return (
    <GameContext.Provider value={instance}>{children}</GameContext.Provider>
  );
}

export function useGame() {
  const client = useContext(GameContext);
  if (!client) throw new Error("useGame must be used inside a GameProvider");
  const state = useSyncExternalStore(client.subscribe, client.getState);
  return {
    ...state,
    send: client.send.bind(client),
    clearError: client.clearError.bind(client),
  };
}
