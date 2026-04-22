import { supabase } from "@/integrations/supabase/client";

export type StreamerReferralSummary = {
  referralsCount: number;
  inviteLink: string;
};

function getAppOrigin() {
  const configuredAppUrl = import.meta.env.VITE_APP_URL;
  const appOrigin = configuredAppUrl?.trim().replace(/\/$/, "")
    || (typeof window !== "undefined" ? window.location.origin : "");

  return appOrigin;
}

export function buildStreamerReferralLink(input: {
  streamerId: string;
  displayName: string;
  tiktokUsername: string;
}) {
  const appOrigin = getAppOrigin();
  const url = new URL("/auth", appOrigin || "https://live.novaboost.cloud");
  url.searchParams.set("ref", input.streamerId);
  url.searchParams.set("refName", input.displayName);
  url.searchParams.set("refUsername", input.tiktokUsername);
  return url.toString();
}

export async function loadStreamerReferralSummary(input: {
  streamerId: string;
  displayName: string;
  tiktokUsername: string;
}): Promise<StreamerReferralSummary> {
  const { count, error } = await supabase
    .from("referrals")
    .select("id", { count: "exact", head: true })
    .eq("streamer_id", input.streamerId);

  if (error) {
    throw error;
  }

  return {
    referralsCount: count ?? 0,
    inviteLink: buildStreamerReferralLink(input),
  };
}