import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/Header";

export const Route = createFileRoute("/legal/refunds")({
  head: () => ({
    meta: [
      { title: "Политика возвратов — NovaBoost Live" },
      { name: "description", content: "Базовая политика возвратов и отмен для будущих платёжных сценариев NovaBoost Live." },
    ],
  }),
  component: RefundsPage,
});

function RefundsPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <LegalPage
        title="Политика возвратов"
        intro="Этот документ задаёт общий подход NovaBoost Live к отменам, возвратам и обработке спорных транзакций в тех сценариях, где платёжные функции будут официально активированы."
        sections={[
          {
            title: "1. Пока платёжный сценарий не активирован",
            body: "Если на странице показывается coming-soon flow и не происходит фактического списания средств, такая операция не считается завершённой оплатой и не требует возврата как денежной транзакции.",
          },
          {
            title: "2. Возвраты для будущих активных платежей",
            body: "Когда конкретный платёжный продукт будет запущен, правила возврата могут зависеть от характера услуги, стадии её исполнения, технических ограничений платёжного провайдера и локальных требований применимого законодательства.",
          },
          {
            title: "3. Ошибочные списания и технические сбои",
            body: "Если после официального запуска платёжного сценария произойдёт ошибочное списание или очевидный технический сбой, NovaBoost Live оставляет за собой право индивидуально рассматривать такой случай и принимать решение о возврате или иной компенсации в рамках правил конкретного сервиса.",
          },
          {
            title: "4. Ограничение по цифровым и внутриигровым механикам",
            body: "Внутренние очки, уровни, бусты и иные игровые элементы платформы не являются автоматически возвратными денежными единицами. Их правовой режим определяется отдельными правилами конкретной активной функции NovaBoost Live.",
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