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
    role: AppRole;
    email: string;
    username: string;
    displayName: string;
    tiktokUsername: string;
    password: string;
    referralStreamerId?: string | null;
  }) => Promise<{ emailConfirmationRequired: boolean }>;
  signIn: (payload: {
    role: AppRole;
    email: string;
    tiktokUsername?: string;
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

  const username = profile?.username ?? session.user.user_metadata.username ?? session.user.email?.split("@")[0] ?? "user";
  const displayName = streamer?.display_name ?? profile?.display_name ?? session.user.user_metadata.display_name ?? username;
  const tiktokUsername = streamer?.tiktok_username ?? profile?.tiktok_username ?? session.user.user_metadata.tiktok_username ?? "";

  return {
    id: session.user.id,
    role: streamer ? "streamer" : "viewer",
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
    role: AppRole;
    email: string;
    username: string;
    displayName: string;
    tiktokUsername: string;
    password: string;
    referralStreamerId?: string | null;
  }) => {
    const { data, error } = await supabase.auth.signUp({
      email: payload.email,
      password: payload.password,
      options: {
        data: {
          username: payload.username,
          display_name: payload.displayName,
          tiktok_username: payload.tiktokUsername,
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

    const fallbackName = payload.displayName.trim() || payload.username.trim() || payload.tiktokUsername.trim();

    if (data.session) {
      await upsertAuthProfileCompat({
        id: data.user.id,
        username: payload.username,
        display_name: payload.displayName,
        tiktok_username: payload.tiktokUsername,
      });

      if (payload.role === "streamer") {
        await ensureLinkedStreamer({
          userId: data.user.id,
          tiktokUsername: payload.tiktokUsername,
          displayName: fallbackName,
        });
      }

      if (payload.role === "viewer" && payload.referralStreamerId) {
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
    role: AppRole;
    email: string;
    tiktokUsername?: string;
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

    const profile = await getProfile(data.user.id);
    const enteredTikTok = payload.tiktokUsername?.trim() ?? "";
    const knownTikTokUsername = profile?.tiktok_username?.trim() ?? "";

    if (payload.role === "streamer") {
      const streamerTikTokUsername = enteredTikTok || knownTikTokUsername;

      if (!streamerTikTokUsername) {
        await supabase.auth.signOut();
        throw new Error("Для входа стримера нужен TikTok username, чтобы связать кабинет со страницей.");
      }

      await ensureLinkedStreamer({
        userId: data.user.id,
        tiktokUsername: streamerTikTokUsername,
        displayName: profile?.display_name ?? profile?.username ?? streamerTikTokUsername,
      });
    }

    const nextUser = await buildAppUser(data.session);

    if (nextUser.role !== payload.role) {
      await supabase.auth.signOut();
      throw new Error(payload.role === "streamer" ? "У этого аккаунта ещё не создан профиль стримера." : "Этот аккаунт относится к кабинету стримера. Выбери вход как стример.");
    }

    if (enteredTikTok && nextUser.tiktokUsername && nextUser.tiktokUsername.toLowerCase() !== enteredTikTok.toLowerCase()) {
      await supabase.auth.signOut();
      throw new Error("TikTok username не совпадает с профилем в базе.");
    }

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
