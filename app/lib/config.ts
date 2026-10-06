// The game server. Local dev runs it with `npm run dev`; to play from a phone on
// the same network, set EXPO_PUBLIC_GAME_SERVER_URL to ws://<your-lan-ip>:8787.
export const GAME_SERVER_URL =
  process.env.EXPO_PUBLIC_GAME_SERVER_URL ?? "ws://localhost:8787";
