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

async function getProfile(userId: string) {
  return getAuthProfileCompat(userId);
}

async function resolveAppRole(userId: string, declaredRole: Exclude<AppRole, "admin"> | null, hasVerifiedStreamerProfile: boolean): Promise<AppRole> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (!error && data?.role === "admin") {
    return "admin";
  }

  if (declaredRole === "streamer" || hasVerifiedStreamerProfile) {
    return "streamer";
  }

  return "viewer";
}

async function buildAppUser(session: Session): Promise<AppUser> {
  const profile = await getProfile(session.user.id);
  const streamer = await resolveLinkedStreamer({
    userId: session.user.id,
    tiktokUsername: profile?.tiktok_username ?? session.user.user_metadata.tiktok_username ?? "",
  });
  const declaredRole = session.user.user_metadata.account_role === "streamer" || session.user.user_metadata.account_role === "viewer"
    ? session.user.user_metadata.account_role
    : null;
  const hasVerifiedStreamerProfile = streamer?.verification_status === "verified";
  const role = await resolveAppRole(session.user.id, declaredRole, hasVerifiedStreamerProfile);

  const username = profile?.username ?? session.user.user_metadata.username ?? session.user.email?.split("@")[0] ?? "user";
  const displayName = (hasVerifiedStreamerProfile ? streamer?.display_name : null) ?? profile?.display_name ?? session.user.user_metadata.display_name ?? username;
  const tiktokUsername = (hasVerifiedStreamerProfile ? streamer?.tiktok_username : null) ?? profile?.tiktok_username ?? session.user.user_metadata.tiktok_username ?? "";

  return {
    id: session.user.id,
    role,
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

    const tiktokProfile = await lookupTikTokProfile(normalizedTikTokUsername);
    const normalizedDisplayName = payload.displayName?.trim() || tiktokProfile.displayName || emailLocalPart;

    const { data, error } = await supabase.auth.signUp({
      email: payload.email,
      password: payload.password,
      options: {
        data: {
          username: normalizedUsername,
          display_name: normalizedDisplayName,
          tiktok_username: normalizedTikTokUsername,
          account_role: payload.accountRole,
          avatar_url: tiktokProfile.avatarUrl,
          bio: tiktokProfile.bio,
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
