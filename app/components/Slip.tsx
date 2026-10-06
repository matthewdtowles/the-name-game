import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, space } from "../lib/theme";

// A paper slip, the way names go into the hat. `tilt` sets it slightly askew.
export function Slip({
  children,
  tilt = 0,
  style,
}: {
  children: ReactNode;
  tilt?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[styles.slip, { transform: [{ rotate: `${tilt}deg` }] }, style]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  slip: {
    backgroundColor: colors.paper,
    borderRadius: 4,
    paddingHorizontal: space.xl,
    paddingVertical: space.lg,
    boxShadow: "0 6px 14px rgba(0, 0, 0, 0.35)",
  },
});
