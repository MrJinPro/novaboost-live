import { useCurrencyPreference, type CurrencyMode } from "@/lib/currency";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
      <Select value={currency.mode} onValueChange={(value) => currency.setCurrencyMode(value as CurrencyMode)}>
        <SelectTrigger aria-label="Выбор валюты" className="h-7 w-21 border-0 bg-transparent px-1 py-0 text-xs text-foreground shadow-none focus:ring-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="border-border/60 bg-surface text-foreground">
          {OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value} className="text-xs text-foreground focus:bg-surface-2 focus:text-foreground">
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="hidden lg:inline text-[11px] text-muted-foreground/80">
        {currency.mode === "auto"
          ? `${currency.geoCurrency}${currency.countryCode ? ` ${currency.countryCode}` : ""}`
          : `geo ${currency.geoCurrency}${currency.countryCode ? ` ${currency.countryCode}` : ""}`}
      </span>
    </div>
  );
}
