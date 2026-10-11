import { useEffect } from "react";
import { AccessibilityInfo, Platform } from "react-native";

// Screen readers don't read text that changes on its own. Android and the web
// read it from a live region (`accessibilityLiveRegion`), so on iOS the change
// is spoken outright, whenever `message` becomes a new one.
export function useAnnounce(message: string | null | undefined): void {
  useEffect(() => {
    if (message && Platform.OS === "ios")
      AccessibilityInfo.announceForAccessibility(message);
  }, [message]);
}
