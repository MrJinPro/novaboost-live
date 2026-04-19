import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/Header";

export const Route = createFileRoute("/legal/delete-account")({
  head: () => ({
    meta: [
      { title: "Удаление аккаунта и данных — NovaBoost Live" },
      {
        name: "description",
        content:
          "Публичная инструкция NovaBoost Live по запросу удаления аккаунта и связанных данных для пользователей и проверки магазинами приложений.",
      },
    ],
  }),
  component: DeleteAccountPage,
});

function DeleteAccountPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <h1 className="font-display text-4xl font-bold">Запрос на удаление аккаунта и данных</h1>
        <p className="mt-4 text-muted-foreground">
          На этой странице описано, как пользователь NovaBoost Live может запросить удаление своего аккаунта и связанных с ним данных.
        </p>

        <div className="mt-8 space-y-6">
          <section className="rounded-3xl border border-border/50 bg-surface/60 p-6">
            <h2 className="font-display text-2xl font-bold">1. Как отправить запрос</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Отправьте письмо на 
              <a className="text-foreground underline underline-offset-4" href="mailto:support@novaboost.live?subject=Delete%20account%20request">
                support@novaboost.live
              </a>
              . В теме письма укажите Delete account request, а в сообщении укажите email аккаунта, TikTok username при наличии и короткое подтверждение, что вы хотите удалить аккаунт и связанные данные.
            </p>
          </section>

          <section className="rounded-3xl border border-border/50 bg-surface/60 p-6">
            <h2 className="font-display text-2xl font-bold">2. Что будет удалено</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              По запросу удаляются данные профиля внутри NovaBoost Live, привязанные публичные данные аккаунта, внутренние настройки, viewer points, история действий внутри пользовательского кабинета и иные данные, которые больше не нужны для исполнения юридических и технических обязательств сервиса.
            </p>
          </section>

          <section className="rounded-3xl border border-border/50 bg-surface/60 p-6">
            <h2 className="font-display text-2xl font-bold">3. Что может храниться ограниченно</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Отдельные технические журналы, данные по безопасности, антифроду, бухгалтерские или иные записи, которые требуются по закону или для защиты платформы, могут храниться ограниченное время даже после удаления аккаунта. Такие данные не используются как активный профиль пользователя.
            </p>
          </section>

          <section className="rounded-3xl border border-border/50 bg-surface/60 p-6">
            <h2 className="font-display text-2xl font-bold">4. Срок обработки</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              NovaBoost Live обрабатывает запрос на удаление в разумный срок после проверки принадлежности аккаунта. Если для завершения удаления потребуется дополнительное подтверждение, пользователь получит ответ на тот же email.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}