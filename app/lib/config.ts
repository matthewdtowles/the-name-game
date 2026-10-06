// The game server. Local dev runs it with `npm run dev`; to play from a phone on
// the same network, set EXPO_PUBLIC_GAME_SERVER_URL to ws://<your-lan-ip>:8787.
export const GAME_SERVER_URL =
  process.env.EXPO_PUBLIC_GAME_SERVER_URL ?? "ws://localhost:8787";

// Where invite links point. On the web it's wherever the app is served; native
// builds use EXPO_PUBLIC_WEB_URL until the production domain exists (#1).
export const WEB_URL =
  process.env.EXPO_PUBLIC_WEB_URL ??
  (typeof window !== "undefined" && window.location?.origin
    ? window.location.origin
    : "http://localhost:8081");
