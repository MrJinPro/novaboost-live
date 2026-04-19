import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/Header";

export const Route = createFileRoute("/legal/payments")({
  head: () => ({
    meta: [
      { title: "Политика платежей — NovaBoost Live" },
      { name: "description", content: "Правила, ограничения и базовые условия работы платёжных сценариев NovaBoost Live, включая будущие подключения gateway и временные неактивные payment-flows." },
    ],
  }),
  component: PaymentsPolicyPage,
});

function PaymentsPolicyPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <LegalPage
        title="Политика платежей"
        intro="Этот документ описывает, как NovaBoost Live относится к платёжным сценариям, будущему подключению платёжных шлюзов и временным ограничениям payment-функций на платформе."
        sections={[
          {
            title: "1. Текущий статус платёжных функций",
            body: "Некоторые платёжные сценарии в интерфейсе могут находиться в режиме подготовки. В таких случаях платформа показывает уведомление о скором запуске и может собирать предпочтительный способ оплаты без фактического списания средств.",
          },
          {
            title: "2. Внутренние очки и платежи - не одно и то же",
            body: "Viewer points, уровни, boost-механики и другие внутренние игровые элементы NovaBoost Live не являются деньгами и не должны автоматически трактоваться как платёжный инструмент, если платформа прямо не указала иное.",
          },
          {
            title: "3. Платёжный шлюз и способы оплаты",
            body: "Когда реальные платежи будут подключены, NovaBoost Live сможет использовать сторонних платёжных провайдеров. Доступные методы оплаты, валюта расчёта, возвраты и ограничения могут зависеть от страны, провайдера и конкретного сервиса.",
          },
          {
            title: "4. Возвраты и споры",
            body: "Условия возвратов, отмен, спорных транзакций и обработки ошибочных платежей будут применяться отдельно к конкретным активным платёжным сценариям после их официального запуска и публикации соответствующих правил.",
          },
          {
            title: "5. Отсутствие гарантий по эффекту платных услуг",
            body: "Даже после активации платёжных функций NovaBoost Live не обязуется гарантировать внешний рост TikTok-метрик, увеличение просмотров, лайков, дохода или иного результата вне собственной экосистемы, если иное прямо не указано в конкретном предложении.",
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