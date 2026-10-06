import { Platform, Share } from "react-native";

import { WEB_URL } from "./config";

export function joinUrl(code: string): string {
  return `${WEB_URL}/j/${code}`;
}

// The system share sheet where there is one; otherwise copy the link.
// Returns what happened so the caller can confirm a copy.
export async function shareInvite(
  code: string,
): Promise<"shared" | "copied" | "failed"> {
  const url = joinUrl(code);
  const message = `Join my game of The Name Game: ${url}`;
  try {
    if (Platform.OS !== "web") {
      await Share.share({ message });
      return "shared";
    }
    if (typeof navigator.share === "function") {
      await navigator.share({ title: "The Name Game", text: message, url });
      return "shared";
    }
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
