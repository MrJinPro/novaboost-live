import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole, AppUser } from "@/lib/mock-platform";
import { getAuthProfileCompat, upsertAuthProfileCompat } from "./profile-schema-compat";
import { ensureLinkedStreamer, resolveLinkedStreamer } from "./streamer-profile-linking";
import { lookupTikTokProfile, normalizeTikTokUsername } from "./tiktok-profile-data";

interface AuthContextValue {
  user: AppUser | null;
  session: Session | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  signUp: (payload: {
    email: string;
    displayName?: string;
    tiktokUsername: string;
    password: string;
    accountRole: Exclude<AppRole, "admin">;
    referralStreamerId?: string | null;
  }) => Promise<{ emailConfirmationRequired: boolean }>;
  signIn: (payload: {
    email: string;
    password: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getAuthEmailRedirectUrl() {
  const configuredAppUrl = import.meta.env.VITE_APP_URL || process.env.VITE_APP_URL;
  const appOrigin = configuredAppUrl?.trim().replace(/\/$/, "")
    || (typeof window !== "undefined" ? window.location.origin : "");

  if (!appOrigin) {
    return undefined;
  }

  return `${appOrigin}/auth?confirmed=signup`;
}

async function getProfile(userId: string) {
  return getAuthProfileCompat(userId);
}

async function resolveAccountCapabilities(userId: string, declaredRole: Exclude<AppRole, "admin"> | null, hasVerifiedStreamerProfile: boolean) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  const isAdmin = !error && data?.role === "admin";
  const isStreamer = declaredRole === "streamer" || hasVerifiedStreamerProfile;

  return {
    isAdmin,
    isStreamer,
    role: isAdmin ? "admin" : isStreamer ? "streamer" : "viewer",
  } satisfies { isAdmin: boolean; isStreamer: boolean; role: AppRole };
}

async function enrichTikTokProfileIfNeeded(input: {
  session: Session;
  fallbackUsername: string;
  fallbackDisplayName: string;
  tiktokUsername: string;
  profile: Awaited<ReturnType<typeof getProfile>>;
  streamer: Awaited<ReturnType<typeof resolveLinkedStreamer>>;
}) {
  const normalizedTikTokUsername = input.tiktokUsername.trim();
  if (!normalizedTikTokUsername) {
    return null;
  }

  const needsProfileRefresh = !input.profile?.avatar_url
    || !input.profile?.bio
    || !input.streamer?.avatar_url
    || !input.streamer?.logo_url
    || !input.streamer?.bio;

  if (!needsProfileRefresh) {
    return null;
  }

  const tiktokProfile = await lookupTikTokProfile(normalizedTikTokUsername).catch(() => null);
  if (!tiktokProfile) {
    return null;
  }

  const displayName = tiktokProfile.displayName?.trim()
    || input.streamer?.display_name
    || input.profile?.display_name
    || input.fallbackDisplayName;
  const avatarUrl = tiktokProfile.avatarUrl?.trim()
    || input.streamer?.avatar_url
    || input.streamer?.logo_url
    || input.profile?.avatar_url
    || null;
  const bio = tiktokProfile.bio?.trim()
    || input.streamer?.bio
    || input.profile?.bio
    || null;
  const followersCount = tiktokProfile.followersCount ?? 0;

  await upsertAuthProfileCompat({
    id: input.session.user.id,
    username: input.fallbackUsername,
    display_name: displayName,
    tiktok_username: normalizedTikTokUsername,
    avatar_url: avatarUrl,
    bio,
  });

  if (input.streamer?.id) {
    await supabase
      .from("streamers")
      .update({
        display_name: displayName,
        avatar_url: avatarUrl,
        logo_url: avatarUrl,
        bio,
        followers_count: followersCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.streamer.id);
  }

  return {
    displayName,
    avatarUrl,
    bio,
  };
}

async function buildAppUser(session: Session): Promise<AppUser> {
  const profile = await getProfile(session.user.id);
  const declaredRole = session.user.user_metadata.account_role === "streamer" || session.user.user_metadata.account_role === "viewer"
    ? session.user.user_metadata.account_role
    : null;
  const fallbackUsername = profile?.username ?? session.user.user_metadata.username ?? session.user.email?.split("@")[0] ?? "user";
  const normalizedDisplayName = profile?.display_name ?? session.user.user_metadata.display_name ?? fallbackUsername;
  const normalizedTikTokUsername = profile?.tiktok_username ?? session.user.user_metadata.tiktok_username ?? "";
  const streamer = declaredRole === "streamer"
    ? await ensureLinkedStreamer({
        userId: session.user.id,
        tiktokUsername: normalizedTikTokUsername,
        displayName: normalizedDisplayName,
        avatarUrl: profile?.avatar_url ?? (typeof session.user.user_metadata.avatar_url === "string" ? session.user.user_metadata.avatar_url : null),
        bio: profile?.bio ?? (typeof session.user.user_metadata.bio === "string" ? session.user.user_metadata.bio : null),
      })
    : await resolveLinkedStreamer({
        userId: session.user.id,
        tiktokUsername: normalizedTikTokUsername,
      });
  const hasVerifiedStreamerProfile = streamer?.verification_status === "verified";
  const capabilities = await resolveAccountCapabilities(session.user.id, declaredRole, hasVerifiedStreamerProfile);

  const enrichedTikTokProfile = await enrichTikTokProfileIfNeeded({
    session,
    fallbackUsername,
    fallbackDisplayName: normalizedDisplayName,
    tiktokUsername: normalizedTikTokUsername,
    profile,
    streamer,
  });

  const username = fallbackUsername;
  const displayName = enrichedTikTokProfile?.displayName ?? streamer?.display_name ?? normalizedDisplayName;
  const tiktokUsername = streamer?.tiktok_username ?? normalizedTikTokUsername;

  return {
    id: session.user.id,
    role: capabilities.role,
    isAdmin: capabilities.isAdmin,
    isStreamer: capabilities.isStreamer,
    email: session.user.email ?? "",
    username,
    displayName,
    tiktokUsername,
  };
}

async function syncSessionProfileMetadata(session: Session) {
  const metadata = session.user.user_metadata ?? {};

  await upsertAuthProfileCompat({
    id: session.user.id,
    username: typeof metadata.username === "string" && metadata.username.trim() ? metadata.username : session.user.email?.split("@")[0] ?? "user",
    display_name: typeof metadata.display_name === "string" && metadata.display_name.trim() ? metadata.display_name : session.user.email?.split("@")[0] ?? "user",
    tiktok_username: typeof metadata.tiktok_username === "string" ? metadata.tiktok_username : "",
    avatar_url: typeof metadata.avatar_url === "string" ? metadata.avatar_url : null,
    bio: typeof metadata.bio === "string" ? metadata.bio : null,
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const syncSession = async (nextSession: Session | null) => {
      if (!active) {
        return;
      }

      setSession(nextSession);

      if (!nextSession) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const nextUser = await buildAppUser(nextSession);
        if (active) {
          setUser(nextUser);
        }
      } catch {
        if (active) {
          setUser(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void supabase.auth.getSession().then(({ data }) => syncSession(data.session));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void syncSession(nextSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const refreshUser = async () => {
    if (!session) {
      setUser(null);
      return;
    }

    const nextUser = await buildAppUser(session);
    setUser(nextUser);
  };

  const signUp = async (payload: {
    email: string;
    displayName?: string;
    tiktokUsername: string;
    password: string;
    accountRole: Exclude<AppRole, "admin">;
    referralStreamerId?: string | null;
  }) => {
    const emailLocalPart = payload.email.split("@")[0]?.trim() || "user";
    const normalizedUsername = emailLocalPart.toLowerCase().replace(/[^a-z0-9._-]/g, "") || `user_${Date.now()}`;
    const normalizedTikTokUsername = normalizeTikTokUsername(payload.tiktokUsername);

    if (!normalizedTikTokUsername) {
      throw new Error("Укажи TikTok username для регистрации.");
    }

    const tiktokProfile = await lookupTikTokProfile(normalizedTikTokUsername).catch(() => null);
    const normalizedDisplayName = payload.displayName?.trim() || tiktokProfile?.displayName || emailLocalPart;

    const { data, error } = await supabase.auth.signUp({
      email: payload.email,
      password: payload.password,
      options: {
        emailRedirectTo: getAuthEmailRedirectUrl(),
        data: {
          username: normalizedUsername,
          display_name: normalizedDisplayName,
          tiktok_username: normalizedTikTokUsername,
          account_role: payload.accountRole,
          avatar_url: tiktokProfile?.avatarUrl ?? null,
          bio: tiktokProfile?.bio ?? null,
          preferred_language: "ru",
        },
      },
    });

    if (error) {
      throw error;
    }

    if (!data.user) {
      throw new Error("Не удалось создать пользователя в Supabase.");
    }

    if (data.session) {
      await syncSessionProfileMetadata(data.session);

      if (payload.accountRole === "streamer") {
        await ensureLinkedStreamer({
          userId: data.user.id,
          tiktokUsername: normalizedTikTokUsername,
          displayName: normalizedDisplayName,
          avatarUrl: tiktokProfile?.avatarUrl ?? null,
          bio: tiktokProfile?.bio ?? null,
          followersCount: tiktokProfile?.followersCount ?? null,
        });
      }

      if (payload.referralStreamerId) {
        const { error: referralError } = await supabase.from("referrals").insert({
          viewer_id: data.user.id,
          streamer_id: payload.referralStreamerId,
        });

        if (referralError && referralError.code !== "23505") {
          throw referralError;
        }
      }

      const nextUser = await buildAppUser(data.session);
      setSession(data.session);
      setUser(nextUser);
    }

    return { emailConfirmationRequired: !data.session };
  };

  const signIn = async (payload: {
    email: string;
    password: string;
  }) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: payload.email,
      password: payload.password,
    });

    if (error) {
      throw error;
    }

    if (!data.session) {
      throw new Error("Supabase не вернул активную сессию после входа.");
    }

    await syncSessionProfileMetadata(data.session);

    const nextUser = await buildAppUser(data.session);

    setSession(data.session);
    setUser(nextUser);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, refreshUser, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
