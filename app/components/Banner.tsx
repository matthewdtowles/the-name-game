import { StyleSheet, Text, View } from "react-native";

import { colors, space, type } from "../lib/theme";

export function Banner({
  message,
  tone = "error",
}: {
  message: string;
  tone?: "error" | "info";
}) {
  return (
    <View
      accessibilityRole="alert"
      style={[styles.banner, tone === "error" ? styles.error : styles.info]}
    >
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 12,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  error: { backgroundColor: "#5A2233" },
  info: { backgroundColor: colors.tableRaised },
  text: { ...type.body, color: colors.paper },
});
