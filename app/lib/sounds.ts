import type { GameView, Phase, PlayerView } from "@tng/shared";
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from "expo-audio";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { Platform } from "react-native";

// The game's sounds, for the room to hear: they play on the TV, or on the
// host's phone when there's no TV, so a table of phones never chimes at once.
// The host can turn them off. Drawn by scripts/make-sounds.mjs.

export type Cue = "slip" | "correct" | "timeUp" | "winners";

const sources: Record<Cue, number> = {
  slip: require("../assets/sounds/slip.wav"),
  correct: require("../assets/sounds/correct.wav"),
  timeUp: require("../assets/sounds/time-up.wav"),
  winners: require("../assets/sounds/winners.wav"),
};

// What the sounds follow, from a phone's room or a TV's screen.
export interface Scene {
  phase: Phase;
  slip: number | null;
  turn: string | null;
  pending: boolean;
  named: number;
  players: number;
  winners: boolean;
  timed: boolean;
}

export function sceneOf(
  view: {
    phase: Phase;
    players: PlayerView[];
    game: GameView | null;
    reveal: { index: number } | null;
  } | null,
  turnSeconds: number | null,
): Scene | null {
  if (!view) return null;
  return {
    phase: view.phase,
    slip: view.phase === "reveal" ? (view.reveal?.index ?? null) : null,
    turn: view.game?.turn ?? null,
    pending: view.game?.pending != null,
    named: view.players.filter((p) => p.name !== null).length,
    players: view.players.length,
    winners: (view.game?.winners?.length ?? 0) > 0,
    timed: turnSeconds !== null,
  };
}

// What changed between two views that's worth a sound, if anything.
export function cueFor(before: Scene | null, after: Scene | null): Cue | null {
  if (!before || !after) return null;
  if (after.phase === "over") {
    return before.phase !== "over" && after.winners ? "winners" : null;
  }
  if (after.phase === "reveal") {
    return after.slip !== null &&
      (before.phase !== "reveal" || before.slip !== after.slip)
      ? "slip"
      : null;
  }
  if (after.phase !== "play" || before.phase !== "play") return null;
  if (after.named > before.named) return "correct";
  // The turn moving on with no guess behind it, and nobody leaving, is the
  // clock running out.
  if (
    after.timed &&
    after.turn !== before.turn &&
    !before.pending &&
    !after.pending &&
    after.named === before.named &&
    after.players === before.players
  ) {
    return "timeUp";
  }
  return null;
}

let players: Partial<Record<Cue, AudioPlayer>> | null = null;

function load(): Record<Cue, AudioPlayer> {
  if (!players) {
    // Quiet with the ringer off, and over the top of anyone's music.
    setAudioModeAsync({
      playsInSilentMode: false,
      interruptionMode: "mixWithOthers",
    }).catch(() => {});
    players = {};
  }
  for (const cue of Object.keys(sources) as Cue[]) {
    players[cue] ??= createAudioPlayer(sources[cue]);
  }
  return players as Record<Cue, AudioPlayer>;
}

function play(cue: Cue) {
  try {
    const player = load()[cue];
    player
      .seekTo(0)
      .then(() => player.play())
      .catch(() => {});
  } catch {
    // A sound is never worth breaking the game over.
  }
}

export function useGameSounds(scene: Scene | null, on: boolean): void {
  const last = useRef<Scene | null>(null);
  useEffect(() => {
    if (on) load();
  }, [on]);
  useEffect(() => {
    const cue = cueFor(last.current, scene);
    last.current = scene;
    if (cue && on) play(cue);
  });
}

// Browsers keep a page quiet until someone clicks or presses a key on it,
// which a TV left on the game screen may never get.
function activated(): boolean {
  if (Platform.OS !== "web" || typeof navigator === "undefined") return true;
  return (
    (navigator as { userActivation?: { hasBeenActive: boolean } })
      .userActivation?.hasBeenActive ?? true
  );
}

function subscribeActivation(listener: () => void) {
  if (Platform.OS !== "web" || typeof window === "undefined") return () => {};
  const events = ["pointerdown", "keydown"] as const;
  // After the browser has counted the gesture.
  const later = () => setTimeout(listener, 0);
  events.forEach((e) => window.addEventListener(e, later));
  return () => events.forEach((e) => window.removeEventListener(e, later));
}

export function useSoundAllowed(): boolean {
  return useSyncExternalStore(subscribeActivation, activated, () => true);
}
