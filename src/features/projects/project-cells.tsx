import { Badge, HealthBadge } from "@/components/ui/badge";
import { formatDate, formatMoneyCompact, relativeDue, type MoneyFormat } from "@/lib/format";
import type { ProjectSummary } from "@/server/services/metrics";
import { cn } from "@/lib/cn";

export function PaymentCell({ p, fmt }: { p: ProjectSummary; fmt: MoneyFormat }) {
  const f = p.financials;
  if (!f || !p.paymentState) return <span className="text-ink-4">—</span>;
  switch (p.paymentState) {
    case "OVERDUE":
      return <Badge tone="red">{formatMoneyCompact(f.overdue, fmt)} overdue</Badge>;
    case "DUE":
      return <Badge tone="amber">{formatMoneyCompact(f.outstanding, fmt)} due</Badge>;
    case "PAID":
      return <Badge tone="green">Paid</Badge>;
    case "NOT_INVOICED":
      return <span className="text-xs text-ink-3">{formatMoneyCompact(f.uninvoiced, fmt)} to invoice</span>;
    default:
      return <span className="text-ink-4">—</span>;
  }
}

export function DeadlineCell({ due, today, done }: { due: string | null; today: string; done?: boolean }) {
  if (!due) return <span className="text-ink-4">—</span>;
  const r = relativeDue(due, today);
  return (
    <div className="leading-tight">
      <div className="tabular">{formatDate(due)}</div>
      {!done && <div className={cn("text-2xs", r.overdue ? "font-medium text-bad" : r.days !== null && r.days <= 7 ? "text-warn" : "text-ink-4")}>{r.text}</div>}
    </div>
  );
}

export function HealthCell({ p }: { p: ProjectSummary }) {
  return (
    <div className="group relative inline-flex">
      <HealthBadge level={p.health.level} />
      {p.health.reasons.length > 0 && (
        <div role="tooltip" className="pointer-events-none absolute right-0 bottom-full z-30 mb-1.5 hidden w-72 rounded-md bg-zinc-900 px-3 py-2 text-xs leading-relaxed text-white shadow-lg group-hover:block">
          <ul className="space-y-0.5">
            {p.health.reasons.slice(0, 5).map((r) => (
              <li key={r.message} className="flex gap-1.5">
                <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", r.severity === "CRITICAL" ? "bg-red-400" : "bg-amber-400")} />
                {r.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
