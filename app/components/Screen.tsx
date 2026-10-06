import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, space } from "../lib/theme";

// One column, capped for tablets and desktop browsers, with the primary
// actions pinned to the bottom where a thumb can reach them.
export function Screen({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.column}>{children}</View>
      </ScrollView>
      {footer ? (
        <View style={styles.footerWrap}>
          <View style={[styles.column, styles.footer]}>{footer}</View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.table },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: space.xl,
    paddingVertical: space.xl,
  },
  column: { width: "100%", maxWidth: 520, alignSelf: "center", gap: space.xl },
  footerWrap: {
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  footer: { gap: space.md },
});
