import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole, AppUser } from "@/lib/mock-platform";
import { getAuthProfileCompat, upsertAuthProfileCompat } from "./profile-schema-compat";
import { ensureLinkedStreamer, resolveLinkedStreamer } from "./streamer-profile-linking";

interface AuthContextValue {
  user: AppUser | null;
  session: Session | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  signUp: (payload: {
    email: string;
    displayName?: string;
    password: string;
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

async function buildAppUser(session: Session): Promise<AppUser> {
  const profile = await getProfile(session.user.id);
  const streamer = await resolveLinkedStreamer({
    userId: session.user.id,
    tiktokUsername: profile?.tiktok_username ?? session.user.user_metadata.tiktok_username ?? "",
  });
  const hasVerifiedStreamerProfile = streamer?.verification_status === "verified";

  const username = profile?.username ?? session.user.user_metadata.username ?? session.user.email?.split("@")[0] ?? "user";
  const displayName = (hasVerifiedStreamerProfile ? streamer?.display_name : null) ?? profile?.display_name ?? session.user.user_metadata.display_name ?? username;
  const tiktokUsername = (hasVerifiedStreamerProfile ? streamer?.tiktok_username : null) ?? profile?.tiktok_username ?? session.user.user_metadata.tiktok_username ?? "";

  return {
    id: session.user.id,
    role: hasVerifiedStreamerProfile ? "streamer" : "viewer",
    email: session.user.email ?? "",
    username,
    displayName,
    tiktokUsername,
  };
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
    password: string;
    referralStreamerId?: string | null;
  }) => {
    const emailLocalPart = payload.email.split("@")[0]?.trim() || "user";
    const normalizedUsername = emailLocalPart.toLowerCase().replace(/[^a-z0-9._-]/g, "") || `user_${Date.now()}`;
    const normalizedDisplayName = payload.displayName?.trim() || emailLocalPart;

    const { data, error } = await supabase.auth.signUp({
      email: payload.email,
      password: payload.password,
      options: {
        data: {
          username: normalizedUsername,
          display_name: normalizedDisplayName,
          tiktok_username: "",
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
      await upsertAuthProfileCompat({
        id: data.user.id,
        username: normalizedUsername,
        display_name: normalizedDisplayName,
        tiktok_username: "",
      });

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
