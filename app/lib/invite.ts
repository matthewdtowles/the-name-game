import { RoomCode } from "@tng/shared";
import { Platform, Share } from "react-native";

import { WEB_URL } from "./config";

export function joinUrl(code: string): string {
  return `${WEB_URL}/j/${code}`;
}

// The room code in a scanned QR code: a join link from a phone or a TV, or
// null for anything else.
export function codeFromScan(data: string): string | null {
  const match = /^https?:\/\/[^/]+\/j\/([^/?#]+)/i.exec(data.trim());
  if (!match) return null;
  const code = RoomCode.safeParse(match[1]);
  return code.success ? code.data : null;
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
