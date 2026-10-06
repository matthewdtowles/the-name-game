import { Pressable, StyleSheet, Text } from "react-native";

import { colors, fonts, space } from "../lib/theme";

type Variant = "primary" | "secondary" | "quiet";

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text
        style={[
          styles.label,
          variant === "primary" ? styles.onMarker : styles.onTable,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 54,
    borderRadius: 14,
    paddingHorizontal: space.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { backgroundColor: colors.marker },
  secondary: { borderWidth: 2, borderColor: colors.paper },
  quiet: { minHeight: 44, paddingHorizontal: space.md },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.85 },
  disabled: { opacity: 0.4 },
  label: { fontFamily: fonts.semibold, fontSize: 18, textAlign: "center" },
  onMarker: { color: "#FFFFFF" },
  onTable: { color: colors.paper },
});
