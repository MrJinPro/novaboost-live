import { getLocalizedMoney, type CurrencyPreference, type SupportedCurrency } from "@/lib/currency";

type LocalizedPriceProps = {
  amount: number;
  preference: CurrencyPreference;
  baseCurrency?: SupportedCurrency;
  align?: "left" | "right";
  primaryClassName?: string;
  secondaryClassName?: string;
};

export function LocalizedPrice({
  amount,
  preference,
  baseCurrency = "RUB",
  align = "left",
  primaryClassName,
  secondaryClassName,
}: LocalizedPriceProps) {
  const money = getLocalizedMoney(amount, { baseCurrency, preference });

  return (
    <div className={align === "right" ? "text-right" : "text-left"}>
      <div className={primaryClassName}>{money.primary}</div>
      {money.secondary && <div className={secondaryClassName}>{money.secondary}</div>}
    </div>
  );
}