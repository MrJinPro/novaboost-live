import { useCurrencyPreference, type CurrencyMode } from "@/lib/currency";

const OPTIONS: Array<{ value: CurrencyMode; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "USD", label: "USD" },
  { value: "RUB", label: "RUB" },
  { value: "KZT", label: "KZT" },
  { value: "MDL", label: "MDL" },
];

export function CurrencySwitcher({ inline = false }: { inline?: boolean }) {
  const currency = useCurrencyPreference();

  return (
    <div className={`${inline ? "inline-flex" : "hidden md:flex"} items-center gap-2 rounded-lg border border-border/50 bg-surface/40 px-2 py-1.5 text-xs text-muted-foreground`}>
      <span className="uppercase tracking-[0.18em]">FX</span>
      <select
        value={currency.mode}
        onChange={(event) => currency.setCurrencyMode(event.target.value as CurrencyMode)}
        className="bg-transparent text-foreground outline-none"
        aria-label="Выбор валюты"
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="hidden lg:inline text-[11px] text-muted-foreground/80">
        {currency.mode === "auto"
          ? `${currency.geoCurrency}${currency.countryCode ? ` ${currency.countryCode}` : ""}`
          : `geo ${currency.geoCurrency}${currency.countryCode ? ` ${currency.countryCode}` : ""}`}
      </span>
    </div>
  );
}
