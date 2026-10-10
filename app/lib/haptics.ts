import type { RoomView } from "@tng/shared";
import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";

// A phone at a party is in a pocket or face down, so it buzzes for the moments
// its player can't miss: someone guessing their name, their team's turn
// starting, and a guess that changes their team.

export type Buzz = "guessed" | "turn" | "grew" | "captured";

export interface Moment {
  team: string | null;
  teamSize: number;
  yourTurn: boolean;
  guessedAtYou: boolean;
}

export function momentOf(room: RoomView | null): Moment | null {
  const game = room?.game;
  if (!room || !game || room.phase !== "play") return null;
  const you = room.you.playerId;
  const team = room.players.find((p) => p.id === you)?.team ?? null;
  return {
    team,
    teamSize: room.players.filter((p) => team !== null && p.team === team)
      .length,
    yourTurn: team !== null && game.turn === team,
    guessedAtYou: game.pending?.target === you,
  };
}

// What changed between two views of the game that's worth a buzz, if anything.
export function buzzFor(
  before: Moment | null,
  after: Moment | null,
): Buzz | null {
  if (!before || !after) return null;
  if (after.team !== before.team && after.team !== null) return "captured";
  if (after.teamSize > before.teamSize) return "grew";
  if (after.guessedAtYou && !before.guessedAtYou) return "guessed";
  if (after.yourTurn && !before.yourTurn) return "turn";
  return null;
}

const feel: Record<Buzz, () => Promise<void>> = {
  guessed: () =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  turn: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
  grew: () =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  captured: () =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
};

export function useGameBuzz(room: RoomView | null): void {
  const moment = momentOf(room);
  const last = useRef<Moment | null>(null);
  useEffect(() => {
    const buzz = buzzFor(last.current, moment);
    last.current = moment;
    if (buzz) feel[buzz]().catch(() => {});
  });
}
