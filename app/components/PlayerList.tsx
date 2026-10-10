import type { RoomView } from "@tng/shared";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, space, type } from "../lib/theme";
import { ConfirmButton } from "./ConfirmButton";

// The lobby's players in seat order, which is the order teams take turns. Each
// row says whether that player's name is in; the name itself is never shown.
// The host can move players to match where everyone is sitting.
export function PlayerList({
  room,
  onRemove,
  onMove,
}: {
  room: RoomView;
  onRemove?: (playerId: string) => void;
  onMove?: (playerId: string, to: number) => void;
}) {
  const last = room.players.length - 1;
  return (
    <View style={styles.list}>
      {room.players.map((player, seat) => {
        const isYou = player.id === room.you.playerId;
        const status = !player.connected
          ? "away"
          : player.submitted
            ? "name in"
            : "writing";
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
              <Text style={[styles.status, status === "name in" && styles.in]}>
                {status === "name in" ? "✓ name in" : status}
              </Text>
            </View>
            {onMove ? (
              <>
                <Arrow
                  label={`Move ${player.displayName} up`}
                  symbol="↑"
                  disabled={seat === 0}
                  onPress={() => onMove(player.id, seat - 1)}
                />
                <Arrow
                  label={`Move ${player.displayName} down`}
                  symbol="↓"
                  disabled={seat === last}
                  onPress={() => onMove(player.id, seat + 1)}
                />
              </>
            ) : null}
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

function Arrow(props: {
  label: string;
  symbol: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: props.disabled }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={[styles.arrow, props.disabled && styles.arrowDisabled]}
    >
      <Text style={styles.arrowText}>{props.symbol}</Text>
    </Pressable>
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
  arrow: {
    width: 40,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  arrowDisabled: { opacity: 0.25 },
  arrowText: { ...type.strong, color: colors.paper },
});
