import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { ExternalLink, Smartphone } from "lucide-react";

const PLAY_TESTING_URL = "https://play.google.com/apps/testing/com.novaboost.live";

export function AppFooter() {
  return (
    <footer className="border-t border-border/40 bg-background/70">
      <div className="container mx-auto grid gap-6 px-4 py-8 md:grid-cols-[1.1fr_0.9fr_1fr] md:items-start">
        <div>
          <Logo size="sm" showText />
          <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
            NovaBoost Live - независимый сервис вокруг TikTok LIVE: каталог стримеров, viewer points, бусты, контент между эфирами, OBS-виджеты и вовлечение аудитории.
          </p>
          <a
            href={PLAY_TESTING_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-cosmic/35 bg-cosmic/10 px-4 py-3 text-sm font-medium text-foreground transition-colors hover:border-cosmic/60 hover:bg-cosmic/15"
          >
            <Smartphone className="h-4 w-4 text-cosmic" />
            Вступить в закрытое тестирование Android
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </a>
          <p className="mt-2 max-w-md text-xs leading-5 text-muted-foreground">
            Ссылка ведёт на закрытый тест в Google Play для пакета com.novaboost.live.
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
            <Link to="/legal/child-safety" className="text-muted-foreground transition-colors hover:text-foreground">
              Стандарты безопасности детей
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
          <PaymentMethodIcons />
          <div className="max-w-3xl leading-5">Используя сервис, пользователь соглашается с правилами платформы и обработкой данных в рамках работы NovaBoost Live.</div>
        </div>
      </div>
    </footer>
  );
}

function PaymentMethodIcons() {
  return (
    <div className="flex items-center gap-2" aria-label="Accepted payment methods">
      <span className="sr-only">Принимаем оплату через</span>
      <PaymentBadge label="Visa" bg="#1A1F71" textColor="#fff">VISA</PaymentBadge>
      <PaymentBadge label="Mastercard" bg="#fff" textColor="#1A1F71">
        <span className="flex items-center">
          <span className="h-4 w-4 rounded-full bg-[#EB001B]" />
          <span className="-ml-1.5 h-4 w-4 rounded-full bg-[#F79E1B] mix-blend-multiply" />
        </span>
      </PaymentBadge>
      <PaymentBadge label="Google Pay" bg="#fff" textColor="#3c4043">
        <span className="text-[10px] font-medium tracking-tight">
          <span className="text-[#4285F4]">G</span>
          <span className="text-[#EA4335]">o</span>
          <span className="text-[#FBBC04]">o</span>
          <span className="text-[#4285F4]">g</span>
          <span className="text-[#34A853]">l</span>
          <span className="text-[#EA4335]">e</span>
          <span className="text-[#3c4043]"> Pay</span>
        </span>
      </PaymentBadge>
      <PaymentBadge label="Apple Pay" bg="#000" textColor="#fff">
        <span className="text-[10px] font-semibold tracking-tight"> Pay</span>
      </PaymentBadge>
      <PaymentBadge label="PayPal" bg="#fff" textColor="#003087">
        <span className="text-[10px] font-bold italic">
          <span className="text-[#003087]">Pay</span>
          <span className="text-[#009CDE]">Pal</span>
        </span>
      </PaymentBadge>
    </div>
  );
}

function PaymentBadge({ label, bg, textColor, children }: { label: string; bg: string; textColor: string; children: React.ReactNode }) {
  return (
    <span
      title={label}
      aria-label={label}
      className="flex h-6 min-w-[40px] items-center justify-center rounded-md border border-border/40 px-1.5 text-[10px] font-bold tracking-wide shadow-sm"
      style={{ backgroundColor: bg, color: textColor }}
    >
      {children}
    </span>
  );
}