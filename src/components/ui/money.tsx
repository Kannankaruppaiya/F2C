import { formatMoney, formatMoneyCompact, type MoneyFormat } from "@/lib/format";

export function Money({ value, fmt, compact }: { value: number | null | undefined; fmt?: MoneyFormat; compact?: boolean }) {
  if (value === null || value === undefined) return <span className="text-ink-4">—</span>;
  return <span className="tabular">{compact ? formatMoneyCompact(value, fmt) : formatMoney(value, fmt)}</span>;
}
