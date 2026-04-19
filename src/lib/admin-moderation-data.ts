import type { Session } from "@supabase/supabase-js";

export type AdminApplicationStatus = "pending" | "verified" | "rejected";

export type AdminStreamerApplication = {
  verificationId: string;
  streamerId: string;
  streamerUserId: string | null;
  streamerDisplayName: string;
  streamerTikTokUsername: string;
  streamerAvatarUrl: string | null;
  streamerBio: string | null;
  verificationMethod: string | null;
  streamerVerificationStatus: AdminApplicationStatus;
  submittedBy: string | null;
  submitterDisplayName: string | null;
  submitterUsername: string | null;
  status: AdminApplicationStatus;
  evidenceType: string | null;
  evidenceValue: string | null;
  notes: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewerDisplayName: string | null;
};

export class AdminApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
  }
}

async function requestAdmin<T>(session: Session, init?: RequestInit): Promise<T> {
  const response = await fetch("/api/admin/streamer-applications", {
    ...init,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${session.access_token}`,
      ...(init?.headers ?? {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AdminApiError(
      typeof data.error === "string" ? data.error : "Не удалось выполнить запрос к админке.",
      response.status,
    );
  }

  return data as T;
}

export async function loadAdminStreamerApplications(session: Session) {
  const data = await requestAdmin<{ applications: AdminStreamerApplication[] }>(session, { method: "GET" });
  return data.applications ?? [];
}

export async function reviewAdminStreamerApplication(session: Session, payload: {
  verificationId: string;
  decision: Exclude<AdminApplicationStatus, "pending">;
}) {
  return requestAdmin<{ ok: true }>(session, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}