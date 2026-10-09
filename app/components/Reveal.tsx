import type { RevealView, RoomView } from "@tng/shared";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useGame } from "../lib/game/GameContext";
import { colors, fonts, space, type } from "../lib/theme";
import { Button } from "./Button";
import { Screen } from "./Screen";
import { Slip } from "./Slip";

export function Reveal({ room }: { room: RoomView }) {
  const host = room.players.find((p) => p.id === room.hostId);
  const hostName = host?.displayName ?? "The host";
  if (room.you.playerId === room.hostId && room.reveal) {
    return <HostReveal room={room} reveal={room.reveal} />;
  }
  return (
    <Screen>
      <View style={styles.listen}>
        <Text style={styles.title}>
          {room.tv ? "Eyes on the TV" : "Listen up"}
        </Text>
        <Text style={styles.body}>
          {room.tv
            ? `The names are on the TV. Remember them: they go away once ${hostName} is done.`
            : `${hostName} is reading the names. Remember them: the list goes away once they’re done.`}
        </Text>
      </View>
    </Screen>
  );
}

// The host steps through the reveal; with a TV attached, their phone is just
// the remote and never shows the names.
function HostReveal({ room, reveal }: { room: RoomView; reveal: RevealView }) {
  const { send } = useGame();
  const { index, total, all, names } = reveal;
  const last = index === total - 1;
  const seconds = room.settings.revealSeconds;

  // Timed reveal: the host's phone moves the slips along. The clock restarts
  // whenever the slip changes, so tapping Back or Next resets it, and showing
  // every slip pauses it.
  useEffect(() => {
    if (seconds === null || all) return;
    const timer = setTimeout(() => {
      send(
        last
          ? { type: "finishReveal" }
          : { type: "revealTo", index: index + 1 },
      );
    }, seconds * 1000);
    return () => clearTimeout(timer);
  }, [send, seconds, all, index, last]);

  const where = names ? "Read each name out loud." : "The names are on the TV.";
  const progress = all
    ? `All ${total} names.`
    : `Name ${index + 1} of ${total}.`;
  const pace =
    seconds !== null && !all ? ` Moving on every ${seconds} seconds.` : "";

  return (
    <Screen
      footer={
        all ? (
          <Button
            label="Done reading"
            onPress={() => send({ type: "finishReveal" })}
          />
        ) : (
          <View style={styles.row}>
            <View style={styles.grow}>
              <Button
                label="Back"
                variant="secondary"
                disabled={index === 0}
                onPress={() => send({ type: "revealTo", index: index - 1 })}
              />
            </View>
            <View style={styles.grow}>
              {last ? (
                <Button
                  label="Done reading"
                  onPress={() => send({ type: "finishReveal" })}
                />
              ) : (
                <Button
                  label="Next name"
                  onPress={() => send({ type: "revealTo", index: index + 1 })}
                />
              )}
            </View>
          </View>
        )
      }
    >
      <Text style={[styles.body, styles.instructions]}>
        {where} {progress}
        {pace}
      </Text>
      {names && all ? (
        <View style={styles.all}>
          {names.map((name, i) => (
            <Slip key={name} tilt={i % 2 === 0 ? -1 : 1}>
              <Text style={styles.listName}>{name}</Text>
            </Slip>
          ))}
        </View>
      ) : names ? (
        <Slip tilt={index % 2 === 0 ? -2 : 2} style={styles.bigSlip}>
          <Text style={styles.bigName} adjustsFontSizeToFit numberOfLines={3}>
            {names[index]}
          </Text>
        </Slip>
      ) : (
        <Text style={styles.onTv}>
          {all ? "All names" : `${index + 1} / ${total}`}
        </Text>
      )}
      <Button
        label={all ? "One at a time" : "Show all names"}
        variant="quiet"
        onPress={() => send({ type: "revealAll", all: !all })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  listen: { gap: space.lg, paddingTop: space.xxl },
  title: { ...type.display, color: colors.paper },
  body: { ...type.body, color: colors.dusk },
  instructions: { paddingTop: space.xxl },
  bigSlip: {
    minHeight: 260,
    justifyContent: "center",
    marginVertical: space.xl,
  },
  bigName: {
    fontFamily: fonts.heavy,
    fontSize: 52,
    lineHeight: 56,
    color: colors.ink,
  },
  onTv: {
    fontFamily: fonts.heavy,
    fontSize: 64,
    lineHeight: 72,
    color: colors.paper,
    marginVertical: space.xxl,
  },
  all: { gap: space.md },
  listName: {
    fontFamily: fonts.heavy,
    fontSize: 24,
    lineHeight: 28,
    color: colors.ink,
  },
  row: { flexDirection: "row", gap: space.md },
  grow: { flex: 1 },
});
