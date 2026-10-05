import { daysBetween, parseISODate, type ISODate } from "./dates";

export interface MoneyFormat {
  currency: string;
  locale: string;
}

export const DEFAULT_MONEY: MoneyFormat = { currency: "INR", locale: "en-IN" };

export function formatMoney(value: number, fmt: MoneyFormat = DEFAULT_MONEY): string {
  return new Intl.NumberFormat(fmt.locale, {
    style: "currency",
    currency: fmt.currency,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

/** ₹25K, ₹1.2L style compact amounts for dense tables. */
export function formatMoneyCompact(value: number, fmt: MoneyFormat = DEFAULT_MONEY): string {
  if (Math.abs(value) < 1000) return formatMoney(value, fmt);
  return new Intl.NumberFormat(fmt.locale === "en-IN" ? "en-US" : fmt.locale, {
    style: "currency",
    currency: fmt.currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatHours(h: number): string {
  const rounded = Math.round(h * 10) / 10;
  return `${rounded}h`;
}

export function formatPercent(p: number): string {
  return `${Math.round(p)}%`;
}

const shortDate = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
const longDate = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

export function formatDate(d: ISODate | null | undefined, opts: { year?: boolean } = {}): string {
  if (!d) return "—";
  const date = parseISODate(d);
  return (opts.year ? longDate : shortDate).format(date);
}

export function formatDateTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

/** "in 3 days", "today", "5 days overdue". */
export function relativeDue(due: ISODate | null | undefined, today: ISODate): { text: string; overdue: boolean; days: number | null } {
  if (!due) return { text: "No date", overdue: false, days: null };
  const days = daysBetween(today, due);
  if (days === 0) return { text: "Today", overdue: false, days };
  if (days === 1) return { text: "Tomorrow", overdue: false, days };
  if (days > 1) return { text: `in ${days} days`, overdue: false, days };
  if (days === -1) return { text: "1 day overdue", overdue: true, days };
  return { text: `${-days} days overdue`, overdue: true, days };
}

export function timeAgo(d: Date | string, now: Date = new Date()): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const s = Math.round((now.getTime() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return formatDateTime(date);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
