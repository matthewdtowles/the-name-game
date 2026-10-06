import type { RoomView } from "@tng/shared";
import { StyleSheet, Text, View } from "react-native";

import { colors, space, type } from "../lib/theme";
import { ConfirmButton } from "./ConfirmButton";

// In seat order. During the lobby each row says whether that player's name is
// in; the name itself is never shown.
export function PlayerList({
  room,
  showSubmitted,
  onRemove,
}: {
  room: RoomView;
  showSubmitted: boolean;
  onRemove?: (playerId: string) => void;
}) {
  return (
    <View style={styles.list}>
      {room.players.map((player) => {
        const isYou = player.id === room.you.playerId;
        const status = !player.connected
          ? "away"
          : showSubmitted
            ? player.submitted
              ? "name in"
              : "writing"
            : null;
        return (
          <View key={player.id} style={styles.row}>
            <View style={styles.who}>
              <Text style={styles.name} numberOfLines={1}>
                {player.displayName}
                {isYou ? <Text style={styles.aside}> (you)</Text> : null}
                {player.id === room.hostId ? (
                  <Text style={styles.aside}> hosting</Text>
                ) : null}
              </Text>
              {status ? (
                <Text
                  style={[styles.status, status === "name in" && styles.in]}
                >
                  {status === "name in" ? "✓ name in" : status}
                </Text>
              ) : null}
            </View>
            {onRemove && !isYou ? (
              <ConfirmButton
                label="Remove"
                confirmLabel="Tap to remove"
                onConfirm={() => onRemove(player.id)}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  who: { flex: 1, gap: 2, paddingVertical: space.sm },
  name: { ...type.strong, color: colors.paper },
  aside: { ...type.small, color: colors.dusk },
  status: { ...type.small, color: colors.dusk },
  in: { color: colors.felt },
});
