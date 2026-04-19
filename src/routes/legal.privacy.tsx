import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/Header";

export const Route = createFileRoute("/legal/privacy")({
  head: () => ({
    meta: [
      { title: "Политика конфиденциальности — NovaBoost Live" },
      { name: "description", content: "Политика конфиденциальности NovaBoost Live: какие данные собираются, зачем и как они используются внутри платформы." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <LegalPage
        title="Политика конфиденциальности"
        intro="Этот документ описывает, какие данные NovaBoost Live может обрабатывать для работы платформы, как они используются и какие ограничения применяются к их использованию."
        sections={[
          {
            title: "1. Какие данные мы можем обрабатывать",
            body: "Платформа может обрабатывать данные профиля пользователя, TikTok username, базовые метрики активности внутри NovaBoost Live, viewer points, данные о действиях на страницах стримеров, а также технические данные, необходимые для стабильной работы сервиса и защиты от злоупотреблений.",
          },
          {
            title: "2. Зачем используются данные",
            body: "Данные используются для авторизации, отображения публичных страниц, работы каталога, подсчёта viewer points, отображения бустов, настройки OBS-виджетов, доставки внутренних уведомлений и улучшения пользовательского опыта внутри NovaBoost Live.",
          },
          {
            title: "3. Что не обещает платформа",
            body: "NovaBoost Live не обещает рост метрик TikTok, не гарантирует внешний трафик и не заявляет, что действия пользователя внутри платформы прямо влияют на алгоритмы TikTok. Все внутренние механики касаются прежде всего экосистемы NovaBoost Live.",
          },
          {
            title: "4. Передача данных третьим лицам",
            body: "Данные могут обрабатываться инфраструктурными провайдерами, необходимыми для работы сервиса, например хостингом, базой данных, аналитикой, системой доставки уведомлений и другими техническими подрядчиками. Платформа не продаёт персональные данные как отдельный товар.",
          },
          {
            title: "5. Публичные данные",
            body: "Информация, которую пользователь или стример явно публикует внутри NovaBoost Live, может быть видна другим пользователям платформы. Пользователь несёт ответственность за данные, которые добровольно размещает в публичных разделах.",
          },
          {
            title: "6. Изменения политики",
            body: "NovaBoost Live может обновлять эту политику по мере развития сервиса, появления новых функций, интеграций и юридических требований. Актуальная версия публикуется на этой странице.",
          },
        ]}
      />
    </div>
  );
}

function LegalPage({ title, intro, sections }: { title: string; intro: string; sections: Array<{ title: string; body: string }> }) {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <h1 className="font-display text-4xl font-bold">{title}</h1>
      <p className="mt-4 text-muted-foreground">{intro}</p>
      <div className="mt-8 space-y-6">
        {sections.map((section) => (
          <section key={section.title} className="rounded-3xl border border-border/50 bg-surface/60 p-6">
            <h2 className="font-display text-2xl font-bold">{section.title}</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">{section.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}