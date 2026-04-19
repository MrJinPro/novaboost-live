import { supabase } from "@/integrations/supabase/client";
import type { AppUser } from "@/lib/mock-platform";
import { getViewerProfileStatsCompat, updateViewerProfileProgressCompat } from "@/lib/profile-schema-compat";

function resolveBoostDurationMinutes(amount: number) {
  if (amount >= 120) {
    return 120;
  }

  if (amount >= 60) {
    return 60;
  }

  return 30;
}

export async function createBoost(user: AppUser, streamerId: string, amount: number) {
  if (amount < 1) {
    throw new Error("Стоимость буста должна быть больше нуля.");
  }

  const viewerProfile = await getViewerProfileStatsCompat(user.id);

  if ((viewerProfile.points ?? 0) < amount) {
    throw new Error(`Не хватает очков для буста. Нужно ${amount} ⚡.`);
  }

  const nextPoints = Math.max(0, (viewerProfile.points ?? 0) - amount);
  const durationMinutes = resolveBoostDurationMinutes(amount);
  const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();

  const { error } = await supabase
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

  await updateViewerProfileProgressCompat({
    userId: user.id,
    points: nextPoints,
    level: viewerProfile.level ?? 1,
    streak_days: viewerProfile.streak_days ?? 0,
  });

  return {
    spentPoints: amount,
    remainingPoints: nextPoints,
    durationMinutes,
    expiresAt,
  };
}

export async function loadActiveBoostTotals() {
  const now = new Date().toISOString();
  const { data, error } = await supabase
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