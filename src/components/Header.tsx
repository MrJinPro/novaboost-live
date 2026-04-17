import { Link, useLocation } from "@tanstack/react-router";
import { Logo } from "./Logo";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { LogOut, User as UserIcon } from "lucide-react";

const NAV = [
  { to: "/" as const, label: "Главная" },
  { to: "/streamers" as const, label: "Стримеры" },
  { to: "/tasks" as const, label: "Задания" },
  { to: "/leaderboard" as const, label: "Рейтинг" },
];

export function Header() {
  const { user, signOut } = useAuth();
  const location = useLocation();

  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-background/70 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="shrink-0">
          <Logo size="md" />
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {NAV.map((item) => {
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
          {user ? (
            <>
              <Link to="/profile">
                <Button variant="ghost" size="sm" className="gap-2">
                  <UserIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">Профиль</span>
                </Button>
              </Link>
              <Button variant="ghost" size="sm" onClick={signOut} aria-label="Выйти">
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Link to="/auth">
              <Button size="sm" className="bg-gradient-blast text-blast-foreground hover:opacity-90 shadow-glow font-bold">
                Войти
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
