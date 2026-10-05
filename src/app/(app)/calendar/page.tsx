import type { Metadata } from "next";
import Link from "@/components/ui/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { pageContext } from "@/server/page-context";
import { getCalendar, type CalendarKind } from "@/server/services/calendar";
import { PageHeader, Panel } from "@/components/ui/panel";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { addDays, parseISODate, startOfMonth, startOfNextMonth, startOfWeek, todayISO } from "@/lib/dates";

export const metadata: Metadata = { title: "Calendar" };

const KIND: Record<CalendarKind, { label: string; cls: string }> = {
  task: { label: "Task", cls: "border-l-ink-4" },
  project: { label: "Delivery", cls: "border-l-violet" },
  milestone: { label: "Milestone", cls: "border-l-ok" },
  invoice: { label: "Payment due", cls: "border-l-ok" },
  approval: { label: "Approval", cls: "border-l-warn" },
  deployment: { label: "Deployment", cls: "border-l-info" },
  meeting: { label: "Meeting", cls: "border-l-accent" },
};

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const ctx = await pageContext();
  const today = todayISO(ctx.timezone);
  const { month } = await searchParams;
  const first = /^\d{4}-\d{2}$/.test(month ?? "") ? `${month}-01` : startOfMonth(today);
  const next = startOfNextMonth(first);
  const prev = startOfMonth(addDays(first, -1));
  const gridStart = startOfWeek(first);
  const gridEnd = addDays(startOfWeek(addDays(next, -1)), 6);
  const items = await getCalendar(ctx, gridStart, gridEnd);
  const days: string[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);
  const title = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(parseISODate(first));

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Task deadlines, deliveries, milestones, payments, approvals, deployments and meetings in one place."
        actions={
          <div className="flex items-center gap-1">
            <Link href={`/calendar?month=${prev.slice(0, 7)}`} className={buttonClass("secondary", "sm")} aria-label="Previous month"><ChevronLeft className="size-4" /></Link>
            <Link href="/calendar" className={buttonClass("secondary", "sm")}>Today</Link>
            <Link href={`/calendar?month=${next.slice(0, 7)}`} className={buttonClass("secondary", "sm")} aria-label="Next month"><ChevronRight className="size-4" /></Link>
          </div>
        }
      />
      <Panel title={title} actions={<div className="hidden flex-wrap gap-3 text-2xs text-ink-3 lg:flex">{Object.values(KIND).filter((k, i, a) => a.findIndex((x) => x.label === k.label) === i).map((k) => <span key={k.label} className={cn("border-l-2 pl-1.5", k.cls)}>{k.label}</span>)}</div>}>
        <div className="grid grid-cols-7 border-b border-line text-2xs font-medium uppercase tracking-wide text-ink-4">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="px-2 py-1.5">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const inMonth = d >= first && d < next;
            const dayItems = items.filter((i) => i.date === d);
            return (
              <div key={d} className={cn("min-h-24 border-r border-b border-line p-1 last:border-r-0 sm:min-h-28 [&:nth-child(7n)]:border-r-0", !inMonth && "bg-subtle/60")}>
                <div className={cn("mb-1 flex size-6 items-center justify-center rounded-full text-xs", d === today ? "bg-accent font-semibold text-white" : inMonth ? "text-ink-2" : "text-ink-4")}>{Number(d.slice(8))}</div>
                <ul className="space-y-0.5">
                  {dayItems.slice(0, 4).map((i, idx) => (
                    <li key={idx}>
                      <Link href={i.href} title={`${KIND[i.kind].label}: ${i.title}${i.project ? ` · ${i.project}` : ""}`} className={cn("block truncate rounded-sm border-l-2 bg-surface px-1 py-px text-2xs text-ink-2 hover:bg-subtle", KIND[i.kind].cls, d < today && i.kind === "task" && "text-bad")}>
                        {i.title}
                      </Link>
                    </li>
                  ))}
                  {dayItems.length > 4 && <li className="px-1 text-2xs text-ink-4">+{dayItems.length - 4} more</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </Panel>
    </>
  );
}
