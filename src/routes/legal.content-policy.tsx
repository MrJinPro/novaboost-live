import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/Header";

export const Route = createFileRoute("/legal/content-policy")({
  head: () => ({
    meta: [
      { title: "Контент и модерация — NovaBoost Live" },
      { name: "description", content: "Базовые правила контента и модерации для NovaBoost Live: посты, публичные страницы, задания, сообщения и пользовательские материалы." },
    ],
  }),
  component: ContentPolicyPage,
});

function ContentPolicyPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <LegalPage
        title="Контент и модерация"
        intro="Этот документ описывает общий подход NovaBoost Live к пользовательскому контенту, публичным страницам, постам, заданиям и модерации материалов внутри платформы."
        sections={[
          {
            title: "1. За что отвечает пользователь",
            body: "Стример и зритель несут ответственность за тексты, изображения, ссылки, описания, сообщения, задания, donation-страницы, кодовые слова и иные материалы, которые они публикуют, загружают или иным образом распространяют в NovaBoost Live.",
          },
          {
            title: "2. Что запрещено публиковать",
            body: "Запрещены материалы, нарушающие закон, вводящие пользователей в заблуждение, нарушающие права третьих лиц, содержащие вредоносные ссылки, мошеннические обещания, спам, оскорбления, незаконный контент или иные злоупотребления платформой.",
          },
          {
            title: "3. Публичные профили и страницы стримеров",
            body: "Публичная страница стримера может содержать биографию, теги, ссылки, support-сценарии и иные материалы. Пользователь обязан следить, чтобы такие материалы были правомерны, актуальны и не создавали ложных обещаний от имени платформы или третьих лиц.",
          },
          {
            title: "4. Право платформы на модерацию",
            body: "NovaBoost Live вправе скрывать, ограничивать, отключать или удалять материалы и функции, если есть разумные основания считать, что они нарушают правила сервиса, права третьих лиц, требования закона или создают риск для пользователей и платформы.",
          },
          {
            title: "5. Ограничение ответственности платформы",
            body: "Платформа предоставляет техническую среду для публикации и взаимодействия, но не принимает на себя автоматическую ответственность за каждое пользовательское высказывание или публикацию. При этом NovaBoost Live оставляет за собой право вмешиваться и модерировать контент по своему усмотрению в рамках политики сервиса.",
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