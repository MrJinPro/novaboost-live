import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";

export function AppFooter() {
  return (
    <footer className="border-t border-border/40 bg-background/70">
      <div className="container mx-auto grid gap-6 px-4 py-8 md:grid-cols-[1.1fr_0.9fr_1fr] md:items-start">
        <div>
          <Logo size="sm" showText />
          <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
            NovaBoost Live - независимый сервис вокруг TikTok LIVE: каталог стримеров, viewer points, бусты, контент между эфирами, OBS-виджеты и вовлечение аудитории.
          </p>
        </div>

        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">О проекте</div>
          <div className="mt-3 grid gap-2 text-sm">
            <Link to="/about" className="text-muted-foreground transition-colors hover:text-foreground">
              Что это за проект
            </Link>
            <Link to="/help" className="text-muted-foreground transition-colors hover:text-foreground">
              Центр помощи
            </Link>
            <Link to="/streamers" className="text-muted-foreground transition-colors hover:text-foreground">
              Каталог стримеров
            </Link>
            <Link to="/tasks" className="text-muted-foreground transition-colors hover:text-foreground">
              Как работают очки и задания
            </Link>
            <Link to="/boost" className="text-muted-foreground transition-colors hover:text-foreground">
              Что даёт буст стримеру
            </Link>
          </div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Юридическая информация</div>
          <div className="mt-3 grid gap-2 text-sm">
            <Link to="/legal/privacy" className="text-muted-foreground transition-colors hover:text-foreground">
              Политика конфиденциальности
            </Link>
            <Link to="/legal/terms" className="text-muted-foreground transition-colors hover:text-foreground">
              Условия использования
            </Link>
            <Link to="/legal/payments" className="text-muted-foreground transition-colors hover:text-foreground">
              Политика платежей
            </Link>
            <Link to="/legal/refunds" className="text-muted-foreground transition-colors hover:text-foreground">
              Политика возвратов
            </Link>
            <Link to="/legal/acceptable-use" className="text-muted-foreground transition-colors hover:text-foreground">
              Правила допустимого использования
            </Link>
            <Link to="/legal/content-policy" className="text-muted-foreground transition-colors hover:text-foreground">
              Контент и модерация
            </Link>
            <Link to="/legal/delete-account" className="text-muted-foreground transition-colors hover:text-foreground">
              Удаление аккаунта и данных
            </Link>
          </div>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            NovaBoost Live не связан с TikTok, не представляет TikTok и не является официальным продуктом TikTok. Платформа не продаёт трафик TikTok и не обещает внешние метрики вне собственной экосистемы.
          </p>
        </div>
      </div>

      <div className="border-t border-border/40">
        <div className="container mx-auto flex flex-col gap-2 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
          <div>© 2026 NovaBoost Live</div>
          <div className="max-w-3xl leading-5">Используя сервис, пользователь соглашается с правилами платформы и обработкой данных в рамках работы NovaBoost Live.</div>
        </div>
      </div>
    </footer>
  );
}