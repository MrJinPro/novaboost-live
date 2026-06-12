import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { loadApplePaySdk, loadPayPalSdk } from "@/lib/paypal-sdk";
import {
  capturePayPalOrderFn,
  createPayPalOrderFn,
  getPayPalClientConfig,
} from "@/lib/paypal-payments.functions";

export type PayPalCheckoutRequest = {
  scenario: "donation" | "promotion" | "membership" | "other";
  scenarioRef: Record<string, unknown>;
  amount: number; // USD
  description: string;
  title?: string;
  subtitle?: string;
};

type PayPalCheckoutDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: PayPalCheckoutRequest | null;
  onSuccess?: (result: { captureId: string | null }) => void;
};

export function PayPalCheckoutDialog({ open, onOpenChange, request, onSuccess }: PayPalCheckoutDialogProps) {
  const [config, setConfig] = useState<{ clientId: string; environment: "sandbox" | "live"; currency: "USD" } | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showCard, setShowCard] = useState(false);

  const buttonsContainerRef = useRef<HTMLDivElement | null>(null);
  const googlePayContainerRef = useRef<HTMLDivElement | null>(null);
  const applePayContainerRef = useRef<HTMLDivElement | null>(null);
  const cardFormRef = useRef<HTMLDivElement | null>(null);

  const fetchConfig = useServerFn(getPayPalClientConfig);
  const createOrder = useServerFn(createPayPalOrderFn);
  const captureOrder = useServerFn(capturePayPalOrderFn);

  const amountStr = useMemo(() => (request ? request.amount.toFixed(2) : "0.00"), [request]);

  // Load config + SDK when dialog opens
  useEffect(() => {
    if (!open || !request) return;
    setLoadError(null);
    setSdkReady(false);
    setShowCard(false);
    let cancelled = false;
    (async () => {
      try {
        const cfg = config ?? (await fetchConfig());
        if (cancelled) return;
        setConfig(cfg);
        await loadPayPalSdk({ clientId: cfg.clientId, currency: cfg.currency, intent: "capture" });
        if (!cancelled) setSdkReady(true);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to initialize PayPal");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSuccess = useCallback(
    (captureId: string | null) => {
      toast.success("Платёж принят / Payment received");
      onSuccess?.({ captureId });
      onOpenChange(false);
    },
    [onOpenChange, onSuccess],
  );

  const createOrderAndReturnId = useCallback(async () => {
    if (!request) throw new Error("No payment request");
    const result = await createOrder({
      data: {
        scenario: request.scenario,
        scenarioRef: request.scenarioRef,
        amount: Number(request.amount.toFixed(2)),
        currency: "USD",
        description: request.description,
      },
    });
    return result.orderId;
  }, [createOrder, request]);

  const handleApproved = useCallback(
    async (orderId: string) => {
      setSubmitting(true);
      try {
        const result = await captureOrder({ data: { orderId } });
        if (result.status === "success") {
          handleSuccess(result.captureId);
        } else {
          toast.error("Платёж не прошёл / Payment was not captured");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Capture failed");
      } finally {
        setSubmitting(false);
      }
    },
    [captureOrder, handleSuccess],
  );

  // Render PayPal Buttons
  useEffect(() => {
    if (!open || !sdkReady || !request) return;
    const paypal = window.paypal;
    if (!paypal || !buttonsContainerRef.current) return;
    buttonsContainerRef.current.innerHTML = "";
    const buttons = paypal.Buttons({
      style: { layout: "vertical", shape: "rect", color: "gold", label: "paypal" },
      createOrder: () => createOrderAndReturnId(),
      onApprove: async (data: { orderID: string }) => handleApproved(data.orderID),
      onError: (err: unknown) => {
        toast.error(err instanceof Error ? err.message : "PayPal error");
      },
    });
    void buttons.render(buttonsContainerRef.current);
    return () => {
      try {
        buttons.close?.();
      } catch {
        /* noop */
      }
    };
  }, [open, sdkReady, request, createOrderAndReturnId, handleApproved]);

  // Render Google Pay button
  useEffect(() => {
    if (!open || !sdkReady || !request) return;
    const paypal = window.paypal;
    if (!paypal?.Googlepay || !googlePayContainerRef.current) return;
    const container = googlePayContainerRef.current;
    container.innerHTML = "";
    let cancelled = false;
    (async () => {
      try {
        const googlepay = paypal.Googlepay!();
        const gpConfig = await googlepay.config();
        if (cancelled || !(window as unknown as { google?: { payments?: { api?: { PaymentsClient?: new (opts: unknown) => unknown } } } }).google) {
          // Google Pay JS not present; skip gracefully
          return;
        }
        const google = (window as unknown as {
          google: {
            payments: {
              api: {
                PaymentsClient: new (opts: { environment: "TEST" | "PRODUCTION" }) => {
                  createButton: (opts: { onClick: () => void; buttonColor?: string; buttonType?: string }) => HTMLElement;
                  loadPaymentData: (req: unknown) => Promise<{ paymentMethodData: unknown }>;
                };
              };
            };
          };
        }).google;
        const client = new google.payments.api.PaymentsClient({ environment: config?.environment === "live" ? "PRODUCTION" : "TEST" });
        const button = client.createButton({
          buttonColor: "black",
          buttonType: "pay",
          onClick: async () => {
            try {
              const orderId = await createOrderAndReturnId();
              const paymentRequest = {
                ...(gpConfig as object),
                transactionInfo: {
                  countryCode: "US",
                  currencyCode: "USD",
                  totalPriceStatus: "FINAL",
                  totalPrice: amountStr,
                },
              };
              const paymentData = await client.loadPaymentData(paymentRequest);
              const result = await googlepay.confirmOrder({ orderId, paymentMethodData: paymentData.paymentMethodData });
              if (result.status === "APPROVED" || result.status === "COMPLETED") {
                await handleApproved(orderId);
              } else {
                toast.error(`Google Pay: ${result.status}`);
              }
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Google Pay failed");
            }
          },
        });
        container.appendChild(button);
      } catch (err) {
        console.warn("[paypal] Google Pay init failed", err);
      }
    })();
    return () => {
      cancelled = true;
      container.innerHTML = "";
    };
  }, [open, sdkReady, request, config, amountStr, createOrderAndReturnId, handleApproved]);

  // Render Apple Pay button (only when available)
  useEffect(() => {
    if (!open || !sdkReady || !request) return;
    const paypal = window.paypal;
    if (!paypal?.Applepay || !applePayContainerRef.current) return;
    const container = applePayContainerRef.current;
    container.innerHTML = "";
    let cancelled = false;
    (async () => {
      try {
        await loadApplePaySdk();
        if (cancelled) return;
        if (!window.ApplePaySession || !window.ApplePaySession.canMakePayments?.()) return;
        const applepay = paypal.Applepay!();
        const cfg = await applepay.config();
        if (cancelled || !cfg.isEligible) return;

        const button = document.createElement("button");
        button.type = "button";
        button.className = "h-11 w-full rounded-xl bg-black text-white font-medium";
        button.style.cssText = "-webkit-appearance: -apple-pay-button; -apple-pay-button-type: pay; -apple-pay-button-style: black;";
        button.textContent = "Apple Pay";
        button.onclick = async () => {
          try {
            const orderId = await createOrderAndReturnId();
            const session = new window.ApplePaySession!(4, {
              countryCode: cfg.countryCode,
              currencyCode: "USD",
              merchantCapabilities: cfg.merchantCapabilities,
              supportedNetworks: cfg.supportedNetworks,
              total: { label: request.title ?? "NovaBoost Live", amount: amountStr },
            });
            session.onvalidatemerchant = async (event) => {
              try {
                const merchant = await applepay.validateMerchant({ validationUrl: event.validationURL, displayName: "NovaBoost Live" });
                session.completeMerchantValidation(merchant.merchantSession);
              } catch (err) {
                console.error("[applepay] validation failed", err);
                session.completeMerchantValidation({});
              }
            };
            session.onpaymentauthorized = async (event) => {
              try {
                await applepay.confirmOrder({
                  orderId,
                  token: event.payment.token,
                  billingContact: event.payment.billingContact,
                  shippingContact: event.payment.shippingContact,
                });
                session.completePayment(window.ApplePaySession!.STATUS_SUCCESS);
                await handleApproved(orderId);
              } catch (err) {
                session.completePayment(window.ApplePaySession!.STATUS_FAILURE);
                toast.error(err instanceof Error ? err.message : "Apple Pay failed");
              }
            };
            session.begin();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Apple Pay failed");
          }
        };
        container.appendChild(button);
      } catch (err) {
        console.warn("[paypal] Apple Pay init failed", err);
      }
    })();
    return () => {
      cancelled = true;
      container.innerHTML = "";
    };
  }, [open, sdkReady, request, amountStr, createOrderAndReturnId, handleApproved]);

  // Card Fields (Visa/Mastercard)
  useEffect(() => {
    if (!open || !sdkReady || !showCard || !request) return;
    const paypal = window.paypal;
    if (!paypal?.CardFields || !cardFormRef.current) return;
    const root = cardFormRef.current;
    root.innerHTML = `
      <div class="grid gap-2">
        <label class="text-xs uppercase tracking-wider text-muted-foreground">Имя на карте / Cardholder</label>
        <div id="paypal-card-name" class="rounded-lg border border-border/60 bg-background px-3 py-2"></div>
        <label class="text-xs uppercase tracking-wider text-muted-foreground">Номер карты / Card number</label>
        <div id="paypal-card-number" class="rounded-lg border border-border/60 bg-background px-3 py-2"></div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="text-xs uppercase tracking-wider text-muted-foreground">Срок / Expiry</label>
            <div id="paypal-card-expiry" class="rounded-lg border border-border/60 bg-background px-3 py-2"></div>
          </div>
          <div>
            <label class="text-xs uppercase tracking-wider text-muted-foreground">CVV</label>
            <div id="paypal-card-cvv" class="rounded-lg border border-border/60 bg-background px-3 py-2"></div>
          </div>
        </div>
      </div>
    `;

    const cardFields = paypal.CardFields!({
      style: { input: { "font-size": "15px", color: "#fff" }, ".invalid": { color: "#ef4444" } },
      createOrder: () => createOrderAndReturnId(),
      onApprove: async (data: { orderID: string }) => handleApproved(data.orderID),
      onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Card error"),
    });

    if (!cardFields.isEligible()) {
      root.innerHTML = '<div class="text-sm text-muted-foreground">Оплата картой недоступна для этой страны / Card payment is not available in this region.</div>';
      return;
    }

    void cardFields.NameField().render("#paypal-card-name");
    void cardFields.NumberField().render("#paypal-card-number");
    void cardFields.ExpiryField().render("#paypal-card-expiry");
    void cardFields.CVVField().render("#paypal-card-cvv");

    const submit = document.createElement("button");
    submit.type = "button";
    submit.className = "mt-3 w-full h-11 rounded-xl bg-gradient-blast text-blast-foreground font-bold";
    submit.textContent = `Оплатить $${amountStr}`;
    submit.onclick = async () => {
      try {
        setSubmitting(true);
        await cardFields.submit();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Card submit failed");
      } finally {
        setSubmitting(false);
      }
    };
    root.appendChild(submit);
  }, [open, sdkReady, showCard, request, amountStr, createOrderAndReturnId, handleApproved]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-border/60 bg-background/98 p-0 sm:rounded-3xl">
        <div className="rounded-t-3xl border-b border-border/50 bg-[radial-gradient(circle_at_top,rgba(255,133,32,0.16),transparent_58%),linear-gradient(180deg,rgba(19,13,44,0.95),rgba(14,11,34,0.95))] px-6 py-5 text-white">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white/80">
            <Wallet className="h-3.5 w-3.5" /> PayPal · {config?.environment === "live" ? "Live" : "Sandbox"}
          </div>
          <DialogHeader className="mt-4 text-left">
            <DialogTitle className="font-display text-2xl font-bold text-white">
              {request?.title ?? "Оплата / Checkout"}
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-white/75">
              {request?.subtitle ?? request?.description}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-3 text-3xl font-display font-bold text-white">${amountStr}</div>
        </div>

        <div className="space-y-4 px-6 py-6">
          {loadError && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{loadError}</div>
          )}

          {!sdkReady && !loadError && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="h-4 w-4 animate-spin" /> Загружаем PayPal…
            </div>
          )}

          {sdkReady && (
            <div className="space-y-3">
              <div ref={buttonsContainerRef} />
              <div ref={googlePayContainerRef} />
              <div ref={applePayContainerRef} />

              <button
                type="button"
                onClick={() => setShowCard((value) => !value)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-border/60 bg-background/50 px-4 py-2.5 text-sm font-medium hover:border-foreground/40"
              >
                <CreditCard className="h-4 w-4" />
                {showCard ? "Скрыть форму карты" : "Оплатить картой Visa / Mastercard"}
              </button>

              {showCard && <div ref={cardFormRef} className="space-y-2 pt-2" />}
            </div>
          )}

          {submitting && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Обрабатываем платёж…
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Платежи проходят через PayPal. Карта не сохраняется в NovaBoost Live.
          </div>

          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              Закрыть
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function usePayPalCheckout() {
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState<PayPalCheckoutRequest | null>(null);
  const [resolveFn, setResolveFn] = useState<((value: { captureId: string | null } | null) => void) | null>(null);

  const openCheckout = useCallback((next: PayPalCheckoutRequest) => {
    setRequest(next);
    setOpen(true);
    return new Promise<{ captureId: string | null } | null>((resolve) => {
      setResolveFn(() => resolve);
    });
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next && resolveFn) {
        resolveFn(null);
        setResolveFn(null);
      }
    },
    [resolveFn],
  );

  const handleSuccess = useCallback(
    (result: { captureId: string | null }) => {
      if (resolveFn) {
        resolveFn(result);
        setResolveFn(null);
      }
    },
    [resolveFn],
  );

  return {
    openCheckout,
    checkoutDialog: (
      <PayPalCheckoutDialog open={open} onOpenChange={handleOpenChange} request={request} onSuccess={handleSuccess} />
    ),
  };
}