import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { ProjectHelpPanel } from "@/components/ProjectHelpPanel";
import { Button } from "@/components/ui/button";
import { LifeBuoy, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "Центр помощи — NovaBoost Live" },
      { name: "description", content: "FAQ и подсказки по NovaBoost Live: что это за проект, как работают points, boost, задания, донаты, студия и юридические документы." },
    ],
  }),
  component: HelpPage,
});

function HelpPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface/60 px-3 py-1 text-xs text-muted-foreground">
          <LifeBuoy className="h-3.5 w-3.5 text-cosmic" /> Help Center
        </div>
        <h1 className="mt-4 font-display text-4xl font-bold">Центр помощи</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Здесь собраны основные ответы о NovaBoost Live: что это за проект, как устроены viewer points, boost, задания, публичные страницы стримеров и где посмотреть юридические условия.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <ProjectHelpPanel
            badge="Для зрителя"
            title="Что важно знать зрителю"
            description="Эти подсказки объясняют базовую механику участия в платформе."
            items={[
              {
                key: "viewer-points",
                title: "Как работают viewer points",
                body: "Очки зрителя начисляются за задания и активность внутри NovaBoost Live. Это внутренняя механика участия, а не денежный баланс и не выводимая валюта.",
              },
              {
                key: "boost-support",
                title: "Что такое boost",
                body: "Boost - это внутренняя поддержка стримера за счёт твоих points. Он усиливает видимость стримера внутри каталога и рекомендаций NovaBoost Live, но не покупает внешний трафик TikTok.",
              },
              {
                key: "donations",
                title: "Что с донатами и оплатой",
                body: "Там, где реальная оплата ещё не включена, сервис показывает уведомление о скором запуске и собирает предпочтительный способ оплаты. Это временный этап перед полноценным подключением gateway.",
              },
            ]}
          />

          <ProjectHelpPanel
            badge="Для стримера"
            title="Что важно знать стримеру"
            description="Эти подсказки помогают понять, как использовать студию и публичную страницу." 
            items={[
              {
                key: "public-page",
                title: "Зачем нужна публичная страница",
                body: "Публичная страница в NovaBoost Live - это отдельный контур вокруг стримера: описание, посты, анонсы, support links, OBS-виджеты и другие точки контакта между эфирами.",
              },
              {
                key: "studio",
                title: "Что такое студия",
                body: "Студия - это панель управления страницей, контентом, заданиями и overlay-настройками. Она нужна, чтобы стример управлял своим присутствием внутри NovaBoost Live, а не только в TikTok.",
              },
              {
                key: "platform-position",
                title: "Что обещает и чего не обещает платформа",
                body: "NovaBoost Live помогает с внутренней видимостью, вовлечением и удержанием. Платформа не даёт гарантий по внешним метрикам TikTok, доходу или продвижению алгоритмами TikTok.",
              },
            ]}
          />
        </div>

        <div className="mt-8 rounded-3xl border border-border/50 bg-surface/60 p-6">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ShieldCheck className="h-4 w-4 text-emerald-300" /> Юридический блок
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Для базовой прозрачности и защиты платформы юридические документы вынесены в отдельные страницы. Это не замена консультации юриста, но уже рабочий foundation для продукта.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/legal/privacy"><Button variant="outline">Privacy Policy</Button></Link>
            <Link to="/legal/terms"><Button variant="outline">Terms of Use</Button></Link>
            <Link to="/legal/payments"><Button variant="outline">Payment Policy</Button></Link>
            <Link to="/legal/refunds"><Button variant="outline">Refund Policy</Button></Link>
            <Link to="/legal/acceptable-use"><Button variant="outline">Acceptable Use</Button></Link>
            <Link to="/legal/content-policy"><Button variant="outline">Content Policy</Button></Link>
          </div>
        </div>
      </div>
    </div>
  );
}