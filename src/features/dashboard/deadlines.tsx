import Link from "next/link";
import { addDays, startOfWeek } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import type { DeadlineItem } from "@/server/services/dashboard";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import type { Tone } from "@/lib/status";

const KIND: Record<DeadlineItem["kind"], { label: string; tone: Tone }> = {
  task: { label: "Task", tone: "neutral" },
  project: { label: "Delivery", tone: "violet" },
  invoice: { label: "Payment", tone: "green" },
  approval: { label: "Approval", tone: "amber" },
  phase: { label: "Phase", tone: "blue" },
};

export function Deadlines({ items, today }: { items: DeadlineItem[]; today: string }) {
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(startOfWeek(today), 6);
  const nextWeekEnd = addDays(weekEnd, 7);
  const buckets: { label: string; items: DeadlineItem[]; tone?: "bad" }[] = [
    { label: "Overdue", items: items.filter((i) => i.date < today), tone: "bad" as const },
    { label: "Today", items: items.filter((i) => i.date === today) },
    { label: "Tomorrow", items: items.filter((i) => i.date === tomorrow) },
    { label: "This week", items: items.filter((i) => i.date > tomorrow && i.date <= weekEnd) },
    { label: "Next week", items: items.filter((i) => i.date > weekEnd && i.date <= nextWeekEnd && i.date > tomorrow) },
  ].filter((b) => b.items.length > 0);

  if (buckets.length === 0) return <EmptyState title="No deadlines in the next two weeks." className="py-8" />;
  return (
    <div className="divide-y divide-line">
      {buckets.map((b) => (
        <div key={b.label} className="px-4 py-2.5">
          <p className={`mb-1.5 text-2xs font-medium uppercase tracking-wide ${b.tone === "bad" ? "text-bad" : "text-ink-4"}`}>
            {b.label} <span className="tabular">· {b.items.length}</span>
          </p>
          <ul className="space-y-1">
            {b.items.slice(0, 8).map((i, idx) => (
              <li key={i.href + idx} className="flex items-center gap-2 text-[13px]">
                <span className="tabular w-12 shrink-0 text-xs text-ink-3">{formatDate(i.date)}</span>
                <Badge tone={KIND[i.kind].tone}>{KIND[i.kind].label}</Badge>
                <Link href={i.href} className="min-w-0 flex-1 truncate text-ink hover:text-accent" title={i.title}>
                  {i.title}
                </Link>
                <span className="hidden max-w-32 shrink-0 truncate text-xs text-ink-4 sm:block">{i.context}</span>
              </li>
            ))}
            {b.items.length > 8 && <li className="text-xs text-ink-4">+{b.items.length - 8} more</li>}
          </ul>
        </div>
      ))}
    </div>
  );
}
