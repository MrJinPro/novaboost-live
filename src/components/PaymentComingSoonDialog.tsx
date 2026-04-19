import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  PAYMENT_METHOD_OPTIONS,
  savePaymentInterestSurvey,
  type PaymentMethodKey,
} from "@/lib/payment-interest-data";
import type { Json } from "@/integrations/supabase/types";

export type PaymentSurveyRequest = {
  userId?: string | null;
  entryPoint: string;
  triggerLabel: string;
  title: string;
  description?: string;
  context?: Json;
};

type PaymentComingSoonDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: PaymentSurveyRequest | null;
};

export function PaymentComingSoonDialog({ open, onOpenChange, request }: PaymentComingSoonDialogProps) {
  const [selectedMethods, setSelectedMethods] = useState<PaymentMethodKey[]>([]);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !request) {
      return;
    }

    setSelectedMethods([]);
    setComment("");
  }, [open, request]);

  const handleMethodToggle = (method: PaymentMethodKey, checked: boolean) => {
    setSelectedMethods((current) => {
      if (checked) {
        return current.includes(method) ? current : [...current, method];
      }

      return current.filter((value) => value !== method);
    });
  };

  const handleSubmit = async () => {
    if (!request) {
      return;
    }

    if (selectedMethods.length === 0) {
      toast.error("Выбери хотя бы один способ оплаты / Pick at least one payment method");
      return;
    }

    setSubmitting(true);
    try {
      await savePaymentInterestSurvey({
        userId: request.userId ?? null,
        entryPoint: request.entryPoint,
        triggerLabel: request.triggerLabel,
        preferredMethods: selectedMethods,
        comment,
        context: request.context,
      });

      toast.success("Спасибо. Это поможет выбрать первый платёжный шлюз / Thanks, this helps us pick the first payment gateway.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось отправить опрос");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-border/60 bg-background/98 p-0 sm:rounded-3xl">
        <div className="rounded-t-3xl border-b border-border/50 bg-[radial-gradient(circle_at_top,rgba(255,133,32,0.16),transparent_58%),linear-gradient(180deg,rgba(19,13,44,0.95),rgba(14,11,34,0.95))] px-6 py-5 text-white">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white/80">
            <Wallet className="h-3.5 w-3.5" /> Payment survey
          </div>
          <DialogHeader className="mt-4 text-left">
            <DialogTitle className="font-display text-2xl font-bold text-white">
              Упс, рано пока... Очень скоро будет. Oops, a bit early... Coming very soon.
            </DialogTitle>
            <DialogDescription className="mt-2 max-w-xl text-sm leading-6 text-white/75">
              Онлайн-оплата для этого действия ещё не запущена. Подскажи, как тебе было бы удобнее платить, чтобы мы подключили правильный шлюз первым.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-6 px-6 py-6">
          <div className="rounded-2xl border border-border/50 bg-surface/40 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Что ты хотел(а) сделать / What were you trying to do?</div>
            <div className="mt-2 font-display text-xl font-bold">{request?.title ?? "Покупка / Purchase"}</div>
            {request?.description && (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{request.description}</p>
            )}
          </div>

          <div>
            <div className="text-sm font-medium">Каким способом было бы удобнее платить? / Which payment method would be most convenient?</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {PAYMENT_METHOD_OPTIONS.map((option) => {
                const checked = selectedMethods.includes(option.key);

                return (
                  <label
                    key={option.key}
                    className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors ${checked ? "border-blast bg-blast/8" : "border-border/50 bg-background/30 hover:border-foreground/30"}`}
                  >
                    <Checkbox checked={checked} onCheckedChange={(value) => handleMethodToggle(option.key, value === true)} className="mt-0.5" />
                    <div>
                      <div className="font-medium text-foreground">{option.title}</div>
                      <div className="text-xs text-muted-foreground">{option.subtitle}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium">Комментарий / Comment</Label>
            <Textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              className="mt-2 min-h-28 bg-background"
              placeholder="Например: карта РФ, СБП, Stars, PayPal, Apple Pay, crypto / For example: local cards, bank transfer, Stars, PayPal, Apple Pay, crypto"
            />
          </div>
        </div>

        <DialogFooter className="border-t border-border/50 px-6 py-5">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Позже / Later</Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting} className="bg-gradient-blast font-bold text-blast-foreground">
            {submitting ? "Отправляю… / Sending…" : "Отправить ответ / Send feedback"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function usePaymentComingSoonSurvey() {
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState<PaymentSurveyRequest | null>(null);

  const openSurvey = (nextRequest: PaymentSurveyRequest) => {
    setRequest(nextRequest);
    setOpen(true);
  };

  return {
    openSurvey,
    surveyDialog: <PaymentComingSoonDialog open={open} onOpenChange={setOpen} request={request} />,
  };
}