import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/Header";

export const Route = createFileRoute("/legal/acceptable-use")({
  head: () => ({
    meta: [
      { title: "Правила допустимого использования — NovaBoost Live" },
      { name: "description", content: "Базовые правила допустимого использования NovaBoost Live: ограничения на злоупотребления, вводящий в заблуждение контент, автоматизацию и недобросовестное использование платформы." },
    ],
  }),
  component: AcceptableUsePage,
});

function AcceptableUsePage() {
  return (
    <div className="min-h-screen">
      <Header />
      <LegalPage
        title="Правила допустимого использования"
        intro="Эти правила определяют базовые ограничения на использование NovaBoost Live и помогают защитить платформу, стримеров и зрителей от злоупотреблений."
        sections={[
          {
            title: "1. Запрет на мошенничество и злоупотребления",
            body: "Пользователю запрещается использовать платформу для мошенничества, подделки активности, фейковых кампаний, манипуляции внутренними метриками, обхода ограничений или других недобросовестных практик.",
          },
          {
            title: "2. Запрет на вредоносный или незаконный контент",
            body: "Нельзя публиковать материалы, нарушающие закон, права третьих лиц, нормы о защите данных, права на товарные знаки, авторские права или правила самой платформы.",
          },
          {
            title: "3. Ограничения на автоматизацию",
            body: "Без явного разрешения платформы нельзя использовать ботов, скрипты, автоматические массовые действия, обход rate limits или иные механизмы, которые искажают реальное участие аудитории.",
          },
          {
            title: "4. Использование TikTok-брендинга и внешних платформ",
            body: "Пользователь не должен выдавать NovaBoost Live за официальный сервис TikTok и не должен создавать ложное впечатление об официальном партнёрстве, если оно прямо не подтверждено платформой.",
          },
          {
            title: "5. Право платформы на ограничения",
            body: "NovaBoost Live вправе ограничивать доступ, скрывать контент, отключать функции, останавливать действия пользователя или удалять материалы при подозрении на нарушение правил, угрозу платформе или жалобы со стороны правообладателей и пользователей.",
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