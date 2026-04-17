import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AppRole, AppUser } from "@/lib/mock-platform";

interface AuthContextValue {
  user: AppUser | null;
  session: null;
  loading: boolean;
  signUp: (payload: {
    role: AppRole;
    email: string;
    username: string;
    displayName: string;
    tiktokUsername: string;
  }) => Promise<void>;
  signIn: (payload: {
    role: AppRole;
    email: string;
    tiktokUsername: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const STORAGE_KEY = "novaboost-demo-auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") {
      setLoading(false);
      return;
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setUser(JSON.parse(stored) as AppUser);
    }
    setLoading(false);
  }, []);

  const signUp = async (payload: {
    role: AppRole;
    email: string;
    username: string;
    displayName: string;
    tiktokUsername: string;
  }) => {
    const nextUser: AppUser = {
      id: `${payload.role}-${payload.username.toLowerCase()}`,
      role: payload.role,
      email: payload.email,
      username: payload.username,
      displayName: payload.displayName,
      tiktokUsername: payload.tiktokUsername,
    };
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
    }
    setUser(nextUser);
  };

  const signIn = async (payload: {
    role: AppRole;
    email: string;
    tiktokUsername: string;
  }) => {
    if (typeof window === "undefined") {
      throw new Error("Вход доступен только в браузере");
    }

    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      throw new Error("Профиль не найден. Сначала зарегистрируйтесь.");
    }

    const existing = JSON.parse(stored) as AppUser;
    if (
      existing.role !== payload.role ||
      existing.email.toLowerCase() !== payload.email.toLowerCase() ||
      existing.tiktokUsername.toLowerCase() !== payload.tiktokUsername.toLowerCase()
    ) {
      throw new Error("Данные входа не совпадают с сохранённым профилем.");
    }

    setUser(existing);
  };

  const signOut = async () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, session: null, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
