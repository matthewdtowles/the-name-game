import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

import { colors, fonts, space, type } from "../lib/theme";

// `onSlip` writes on paper, for the secret name; otherwise the field sits on the table.
export function Field({
  label,
  onSlip = false,
  error,
  ...input
}: TextInputProps & {
  label: string;
  onSlip?: boolean;
  error?: string | null;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={onSlip ? "#8C8577" : colors.dusk}
        style={[styles.input, onSlip ? styles.slip : styles.table]}
        {...input}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  label: { ...type.strong, color: colors.paper },
  input: {
    minHeight: 54,
    borderRadius: 12,
    paddingHorizontal: space.lg,
    fontFamily: fonts.semibold,
    fontSize: 20,
  },
  table: {
    backgroundColor: colors.tableRaised,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.paper,
  },
  slip: { backgroundColor: colors.paper, color: colors.ink, borderRadius: 4 },
  error: { ...type.small, color: "#FF8A8E" },
});
