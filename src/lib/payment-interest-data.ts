import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export const PAYMENT_METHOD_OPTIONS = [
  {
    key: "card",
    title: "Банковская карта",
    subtitle: "Bank card",
  },
  {
    key: "sbp",
    title: "СБП",
    subtitle: "Fast bank transfer",
  },
  {
    key: "paypal",
    title: "PayPal",
    subtitle: "PayPal",
  },
  {
    key: "stars",
    title: "Telegram Stars",
    subtitle: "Telegram Stars",
  },
  {
    key: "crypto",
    title: "Крипта / USDT",
    subtitle: "Crypto / USDT",
  },
  {
    key: "other",
    title: "Другой вариант",
    subtitle: "Other method",
  },
] as const;

export type PaymentMethodKey = (typeof PAYMENT_METHOD_OPTIONS)[number]["key"];

type PaymentInterestSurveyInput = {
  userId?: string | null;
  entryPoint: string;
  triggerLabel: string;
  preferredMethods: PaymentMethodKey[];
  comment?: string;
  context?: Json;
};

const LOCAL_SURVEY_STORAGE_KEY = "nova-boost:payment-interest-surveys";

function persistSurveyLocally(payload: {
  user_id: string | null;
  entry_point: string;
  trigger_label: string;
  preferred_methods: string[];
  comment: string | null;
  context: Json;
}) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const rawValue = window.localStorage.getItem(LOCAL_SURVEY_STORAGE_KEY);
    const entries = rawValue ? (JSON.parse(rawValue) as unknown[]) : [];
    entries.push({
      ...payload,
      created_at: new Date().toISOString(),
    });
    window.localStorage.setItem(LOCAL_SURVEY_STORAGE_KEY, JSON.stringify(entries.slice(-50)));
  } catch {
    return;
  }
}

export async function savePaymentInterestSurvey(input: PaymentInterestSurveyInput) {
  const payload = {
    user_id: input.userId ?? null,
    entry_point: input.entryPoint,
    trigger_label: input.triggerLabel,
    preferred_methods: [...new Set(input.preferredMethods)],
    comment: input.comment?.trim() ? input.comment.trim() : null,
    context: input.context ?? {},
  };

  try {
    const { error } = await supabase.from("payment_interest_surveys").insert(payload);
    if (error) {
      persistSurveyLocally(payload);
      return { storedRemotely: false, error };
    }

    return { storedRemotely: true, error: null };
  } catch (error) {
    persistSurveyLocally(payload);
    return {
      storedRemotely: false,
      error: error instanceof Error ? error : new Error("Не удалось сохранить опрос по оплате"),
    };
  }
}