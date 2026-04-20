import { normalizeTikTokUsername } from "@/lib/tiktok-profile-data";

export function getStreamerPublicRouteParam(input: {
  id?: string | null;
  tiktokUsername?: string | null;
}) {
  const normalizedUsername = normalizeTikTokUsername(input.tiktokUsername ?? "");
  return normalizedUsername || input.id || "";
}