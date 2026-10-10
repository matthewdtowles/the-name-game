import type { RoomView } from "@tng/shared";
import { StyleSheet, Text, View } from "react-native";

import { useGame } from "../lib/game/GameContext";
import { teamsOf } from "../lib/teams";
import { colors, fonts, space, type } from "../lib/theme";
import { Button } from "./Button";
import { ConfirmButton } from "./ConfirmButton";
import { Screen } from "./Screen";
import { Slip } from "./Slip";

// The end: who won, and finally, who wrote what.
export function Over({ room }: { room: RoomView }) {
  const game = useGame();
  const isHost = room.you.playerId === room.hostId;
  const host = room.players.find((p) => p.id === room.hostId);

  return (
    <Screen
      footer={
        isHost ? (
          <>
            <Button
              label="Play again"
              onPress={() => game.send({ type: "playAgain" })}
            />
            {room.game?.canUndo ? (
              <Button
                label="Undo, back to the game"
                variant="quiet"
                onPress={() => game.send({ type: "undo" })}
              />
            ) : null}
          </>
        ) : (
          <Text style={styles.hint}>
            {host?.displayName ?? "The host"} can start another game with
            everyone here.
          </Text>
        )
      }
    >
      <Winners room={room} />
      <View style={styles.section}>
        <Text style={styles.heading}>Who wrote what</Text>
        {room.players.map((p, i) => (
          <View key={p.id} style={styles.row}>
            <Text style={styles.player}>{p.displayName}</Text>
            {p.name ? (
              <Slip tilt={i % 2 === 0 ? -1 : 1} style={styles.slip}>
                <Text style={styles.slipName}>{p.name}</Text>
              </Slip>
            ) : (
              <Text style={styles.hint}>didn’t put a name in</Text>
            )}
          </View>
        ))}
      </View>
      <ConfirmButton
        label="Leave game"
        confirmLabel="Tap again to leave"
        onConfirm={() => game.send({ type: "leave" })}
      />
    </Screen>
  );
}

export function winnersText(room: Pick<RoomView, "players" | "game">): {
  title: string;
  detail: string;
} {
  const winners = room.game?.winners ?? [];
  const teams = teamsOf(room.players).filter((t) =>
    winners.includes(t.leader.id),
  );
  const names = (members: { displayName: string }[]) =>
    members.map((m) => m.displayName).join(", ");
  if (teams.length === 1) {
    return {
      title: `${teams[0]!.leader.displayName}’s team wins`,
      detail: names(teams[0]!.members),
    };
  }
  if (teams.length > 1) {
    return {
      title: "It’s a tie",
      detail: teams
        .map((t) => `${t.leader.displayName}’s team (${names(t.members)})`)
        .join(" and "),
    };
  }
  return { title: "Game over", detail: "" };
}

function Winners({ room }: { room: RoomView }) {
  const { title, detail } = winnersText(room);
  return (
    <View style={styles.intro}>
      <Text style={styles.title}>{title}</Text>
      {detail ? <Text style={styles.body}>{detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { gap: space.md, paddingTop: space.xxl },
  title: { ...type.display, color: colors.paper },
  body: { ...type.body, color: colors.dusk },
  section: { gap: space.md },
  heading: { ...type.strong, color: colors.paper },
  row: { gap: space.xs },
  player: { ...type.body, color: colors.paper },
  slip: { alignSelf: "flex-start", paddingVertical: space.sm },
  slipName: { fontFamily: fonts.heavy, fontSize: 22, color: colors.ink },
  hint: { ...type.small, color: colors.dusk },
});
