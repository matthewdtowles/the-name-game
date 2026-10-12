import type { GameView, PlayerView, RoomView } from "@tng/shared";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useAnnounce } from "../lib/announce";
import { useGame } from "../lib/game/GameContext";
import {
  bystanders,
  describeGuess,
  teamName,
  teamsOf,
  type Team,
} from "../lib/teams";
import { colors, fonts, space, type } from "../lib/theme";
import { clockText, useTurnClock } from "../lib/turnClock";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { ConfirmButton } from "./ConfirmButton";
import { Screen } from "./Screen";
import { Slip } from "./Slip";

// The guessing game on a phone: whose turn it is, the teams so far, and, on
// your turn, a Guess button on every other team's leader.
export function Play({ room }: { room: RoomView }) {
  const game = useGame();
  const play = room.game;
  const you = room.you.playerId;
  const isHost = you === room.hostId;
  const clock = useTurnClock(play, room.players, room.settings.turnSeconds);
  // The host's phone calls time; the server ignores it if the turn moved on.
  const timeUp = isHost && clock === 0 && !play?.pending ? play?.turn : null;
  const { send } = game;
  useEffect(() => {
    if (timeUp) send({ type: "timeUp", turn: timeUp });
  }, [send, timeUp]);
  const teams = teamsOf(room.players);
  const turnTeam = teams.find((t) => t.leader.id === play?.turn);
  const yourTeam = room.players.find((p) => p.id === you)?.team ?? null;
  const yourTurn = yourTeam !== null && yourTeam === play?.turn;
  const left = room.remindersLeft;
  const title = yourTurn
    ? "Your team’s turn"
    : turnTeam
      ? `${turnTeam.leader.displayName}’s team’s turn`
      : "Game on";
  useAnnounce(title);
  if (!play) return null;

  return (
    <Screen
      footer={
        isHost ? (
          <>
            {left > 0 ? (
              <Button
                label={`Read the names again (${left} left)`}
                variant="secondary"
                onPress={() => game.send({ type: "remind" })}
              />
            ) : (
              <ConfirmButton
                variant="secondary"
                label="End the round"
                confirmLabel="End it? The biggest team wins"
                onConfirm={() => game.send({ type: "endRound" })}
              />
            )}
            {play.canUndo ? (
              <Button
                label="Undo last answer"
                variant="quiet"
                onPress={() => game.send({ type: "undo" })}
              />
            ) : null}
          </>
        ) : null
      }
    >
      <View style={styles.intro}>
        <Text
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
          style={styles.title}
        >
          {title}
        </Text>
        {clock !== null ? (
          <Text
            style={styles.clock}
            accessibilityLabel={
              clock === 0
                ? "Time’s up"
                : `${clock} seconds left${play.pending ? ", paused" : ""}`
            }
          >
            {clock === 0
              ? "Time’s up"
              : `${clockText(clock)} ${play.pending ? "paused" : "to guess"}`}
          </Text>
        ) : null}
        <Text style={styles.body}>
          {yourTeam === null
            ? "You’re watching this one."
            : yourTurn
              ? "Pick another team’s leader and say who you think they wrote."
              : "Guess when it’s your team’s turn."}{" "}
          {left === 0 ? "No reminders left." : null}
        </Text>
      </View>
      {game.status !== "open" ? (
        <Banner tone="info" message="Reconnecting…" />
      ) : null}
      {game.error ? <Banner message={game.error.message} /> : null}
      <Pending room={room} play={play} />
      <View style={styles.board}>
        {teams.map((team) => (
          <TeamCard
            key={team.leader.id}
            team={team}
            you={you}
            hasTurn={team.leader.id === play.turn}
            canGuess={yourTurn && !play.pending && team.leader.id !== play.turn}
            yourName={room.you.submittedName}
            onGuess={() =>
              game.send({ type: "guess", playerId: team.leader.id })
            }
          />
        ))}
      </View>
      <Watching players={bystanders(room.players)} />
      <ConfirmButton
        label="Leave game"
        confirmLabel="Tap again to leave"
        onConfirm={() => game.send({ type: "leave" })}
      />
    </Screen>
  );
}

// A guess said out loud, waiting on the guessed player. They answer it; the
// host can answer for them, and the guessing team can take it back.
function Pending({ room, play }: { room: RoomView; play: GameView }) {
  const game = useGame();
  const pending = play.pending;
  const words = describeGuess(play, room.players);
  const you = room.you.playerId;
  const said =
    words && pending
      ? you === pending.target
        ? `${words.guesser} is guessing your name. Did they get it?`
        : `${words.guesser} is guessing ${words.target}.`
      : null;
  useAnnounce(said);
  if (!pending || !words) return null;
  const isTarget = you === pending.target;
  const isHost = you === room.hostId;
  const yourTeam = room.players.find((p) => p.id === you)?.team;
  const answer = (correct: boolean) =>
    game.send({ type: "answerGuess", correct });

  return (
    <Slip tilt={-1} style={styles.pending}>
      <Text style={styles.pendingText} accessibilityLiveRegion="polite">
        {said}
      </Text>
      {isTarget || isHost ? (
        <View style={styles.row}>
          <View style={styles.grow}>
            <Button
              label={isTarget ? "They got me" : "Right"}
              onPress={() => answer(true)}
            />
          </View>
          <View style={styles.grow}>
            <Button
              label={isTarget ? "Wrong guess" : "Wrong"}
              variant="secondary"
              onPaper
              onPress={() => answer(false)}
            />
          </View>
        </View>
      ) : null}
      {isHost && !isTarget ? (
        <Text style={styles.pendingHint}>
          Answer for {words.target} if they can’t.
        </Text>
      ) : null}
      {yourTeam === pending.team || isHost ? (
        <Button
          label="Take the guess back"
          variant="quiet"
          onPaper
          onPress={() => game.send({ type: "cancelGuess" })}
        />
      ) : null}
    </Slip>
  );
}

function TeamCard({
  team,
  you,
  hasTurn,
  canGuess,
  yourName,
  onGuess,
}: {
  team: Team;
  you: string;
  hasTurn: boolean;
  canGuess: boolean;
  yourName: string | null;
  onGuess: () => void;
}) {
  const status = hasTurn
    ? "Guessing now"
    : team.members.length === 1
      ? "1 player"
      : `${team.members.length} players`;
  return (
    <View style={[styles.team, hasTurn && styles.turn]}>
      <View
        style={styles.teamHeader}
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${teamName(team, you)}, ${status}`}
      >
        <Text style={styles.teamName}>{teamName(team, you)}</Text>
        <Text style={[styles.size, hasTurn && styles.guessing]}>{status}</Text>
      </View>
      {team.members.map((p) => (
        <Member key={p.id} player={p} you={you} yourName={yourName} />
      ))}
      {canGuess ? (
        <Button
          label={`Guess ${team.leader.displayName}`}
          variant="secondary"
          onPress={onGuess}
        />
      ) : null}
    </View>
  );
}

// A member and, once it's public, the name they wrote. You always see yours.
function Member({
  player,
  you,
  yourName,
}: {
  player: PlayerView;
  you: string;
  yourName: string | null;
}) {
  const name = player.name ?? (player.id === you ? yourName : null);
  return (
    <View
      style={styles.member}
      accessible
      accessibilityLabel={[
        player.displayName,
        player.id === you ? "you" : null,
        player.connected ? null : "away",
        name ? `wrote ${name}` : "name still secret",
      ]
        .filter(Boolean)
        .join(", ")}
    >
      <Text style={[styles.memberName, !player.connected && styles.away]}>
        {player.displayName}
        {player.id === you ? <Text style={styles.aside}> (you)</Text> : null}
      </Text>
      <Text style={name ? styles.written : styles.secret}>
        {name ?? "name still secret"}
      </Text>
    </View>
  );
}

function Watching({ players }: { players: PlayerView[] }) {
  if (players.length === 0) return null;
  return (
    <Text style={styles.aside}>
      Watching: {players.map((p) => p.displayName).join(", ")}
    </Text>
  );
}

const styles = StyleSheet.create({
  intro: { gap: space.md, paddingTop: space.xl },
  title: { ...type.title, color: colors.paper },
  clock: { ...type.strong, color: colors.paper, fontVariant: ["tabular-nums"] },
  body: { ...type.body, color: colors.dusk },
  pending: { gap: space.md },
  pendingText: { ...type.strong, color: colors.ink },
  pendingHint: { ...type.small, color: colors.ink },
  row: { flexDirection: "row", gap: space.md },
  grow: { flex: 1 },
  board: { gap: space.lg },
  team: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.tableRaised,
  },
  turn: { borderColor: colors.paper, borderWidth: 2 },
  teamHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  teamName: { ...type.strong, color: colors.paper },
  size: { ...type.small, color: colors.dusk },
  guessing: { color: colors.paper },
  member: { gap: 2, paddingVertical: space.xs },
  memberName: { ...type.body, color: colors.paper },
  written: { fontFamily: fonts.semibold, fontSize: 15, color: colors.felt },
  secret: { ...type.small, color: colors.dusk, fontStyle: "italic" },
  aside: { ...type.small, color: colors.dusk },
  away: { opacity: 0.5 },
});
