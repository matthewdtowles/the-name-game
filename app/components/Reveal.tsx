import type { RoomView } from "@tng/shared";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useGame } from "../lib/game/GameContext";
import { colors, fonts, space, type } from "../lib/theme";
import { Button } from "./Button";
import { Screen } from "./Screen";
import { Slip } from "./Slip";

export function Reveal({ room }: { room: RoomView }) {
  const host = room.players.find((p) => p.id === room.hostId);
  // Only the host's view carries the names. A reminder reshuffles them, so a
  // new order starts again from the first slip.
  if (room.names)
    return <HostReveal key={room.names.join("\n")} names={room.names} />;
  return (
    <Screen>
      <View style={styles.listen}>
        <Text style={styles.title}>Listen up</Text>
        <Text style={styles.body}>
          {host?.displayName ?? "The host"} is reading the names. Remember them:
          the list goes away once they’re done.
        </Text>
      </View>
    </Screen>
  );
}

function HostReveal({ names }: { names: string[] }) {
  const game = useGame();
  const [index, setIndex] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const last = index === names.length - 1;

  return (
    <Screen
      footer={
        showAll ? (
          <Button
            label="Done reading"
            onPress={() => game.send({ type: "finishReveal" })}
          />
        ) : (
          <View style={styles.row}>
            <View style={styles.grow}>
              <Button
                label="Back"
                variant="secondary"
                disabled={index === 0}
                onPress={() => setIndex(index - 1)}
              />
            </View>
            <View style={styles.grow}>
              {last ? (
                <Button
                  label="Done reading"
                  onPress={() => game.send({ type: "finishReveal" })}
                />
              ) : (
                <Button label="Next name" onPress={() => setIndex(index + 1)} />
              )}
            </View>
          </View>
        )
      }
    >
      <Text style={[styles.body, styles.instructions]}>
        Read each name out loud.{" "}
        {showAll
          ? `All ${names.length} names.`
          : `Name ${index + 1} of ${names.length}.`}
      </Text>
      {showAll ? (
        <View style={styles.all}>
          {names.map((name, i) => (
            <Slip key={name} tilt={i % 2 === 0 ? -1 : 1}>
              <Text style={styles.listName}>{name}</Text>
            </Slip>
          ))}
        </View>
      ) : (
        <Slip tilt={index % 2 === 0 ? -2 : 2} style={styles.bigSlip}>
          <Text style={styles.bigName} adjustsFontSizeToFit numberOfLines={3}>
            {names[index]}
          </Text>
        </Slip>
      )}
      <Button
        label={showAll ? "One at a time" : "Show all names"}
        variant="quiet"
        onPress={() => setShowAll(!showAll)}
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
