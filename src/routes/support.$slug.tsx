import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { CurrencySwitcher } from "@/components/CurrencySwitcher";
import { Header } from "@/components/Header";
import { LocalizedPrice } from "@/components/LocalizedPrice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Wallet } from "lucide-react";
import { toast } from "sonner";
import { convertCurrency, formatEditableAmount, getLocalizedMoney, useCurrencyPreference } from "@/lib/currency";
import { createDonationEvent, loadDonationLinkBySlug } from "@/lib/monetization-data";

export const Route = createFileRoute("/support/$slug")({
  head: () => ({
    meta: [
      { title: "Поддержать стримера — NovaBoost Live" },
      { name: "description", content: "Платформенная страница поддержки стримера с фиксацией доната в NovaBoost Live." },
    ],
  }),
  component: SupportPage,
});

type DonationLinkPage = {
  id: string;
  streamer_id: string;
  slug: string;
  title: string;
  description: string | null;
  minimum_amount: number;
  is_active: boolean;
  streamers?: {
    display_name: string;
    tiktok_username: string;
    avatar_url: string | null;
  } | null;
};

const PRESET_AMOUNTS = [100, 250, 500, 1000];

function SupportPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const currencyPreference = useCurrencyPreference();
  const [linkData, setLinkData] = useState<DonationLinkPage | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [donorName, setDonorName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    const syncPage = async () => {
      setPageLoading(true);
      try {
        const data = await loadDonationLinkBySlug(slug);
        if (active) {
          setLinkData((data ?? null) as DonationLinkPage | null);
        }
      } catch (error) {
        if (active) {
          setLinkData(null);
          toast.error(error instanceof Error ? error.message : "Не удалось загрузить donation link");
        }
      } finally {
        if (active) {
          setPageLoading(false);
        }
      }
    };

    void syncPage();

    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    if (!user) {
      setDonorName("");
      return;
    }

    setDonorName(user.displayName || user.username || "");
  }, [user]);

  useEffect(() => {
    if (!linkData) {
      return;
    }

    const initialBaseAmount = Math.max(250, linkData.minimum_amount);
    setAmount(formatEditableAmount(convertCurrency(initialBaseAmount, "RUB", "USD")));
  }, [linkData?.id, linkData?.minimum_amount]);

  const minimumAmount = linkData?.minimum_amount ?? 0;
  const minimumMoney = useMemo(
    () => getLocalizedMoney(minimumAmount, { baseCurrency: "RUB", preference: currencyPreference }),
    [currencyPreference, minimumAmount],
  );
  const parsedUsdAmount = Number(amount.replace(",", "."));
  const parsedBaseAmount = Number.isFinite(parsedUsdAmount)
    ? Math.round(convertCurrency(parsedUsdAmount, "USD", "RUB"))
    : Number.NaN;
  const enteredMoney = Number.isFinite(parsedBaseAmount)
    ? getLocalizedMoney(parsedBaseAmount, { baseCurrency: "RUB", preference: currencyPreference })
    : minimumMoney;

  if (pageLoading) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="container mx-auto px-4 py-16 text-center text-muted-foreground">Загрузка страницы поддержки…</div>
      </div>
    );
  }

  if (!linkData) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="font-display text-3xl font-bold">Donation link не найден</h1>
          <Link to="/streamers"><Button className="mt-4">К каталогу</Button></Link>
        </div>
      </div>
    );
  }

  const handleDonate = async () => {
    if (!user) {
      toast.error("Для доната нужен вход в профиль зрителя");
      navigate({ to: "/auth" });
      return;
    }

    if (user.role !== "viewer") {
      toast.error("Донаты доступны из профиля зрителя");
      return;
    }

    if (!donorName.trim()) {
      toast.error("Укажи имя донатора");
      return;
    }

    if (!Number.isFinite(parsedBaseAmount) || parsedBaseAmount < minimumAmount) {
      toast.error(`Минимальная сумма поддержки: ${minimumMoney.primary}`);
      return;
    }

    setSubmitting(true);
    try {
      await createDonationEvent({
        streamerId: linkData.streamer_id,
        donationLinkId: linkData.id,
        donorUserId: user.id,
        donorName,
        amount: parsedBaseAmount,
        message,
      });
      toast.success(`Поддержка ${enteredMoney.primary} отправлена`);
      navigate({ to: "/streamer/$id", params: { id: linkData.streamer_id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось отправить донат");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Header />
      <div className="container mx-auto max-w-3xl px-4 py-6">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/streamer/$id", params: { id: linkData.streamer_id } })} className="gap-1.5 -ml-3">
          <ArrowLeft className="h-4 w-4" /> К стримеру
        </Button>

        <div className="mt-6 rounded-3xl border border-border/50 bg-surface/60 p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-gradient-blast px-3 py-1 text-xs font-bold text-blast-foreground shadow-glow">
              <Wallet className="h-3.5 w-3.5" /> SUPPORT
            </div>
            <CurrencySwitcher inline />
          </div>

          <div className="mt-5 flex items-center gap-4">
            {linkData.streamers?.avatar_url ? (
              <img src={linkData.streamers.avatar_url} alt={linkData.streamers.display_name} className="h-16 w-16 rounded-full object-cover" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-xl font-bold">
                {(linkData.streamers?.display_name ?? "N").slice(0, 1)}
              </div>
            )}
            <div>
              <h1 className="font-display text-3xl font-bold">{linkData.title}</h1>
              <div className="mt-1 text-sm text-muted-foreground">
                {linkData.streamers?.display_name} @{linkData.streamers?.tiktok_username}
              </div>
            </div>
          </div>

          <p className="mt-4 text-muted-foreground">
            {linkData.description ?? "Поддержи стримера через платформенную ссылку NovaBoost Live. После отправки донат попадёт в публичный блок последних поддержек."}
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            {PRESET_AMOUNTS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAmount(formatEditableAmount(convertCurrency(Math.max(preset, minimumAmount), "RUB", "USD")))}
                className={`rounded-2xl border px-4 py-3 text-left ${amount === formatEditableAmount(convertCurrency(Math.max(preset, minimumAmount), "RUB", "USD")) ? "border-blast bg-blast/10" : "border-border/50 bg-background/30"}`}
              >
                <LocalizedPrice
                  amount={Math.max(preset, minimumAmount)}
                  preference={currencyPreference}
                  primaryClassName="font-display text-xl font-bold"
                  secondaryClassName="text-xs text-muted-foreground"
                />
                <div className="text-xs text-muted-foreground">быстрый донат</div>
              </button>
            ))}
          </div>

          <div className="mt-6 space-y-4">
            <Field label="Твоё имя в алерте">
              <Input value={donorName} onChange={(e) => setDonorName(e.target.value)} placeholder="Например: NovaFan" />
            </Field>
            <Field label="Сумма поддержки, USD">
              <Input type="number" min={convertCurrency(minimumAmount, "RUB", "USD").toFixed(2)} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <div className="mt-2 text-xs text-muted-foreground">
                {enteredMoney.primary}
                {enteredMoney.secondary ? ` · ${enteredMoney.secondary}` : ""}
              </div>
            </Field>
            <Field label="Сообщение стримеру">
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-24 bg-background" placeholder="Например: удачного эфира и побольше онлайна" />
            </Field>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={handleDonate} disabled={submitting} className="bg-gradient-blast text-blast-foreground font-bold gap-2">
              <Wallet className="h-4 w-4" /> {submitting ? "Отправляю поддержку…" : `Поддержать на ${enteredMoney.primary}`}
            </Button>
            {!user && (
              <Link to="/auth">
                <Button variant="outline">Войти как зритель</Button>
              </Link>
            )}
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            После отправки поддержка появится на странице стримера в списке последних донатов. Основная витрина показывает USD, локальная валюта определяется по региону браузера{currencyPreference.countryCode ? ` (${currencyPreference.countryCode})` : ""}.
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}