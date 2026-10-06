import type { RoomView } from "@tng/shared";
import { StyleSheet, Text, View } from "react-native";

import { useGame } from "../lib/game/GameContext";
import { colors, space, type } from "../lib/theme";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { ConfirmButton } from "./ConfirmButton";
import { PlayerList } from "./PlayerList";
import { Screen } from "./Screen";

export function Play({ room }: { room: RoomView }) {
  const game = useGame();
  const isHost = room.you.playerId === room.hostId;
  const left = room.remindersLeft;

  return (
    <Screen
      footer={
        isHost ? (
          <Button
            label={left === 0 ? "No reminders left" : "Read the names again"}
            variant="secondary"
            disabled={left === 0}
            onPress={() => game.send({ type: "remind" })}
          />
        ) : null
      }
    >
      <View style={styles.intro}>
        <Text style={styles.title}>Game on</Text>
        <Text style={styles.body}>
          Take turns guessing who wrote which name. Guess right and they join
          your team.
        </Text>
        <Text style={styles.body}>
          {left === 0
            ? "No reminders left."
            : `${left === 1 ? "1 reminder" : `${left} reminders`} left.`}
        </Text>
      </View>
      {game.status !== "open" ? (
        <Banner tone="info" message="Reconnecting…" />
      ) : null}
      {game.error ? <Banner message={game.error.message} /> : null}
      <PlayerList room={room} showSubmitted={false} />
      <ConfirmButton
        label="Leave game"
        confirmLabel="Tap again to leave"
        onConfirm={() => game.send({ type: "leave" })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: space.md, paddingTop: space.xxl },
  title: { ...type.display, color: colors.paper },
  body: { ...type.body, color: colors.dusk },
});
