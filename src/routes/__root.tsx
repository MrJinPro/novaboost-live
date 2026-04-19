import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth-context";
import { CurrencyProvider } from "@/lib/currency";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-display font-bold text-gradient-nova">404</h1>
        <h2 className="mt-4 text-xl font-display font-semibold text-foreground">Страница не найдена</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Похоже, этот стрим уже закончился или никогда не существовал.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-gradient-blast px-6 py-2.5 text-sm font-bold text-blast-foreground shadow-glow transition-opacity hover:opacity-90"
          >
            На главную
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "NovaBoost Live — Платформа для TikTok LIVE-стримеров" },
      { name: "description", content: "Независимый сторонний сервис для TikTok LIVE-стримеров: аудитория, бусты, контент, Telegram и участие зрителей вокруг эфиров." },
      { name: "author", content: "NovaBoost" },
      { property: "og:title", content: "NovaBoost Live — Платформа для TikTok LIVE-стримеров" },
      { property: "og:description", content: "Независимый сторонний сервис для TikTok LIVE-стримеров: аудитория, бусты, контент, Telegram и участие зрителей вокруг эфиров." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "NovaBoost Live — Платформа для TikTok LIVE-стримеров" },
      { name: "twitter:description", content: "Независимый сторонний сервис для TikTok LIVE-стримеров: аудитория, бусты, контент, Telegram и участие зрителей вокруг эфиров." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/pzbJzsOnlrPUPcCKLrJjuu8XQsN2/social-images/social-1776518661633-Снимок_экрана_2026-04-18_162411.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/pzbJzsOnlrPUPcCKLrJjuu8XQsN2/social-images/social-1776518661633-Снимок_экрана_2026-04-18_162411.webp" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <CurrencyProvider>
      <AuthProvider>
        <Outlet />
        <Toaster />
      </AuthProvider>
    </CurrencyProvider>
  );
}
