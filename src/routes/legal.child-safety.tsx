import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/Header";

export const Route = createFileRoute("/legal/child-safety")({
  head: () => ({
    meta: [
      { title: "Стандарты безопасности детей — NovaBoost Live" },
      {
        name: "description",
        content:
          "Публичные стандарты NovaBoost Live по предотвращению сексуального насилия над детьми и их эксплуатации, а также контактная информация для обращений.",
      },
    ],
  }),
  component: ChildSafetyPage,
});

function ChildSafetyPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <h1 className="font-display text-4xl font-bold">Стандарты безопасности детей</h1>
        <p className="mt-4 text-muted-foreground">
          NovaBoost Live запрещает контент, поведение и любые материалы, связанные с сексуальным насилием над детьми,
          сексуальной эксплуатацией несовершеннолетних, вовлечением несовершеннолетних в сексуализированный контент,
          грумингом, торговлей детьми, шантажом, вымогательством интимных материалов и любыми попытками нормализовать,
          продвигать или скрывать такие действия.
        </p>

        <div className="mt-8 space-y-6">
          <section className="rounded-3xl border border-border/50 bg-surface/60 p-6">
            <h2 className="font-display text-2xl font-bold">1. Что строго запрещено</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              В NovaBoost Live запрещены публикации, ссылки, описания, изображения, видео, никнеймы, комментарии,
              сообщения, задания, донат-страницы, внешние ссылки и иные материалы, которые содержат, рекламируют,
              запрашивают, координируют или оправдывают сексуальное насилие над детьми и их эксплуатацию.
            </p>
          </section>

          <section className="rounded-3xl border border-border/50 bg-surface/60 p-6">
            <h2 className="font-display text-2xl font-bold">2. Какие меры применяет платформа</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              При обнаружении такого контента или поведения NovaBoost Live вправе немедленно ограничить доступ,
              скрыть материалы, отключить функции, заморозить или удалить аккаунт, сохранить технические данные,
              необходимые для расследования, и передать информацию уполномоченным органам в случаях, предусмотренных
              законом и правилами платформы.
            </p>
          </section>

          <section className="rounded-3xl border border-border/50 bg-surface/60 p-6">
            <h2 className="font-display text-2xl font-bold">3. Как сообщить о нарушении</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Если вы обнаружили контент или поведение, связанное с угрозой безопасности детей, отправьте обращение на
              <a className="text-foreground underline underline-offset-4" href="mailto:support@novaboost.live?subject=Child%20safety%20report">
                support@novaboost.live
              </a>
              . Укажите ссылку на профиль, страницу, пост или иной материал, краткое описание ситуации и любые данные,
              которые помогут быстро проверить обращение.
            </p>
          </section>

          <section className="rounded-3xl border border-border/50 bg-surface/60 p-6">
            <h2 className="font-display text-2xl font-bold">4. Контактное лицо</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              По вопросам соблюдения этих стандартов и обработки обращений о безопасности детей можно связаться через
              тот же адрес: support@novaboost.live. Этот контакт предназначен для обращений по policy и взаимодействия
              с площадками и уполномоченными органами.
            </p>
          </section>

          <section className="rounded-3xl border border-border/50 bg-surface/60 p-6">
            <h2 className="font-display text-2xl font-bold">5. Дополнительные обязательства</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              NovaBoost Live ожидает от пользователей соблюдения применимого законодательства, требований платформ,
              правил по пользовательскому контенту и немедленного прекращения любых действий, которые создают риск
              сексуальной эксплуатации несовершеннолетних или способствуют ей.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}