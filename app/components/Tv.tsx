import type { ScreenView } from "@tng/shared";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";

import { GAME_SERVER_URL, WEB_URL } from "../lib/config";
import type { Status } from "../lib/game/connection";
import { ScreenClient } from "../lib/game/screenClient";
import { tvCodeStorage } from "../lib/game/storage";
import { joinUrl } from "../lib/invite";
import { describeGuess, teamsOf } from "../lib/teams";
import { colors, fonts, space } from "../lib/theme";
import { winnersText } from "./Over";
import { Slip } from "./Slip";

// The game on a TV, read from across the room: a big code and QR to join,
// then the slips during the reveal. It only watches; phones do the playing.
export function Tv({ code }: { code?: string }) {
  const [client] = useState(
    () =>
      new ScreenClient({
        url: GAME_SERVER_URL,
        storage: tvCodeStorage,
        createSocket: (url) => new WebSocket(url),
        code,
      }),
  );
  useEffect(() => {
    client.start();
    return () => client.stop();
  }, [client]);
  const { status, screen } = useSyncExternalStore(
    client.subscribe,
    client.getState,
  );
  return (
    <TvView
      status={status}
      screen={screen}
      onNewGame={() => client.newGame()}
    />
  );
}

export function TvView({
  status,
  screen,
  onNewGame,
}: {
  status: Status;
  screen: ScreenView | null;
  onNewGame: () => void;
}) {
  // Type scales with the screen, from a laptop up to a big TV.
  const { width } = useWindowDimensions();
  const k = Math.min(Math.max(width / 1280, 0.6), 2);

  return (
    <View style={styles.frame}>
      {!screen ? (
        <Text style={[styles.status, { fontSize: 28 * k }]}>
          {status === "open" ? "Setting up a game…" : "Connecting…"}
        </Text>
      ) : screen.phase === "lobby" ? (
        <Lobby screen={screen} k={k} />
      ) : screen.phase === "reveal" && screen.reveal ? (
        <Reveal reveal={screen.reveal} k={k} />
      ) : screen.phase === "over" ? (
        <Over screen={screen} k={k} onNewGame={onNewGame} />
      ) : (
        <Play screen={screen} k={k} />
      )}
      {screen && status !== "open" ? (
        <Text style={[styles.reconnecting, { fontSize: 18 * k }]}>
          Reconnecting…
        </Text>
      ) : null}
    </View>
  );
}

function Lobby({ screen, k }: { screen: ScreenView; k: number }) {
  const host = screen.players.find((p) => p.id === screen.hostId);
  const site = WEB_URL.replace(/^https?:\/\//, "");
  return (
    <View style={[styles.lobby, { gap: space.xxl * k }]}>
      <View style={[styles.join, { gap: space.xl * k }]}>
        <Text style={[styles.title, { fontSize: 64 * k, lineHeight: 70 * k }]}>
          Whose Name?
        </Text>
        <Text style={[styles.body, { fontSize: 28 * k, lineHeight: 38 * k }]}>
          Scan the code, or go to {site} and enter
        </Text>
        <View style={[styles.codeRow, { gap: space.xxl * k }]}>
          <Slip tilt={-2}>
            <Text
              style={[
                styles.code,
                { fontSize: 120 * k, letterSpacing: 24 * k },
              ]}
            >
              {screen.code}
            </Text>
          </Slip>
          <Slip tilt={2}>
            <QRCode
              value={joinUrl(screen.code)}
              size={200 * k}
              color={colors.ink}
              backgroundColor={colors.paper}
            />
          </Slip>
        </View>
        <Text style={[styles.body, { fontSize: 24 * k, lineHeight: 32 * k }]}>
          {host
            ? `${host.displayName} starts the reveal once everyone’s name is in.`
            : "The first player to join hosts the game."}
        </Text>
      </View>
      <Players screen={screen} k={k} />
    </View>
  );
}

function Reveal({
  reveal,
  k,
}: {
  reveal: NonNullable<ScreenView["reveal"]>;
  k: number;
}) {
  if (reveal.slips.length === 1) {
    return (
      <View style={[styles.center, { gap: space.xxl * k }]}>
        <Text style={[styles.body, { fontSize: 28 * k }]}>
          Name {reveal.index + 1} of {reveal.total}
        </Text>
        <Slip
          tilt={reveal.index % 2 === 0 ? -2 : 2}
          style={[styles.bigSlip, { paddingVertical: space.xxl * k }]}
        >
          <Text
            style={[
              styles.slipName,
              { fontSize: 120 * k, lineHeight: 128 * k },
            ]}
            adjustsFontSizeToFit
            numberOfLines={2}
          >
            {reveal.slips[0]}
          </Text>
        </Slip>
      </View>
    );
  }
  return (
    <View style={[styles.grid, { gap: space.xl * k }]}>
      {reveal.slips.map((name, i) => (
        <Slip key={name} tilt={i % 2 === 0 ? -1.5 : 1.5}>
          <Text
            style={[styles.slipName, { fontSize: 44 * k, lineHeight: 50 * k }]}
          >
            {name}
          </Text>
        </Slip>
      ))}
    </View>
  );
}

// The game board, for everyone to follow from the couch.
function Play({ screen, k }: { screen: ScreenView; k: number }) {
  const game = screen.game;
  const teams = teamsOf(screen.players);
  const turn = teams.find((t) => t.leader.id === game?.turn);
  const guess = game ? describeGuess(game, screen.players) : null;
  const left = screen.remindersLeft;
  return (
    <View style={{ gap: space.xl * k }}>
      <Text style={[styles.title, { fontSize: 72 * k, lineHeight: 80 * k }]}>
        {turn ? `${turn.leader.displayName}’s team’s turn` : "Game on"}
      </Text>
      <Text style={[styles.body, { fontSize: 30 * k, lineHeight: 40 * k }]}>
        {guess
          ? `${guess.guesser} is guessing ${guess.target}…`
          : "Pick another team’s leader and say who you think they wrote."}{" "}
        {left === 0
          ? "No reminders left."
          : `${left === 1 ? "1 reminder" : `${left} reminders`} left.`}
      </Text>
      <View style={[styles.board, { gap: space.xl * k }]}>
        {teams.map((team) => (
          <View
            key={team.leader.id}
            style={[
              styles.team,
              { padding: space.lg * k, gap: space.sm * k },
              team.leader.id === game?.turn && styles.turn,
            ]}
          >
            <Text style={[styles.teamName, { fontSize: 30 * k }]}>
              {team.leader.displayName}’s team
            </Text>
            {team.members.map((p) => (
              <View key={p.id}>
                <Text style={[styles.player, { fontSize: 26 * k }]}>
                  {p.displayName}
                </Text>
                <Text
                  style={[
                    p.name ? styles.written : styles.secret,
                    { fontSize: 22 * k },
                  ]}
                >
                  {p.name ?? "?"}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

// The end: who won, then every slip with the player who wrote it.
function Over({
  screen,
  k,
  onNewGame,
}: {
  screen: ScreenView;
  k: number;
  onNewGame: () => void;
}) {
  const { title, detail } = winnersText(screen);
  return (
    <View style={[styles.center, { gap: space.xl * k }]}>
      <Text style={[styles.title, { fontSize: 88 * k, lineHeight: 96 * k }]}>
        {title}
      </Text>
      {detail ? (
        <Text style={[styles.body, { fontSize: 30 * k, lineHeight: 40 * k }]}>
          {detail}
        </Text>
      ) : null}
      <View style={[styles.grid, { gap: space.lg * k }]}>
        {screen.players
          .filter((p) => p.name)
          .map((p, i) => (
            <Slip key={p.id} tilt={i % 2 === 0 ? -1.5 : 1.5}>
              <Text style={[styles.slipName, { fontSize: 32 * k }]}>
                {p.name}
              </Text>
              <Text style={[styles.wroteBy, { fontSize: 20 * k }]}>
                {p.displayName}
              </Text>
            </Slip>
          ))}
      </View>
      <Pressable accessibilityRole="button" onPress={onNewGame}>
        <Text style={[styles.newGame, { fontSize: 20 * k }]}>
          Start a new game
        </Text>
      </Pressable>
    </View>
  );
}

function Players({ screen, k }: { screen: ScreenView; k: number }) {
  if (screen.players.length === 0) return null;
  return (
    <View
      style={[
        styles.players,
        { rowGap: space.md * k, columnGap: space.xxl * k },
      ]}
    >
      {screen.players.map((p) => (
        <Text
          key={p.id}
          style={[
            styles.player,
            { fontSize: 32 * k, lineHeight: 40 * k },
            !p.connected && styles.away,
          ]}
        >
          {p.submitted ? "✓ " : ""}
          {p.displayName}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    backgroundColor: colors.table,
    padding: "5%",
    justifyContent: "center",
  },
  status: {
    fontFamily: fonts.semibold,
    color: colors.dusk,
    textAlign: "center",
  },
  reconnecting: {
    position: "absolute",
    bottom: space.lg,
    right: space.xl,
    fontFamily: fonts.regular,
    color: colors.dusk,
  },
  lobby: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
  },
  join: { flexShrink: 1 },
  codeRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  title: { fontFamily: fonts.heavy, color: colors.paper },
  body: { fontFamily: fonts.regular, color: colors.dusk },
  code: { fontFamily: fonts.heavy, color: colors.ink },
  center: { alignItems: "center" },
  bigSlip: { minWidth: "60%", maxWidth: "90%", alignItems: "center" },
  slipName: { fontFamily: fonts.heavy, color: colors.ink, textAlign: "center" },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignContent: "center",
  },
  players: { flexDirection: "row", flexWrap: "wrap", maxWidth: 900 },
  player: { fontFamily: fonts.semibold, color: colors.paper },
  away: { opacity: 0.4 },
  board: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start" },
  team: {
    minWidth: 220,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.tableRaised,
  },
  turn: { borderColor: colors.paper },
  teamName: { fontFamily: fonts.heavy, color: colors.paper },
  written: { fontFamily: fonts.semibold, color: colors.felt },
  secret: { fontFamily: fonts.regular, color: colors.dusk },
  wroteBy: {
    fontFamily: fonts.regular,
    color: colors.ink,
    textAlign: "center",
  },
  newGame: {
    fontFamily: fonts.semibold,
    color: colors.dusk,
    paddingTop: space.xl,
  },
});
