import type { GameView, PlayerView } from "@tng/shared";

// The game's teams for display, in seat order of their leaders. Each team's
// leader comes first; it's the one member whose name is still a secret.

export interface Team {
  leader: PlayerView;
  members: PlayerView[];
}

export function teamsOf(players: PlayerView[]): Team[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  return players
    .filter((p) => p.team === p.id)
    .map((leader) => ({
      leader,
      members: [
        leader,
        ...players.filter((p) => p.team === leader.id && p.id !== leader.id),
      ],
    }))
    .filter((team) => byId.has(team.leader.id));
}

// Players in the room who aren't on any team still in the game: those who put
// no name in, and the members of a team whose leader left.
export function bystanders(players: PlayerView[]): PlayerView[] {
  const leaders = new Set(teamsOf(players).map((t) => t.leader.id));
  return players.filter((p) => p.team === null || !leaders.has(p.team));
}

export function teamName(team: Team, you: string): string {
  return team.members.some((p) => p.id === you)
    ? "Your team"
    : `${team.leader.displayName}’s team`;
}

// Who's guessing whom, in words, for a pending guess.
export function describeGuess(
  game: GameView,
  players: PlayerView[],
): { guesser: string; target: string } | null {
  if (!game.pending) return null;
  const name = (id: string) =>
    players.find((p) => p.id === id)?.displayName ?? "Someone";
  return { guesser: name(game.pending.by), target: name(game.pending.target) };
}
