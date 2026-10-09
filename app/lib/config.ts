// The game server. Local dev runs it with `npm run dev`; to play from a phone on
// the same network, set EXPO_PUBLIC_GAME_SERVER_URL to ws://<your-lan-ip>:8787.
export const GAME_SERVER_URL =
  process.env.EXPO_PUBLIC_GAME_SERVER_URL ?? "ws://localhost:8787";

// Where invite links point. CI builds set EXPO_PUBLIC_WEB_URL per stage
// (https://whosename.app in prod); local dev uses wherever the app is served.
export const WEB_URL =
  process.env.EXPO_PUBLIC_WEB_URL ??
  (typeof window !== "undefined" && window.location?.origin
    ? window.location.origin
    : "http://localhost:8081");
