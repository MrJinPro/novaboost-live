import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { CurrencySwitcher } from "@/components/CurrencySwitcher";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { ExternalLink, LogOut, User as UserIcon } from "lucide-react";
import { getOwnedStreamerPublicPage } from "@/lib/streamer-studio-data";

const BASE_NAV = [
  { to: "/" as const, label: "Главная" },
  { to: "/streamers" as const, label: "Стримеры" },
  { to: "/tasks" as const, label: "Задания" },
  { to: "/leaderboard" as const, label: "Рейтинг" },
];

export function Header() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [publicPageId, setPublicPageId] = useState<string | null>(null);
  const navItems = user?.role === "streamer"
    ? [...BASE_NAV, { to: "/services" as const, label: "Продвижение" }, { to: "/studio" as const, label: "Студия" }]
    : BASE_NAV;

  useEffect(() => {
    let active = true;

    if (!user || user.role !== "streamer") {
      setPublicPageId(null);
      return;
    }

    const syncPublicPage = async () => {
      try {
        const page = await getOwnedStreamerPublicPage(user.id);
        if (active) {
          setPublicPageId(page?.id ?? null);
        }
      } catch {
        if (active) {
          setPublicPageId(null);
        }
      }
    };

    void syncPublicPage();

    return () => {
      active = false;
    };
  }, [user]);

  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-background/70 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="shrink-0">
          <Logo size="md" />
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-surface-2 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface/60"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <CurrencySwitcher />
          {user ? (
            <>
              {user.role === "streamer" && publicPageId && (
                <Link to="/streamer/$id" params={{ id: publicPageId }}>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <ExternalLink className="h-4 w-4" />
                    <span className="hidden sm:inline">Публичная</span>
                  </Button>
                </Link>
              )}
              <Link to="/profile">
                <Button variant="ghost" size="sm" className="gap-2">
                  <UserIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">{user.role === "streamer" ? "Кабинет" : "Профиль"}</span>
                </Button>
              </Link>
              <Button variant="ghost" size="sm" onClick={signOut} aria-label="Выйти">
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Link to="/auth">
                <Button variant="outline" size="sm" className="border-cosmic/40 hover:bg-cosmic/10">
                  Ты стример?
                </Button>
              </Link>
              <Link to="/auth">
                <Button size="sm" className="bg-gradient-blast text-blast-foreground hover:opacity-90 shadow-glow font-bold">
                  Войти
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
