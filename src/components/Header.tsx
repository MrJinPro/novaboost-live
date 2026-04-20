import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { CurrencySwitcher } from "@/components/CurrencySwitcher";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ExternalLink, LogOut, Menu, ShieldCheck, User as UserIcon } from "lucide-react";
import { getOwnedStreamerPublicPage } from "@/lib/streamer-studio-data";
import { getStreamerPublicRouteParam } from "@/lib/streamer-public-route";

const BASE_NAV = [
  { to: "/" as const, label: "Главная" },
  { to: "/streamers" as const, label: "Стримеры" },
  { to: "/tasks" as const, label: "Задания" },
  { to: "/leaderboard" as const, label: "Рейтинг" },
];

export function Header() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [publicPageRouteParam, setPublicPageRouteParam] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navItems = [
    ...BASE_NAV,
    ...(user?.isStreamer ? [{ to: "/services" as const, label: "Продвижение" }, { to: "/studio" as const, label: "Студия" }] : []),
    ...(user?.isAdmin ? [{ to: "/admin" as const, label: "Админка" }] : []),
  ];

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let active = true;

    if (!user || !user.isStreamer) {
      setPublicPageRouteParam(null);
      return;
    }

    const syncPublicPage = async () => {
      try {
        const page = await getOwnedStreamerPublicPage(user.id);
        if (active) {
          setPublicPageRouteParam(page ? getStreamerPublicRouteParam({ id: page.id, tiktokUsername: page.tiktokUsername }) : null);
        }
      } catch {
        if (active) {
          setPublicPageRouteParam(null);
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
      <div className="container mx-auto flex min-h-16 items-center justify-between gap-3 px-4 py-2">
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
              {user.isStreamer && publicPageRouteParam && (
                <Link to="/streamer/$id" params={{ id: publicPageRouteParam }}>
                  <Button variant="ghost" size="sm" className="hidden gap-2 sm:inline-flex">
                    <ExternalLink className="h-4 w-4" />
                    <span className="hidden sm:inline">Публичная</span>
                  </Button>
                </Link>
              )}
              <Link to="/profile">
                <Button variant="ghost" size="sm" className="gap-2">
                  <UserIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">{user.isStreamer ? "Кабинет" : "Профиль"}</span>
                </Button>
              </Link>
              {user.isAdmin && (
                <Link to="/admin">
                  <Button variant="ghost" size="sm" className="hidden gap-2 sm:inline-flex">
                    <ShieldCheck className="h-4 w-4" />
                    <span className="hidden sm:inline">Админка</span>
                  </Button>
                </Link>
              )}
              <Button variant="ghost" size="sm" onClick={signOut} aria-label="Выйти" className="hidden sm:inline-flex">
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Link to="/auth">
                <Button variant="outline" size="sm" className="hidden border-cosmic/40 hover:bg-cosmic/10 sm:inline-flex">
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
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="border-border/50 bg-surface/50 md:hidden" aria-label="Открыть меню">
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="border-border/60 bg-background/95 px-5">
              <SheetHeader className="pr-10">
                <SheetTitle>Навигация NovaBoost Live</SheetTitle>
                <SheetDescription>
                  Быстрый переход по разделам и основным действиям аккаунта.
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                <div className="rounded-2xl border border-border/50 bg-surface/50 p-3">
                  <CurrencySwitcher inline />
                </div>

                <nav className="grid gap-2">
                  {navItems.map((item) => {
                    const active = location.pathname === item.to;
                    return (
                      <SheetClose asChild key={item.to}>
                        <Link
                          to={item.to}
                          className={`rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                            active
                              ? "bg-surface-2 text-foreground"
                              : "text-muted-foreground hover:bg-surface hover:text-foreground"
                          }`}
                        >
                          {item.label}
                        </Link>
                      </SheetClose>
                    );
                  })}
                </nav>

                {user ? (
                  <div className="space-y-3 rounded-2xl border border-border/50 bg-surface/40 p-4">
                    <div>
                      <div className="text-sm font-semibold text-foreground">{user.displayName}</div>
                      <div className="text-xs text-muted-foreground">{user.email}</div>
                    </div>

                    <div className="grid gap-2">
                      {user.isStreamer && publicPageRouteParam && (
                        <SheetClose asChild>
                          <Link to="/streamer/$id" params={{ id: publicPageRouteParam }}>
                            <Button variant="outline" className="w-full justify-start gap-2 border-border/60">
                              <ExternalLink className="h-4 w-4" />
                              Публичная страница
                            </Button>
                          </Link>
                        </SheetClose>
                      )}

                      <SheetClose asChild>
                        <Link to="/profile">
                          <Button variant="outline" className="w-full justify-start gap-2 border-border/60">
                            <UserIcon className="h-4 w-4" />
                            {user.isStreamer ? "Кабинет" : "Профиль"}
                          </Button>
                        </Link>
                      </SheetClose>

                      {user.role === "admin" && (
                        <SheetClose asChild>
                          <Link to="/admin">
                            <Button variant="outline" className="w-full justify-start gap-2 border-border/60">
                              <ShieldCheck className="h-4 w-4" />
                              Админка
                            </Button>
                          </Link>
                        </SheetClose>
                      )}

                      <SheetClose asChild>
                        <Button variant="ghost" className="w-full justify-start gap-2" onClick={signOut}>
                          <LogOut className="h-4 w-4" />
                          Выйти
                        </Button>
                      </SheetClose>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <SheetClose asChild>
                      <Link to="/auth">
                        <Button className="w-full bg-gradient-blast text-blast-foreground hover:opacity-90 shadow-glow font-bold">
                          Войти
                        </Button>
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link to="/auth">
                        <Button variant="outline" className="w-full border-cosmic/40 hover:bg-cosmic/10">
                          Ты стример?
                        </Button>
                      </Link>
                    </SheetClose>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
