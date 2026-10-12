import type { GameView, PlayerView } from "@tng/shared";
import { useEffect, useRef, useState } from "react";

// The turn clock, run on every phone and TV from the room they're sent. A team
// gets the full time each time it's up to guess: when the turn passes, and
// again after each right guess. A guess waiting for an answer pauses it, and
// taking that guess back picks up where it left off. Only the host's phone acts
// on it running out.
export function useTurnClock(
  game: GameView | null,
  players: PlayerView[],
  seconds: number | null,
): number | null {
  // Names go public as they're guessed, so their count tells one right guess
  // from the next on the same turn.
  const guessed = players.filter((p) => p.name !== null).length;
  const key =
    game && !game.winners && seconds ? `${game.turn}:${guessed}` : null;
  const paused = game?.pending != null;
  const clock = useRef<{ key: string; leftMs: number } | null>(null);
  // What's on screen, tagged with the turn it belongs to so a new turn never
  // shows the last one's time (a stale 0 would call time on the new team).
  const [shown, setShown] = useState<{ key: string; left: number } | null>(
    null,
  );

  useEffect(() => {
    if (key === null || seconds === null) {
      clock.current = null;
      return;
    }
    if (clock.current?.key !== key)
      clock.current = { key, leftMs: seconds * 1000 };
    if (paused) return;
    const current = clock.current;
    const since = Date.now();
    const timer = setInterval(() => {
      const ms = current.leftMs - (Date.now() - since);
      const left = Math.max(0, Math.ceil(ms / 1000));
      setShown((was) =>
        was?.key === key && was.left === left ? was : { key, left },
      );
    }, 250);
    return () => {
      clearInterval(timer);
      current.leftMs -= Date.now() - since;
    };
  }, [key, paused, seconds]);

  if (key === null || seconds === null) return null;
  return shown?.key === key ? shown.left : seconds;
}

export function clockText(seconds: number): string {
  const s = seconds % 60;
  return `${Math.floor(seconds / 60)}:${s < 10 ? "0" : ""}${s}`;
}
