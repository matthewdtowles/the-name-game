import { Platform, Share } from "react-native";

import { WEB_URL } from "./config";

export function joinUrl(code: string): string {
  return `${WEB_URL}/j/${code}`;
}

// Where a TV shows an existing game.
export function tvUrl(code: string): string {
  return `${WEB_URL}/tv/${code}`;
}

// The system share sheet where there is one; otherwise copy the link.
// Returns what happened so the caller can confirm a copy.
export async function shareInvite(
  code: string,
): Promise<"shared" | "copied" | "failed"> {
  const url = joinUrl(code);
  const message = `Come play Whose Name? with me: ${url}`;
  try {
    if (Platform.OS !== "web") {
      await Share.share({ message });
      return "shared";
    }
    if (typeof navigator.share === "function") {
      await navigator.share({ title: "Whose Name?", text: message, url });
      return "shared";
    }
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
