import type { Session } from "@supabase/supabase-js";

export type AdminApplicationStatus = "pending" | "verified" | "rejected";
export type AdminStaffAccessLevel = "support" | "moderator" | "admin";
export type AdminPanelAccessLevel = AdminStaffAccessLevel | "none";
export type AdminManagedPlatformRole = "viewer" | "streamer";

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

export type AdminConsoleUser = {
  userId: string;
  email: string | null;
  username: string;
  displayName: string;
  tiktokUsername: string | null;
  platformRole: AdminManagedPlatformRole;
  staffAccessLevel: AdminPanelAccessLevel;
  streamerId: string | null;
  streamerDisplayName: string | null;
  streamerVerificationStatus: AdminApplicationStatus | "none";
  hasStreamerProfile: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
  adminNotes: string | null;
};

export type AdminTrackedStreamer = {
  streamerId: string;
  displayName: string;
  tiktokUsername: string;
  isLive: boolean;
  viewerCount: number;
  followersCount: number;
  trackingEnabled: boolean;
  createdAt: string | null;
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
  return requestAdminPath<T>(session, "/api/admin/streamer-applications", init);
}

async function requestAdminPath<T>(session: Session, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
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
  const data = await requestAdmin<{ applications: AdminStreamerApplication[]; currentAccessLevel: AdminPanelAccessLevel }>(session, { method: "GET" });
  return {
    applications: data.applications ?? [],
    currentAccessLevel: data.currentAccessLevel ?? "none",
  };
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

export async function loadAdminUsers(session: Session) {
  const data = await requestAdminPath<{ users: AdminConsoleUser[]; trackedStreamers: AdminTrackedStreamer[]; currentAccessLevel: AdminPanelAccessLevel }>(session, "/api/admin/users", { method: "GET" });
  return {
    users: data.users ?? [],
    trackedStreamers: data.trackedStreamers ?? [],
    currentAccessLevel: data.currentAccessLevel ?? "none",
  };
}

export async function createAdminTrackedStreamer(session: Session, payload: {
  tiktokUsername: string;
}) {
  return requestAdminPath<{ ok: true }>(session, "/api/admin/users", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: "create-tracked-streamer",
      tiktokUsername: payload.tiktokUsername,
    }),
  });
}

export async function deleteAdminTrackedStreamer(session: Session, payload: {
  streamerId: string;
}) {
  return requestAdminPath<{ ok: true }>(session, "/api/admin/users", {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: "delete-tracked-streamer",
      streamerId: payload.streamerId,
    }),
  });
}

export async function updateAdminUserPlatformRole(session: Session, payload: {
  userId: string;
  role: AdminManagedPlatformRole;
}) {
  return requestAdminPath<{ ok: true }>(session, "/api/admin/users", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: "set-platform-role",
      userId: payload.userId,
      role: payload.role,
    }),
  });
}

export async function updateAdminUserStaffAccess(session: Session, payload: {
  userId: string;
  accessLevel: AdminPanelAccessLevel;
  notes?: string;
}) {
  return requestAdminPath<{ ok: true }>(session, "/api/admin/users", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: "set-staff-access",
      userId: payload.userId,
      accessLevel: payload.accessLevel,
      notes: payload.notes,
    }),
  });
}