import { supabase } from "@/integrations/supabase/client";
import type { AppUser } from "@/lib/mock-platform";

const db = supabase as any;

export async function createBoost(user: AppUser, streamerId: string, amount: number) {
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const { error } = await db
    .from("boosts")
    .insert({
      streamer_id: streamerId,
      user_id: user.id,
      amount,
      priority_score: amount,
      status: "active",
      expires_at: expiresAt,
    });

  if (error) {
    throw error;
  }
}

export async function loadActiveBoostTotals() {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("boosts")
    .select("streamer_id, amount")
    .eq("status", "active")
    .gt("expires_at", now);

  if (error) {
    throw error;
  }

  const totals = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ streamer_id: string; amount: number }>) {
    totals.set(row.streamer_id, (totals.get(row.streamer_id) ?? 0) + row.amount);
  }

  return totals;
}