import Link from "next/link";
import { HealthBadge, StatusBadge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { addDays, daysBetween, parseISODate, startOfMonth, startOfNextMonth } from "@/lib/dates";
import type { MoneyFormat } from "@/lib/format";
import { HEALTH, PROJECT_STATUS } from "@/lib/status";
import type { ProjectSummary } from "@/server/services/metrics";
import type { ProjectStatus } from "@prisma/client";
import { DeadlineCell, PaymentCell } from "./project-cells";

export function ProjectGrid({ projects, today, fmt }: { projects: ProjectSummary[]; today: string; fmt: MoneyFormat }) {
  return (
    <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
      {projects.map((p) => (
        <Link key={p.id} href={`/projects/${p.id}`} className="group rounded-md border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-subtle/40">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold group-hover:text-accent">{p.name}</p>
              <p className="truncate text-xs text-ink-3">{p.client.name}</p>
            </div>
            <HealthBadge level={p.health.level} />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <ProgressBar value={p.progress} />
            <span className="tabular text-xs text-ink-2">{Math.round(p.progress)}%</span>
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div className="min-w-0"><dt className="text-ink-4">Phase</dt><dd className="truncate text-ink-2">{p.currentPhase?.name ?? "—"}</dd></div>
            <div><dt className="text-ink-4">Deadline</dt><dd><DeadlineCell due={p.dueDate} today={today} done={p.status === "COMPLETED" || p.status === "MAINTENANCE"} /></dd></div>
            <div><dt className="text-ink-4">Payment</dt><dd><PaymentCell p={p} fmt={fmt} /></dd></div>
          </dl>
          <p className={cn("mt-3 line-clamp-2 border-t border-line pt-2 text-xs", p.health.level === "HEALTHY" ? "text-ink-3" : p.health.level === "CRITICAL" ? "text-bad" : "text-warn")}>{p.health.summary}</p>
        </Link>
      ))}
    </div>
  );
}

const KANBAN_COLUMNS: ProjectStatus[] = ["LEAD", "PLANNING", "ACTIVE", "ON_HOLD", "CLIENT_REVIEW", "COMPLETED", "MAINTENANCE"];

export function ProjectKanban({ projects, today }: { projects: ProjectSummary[]; today: string }) {
  const cols = KANBAN_COLUMNS.filter((s) => s !== "MAINTENANCE" || projects.some((p) => p.status === s));
  return (
    <div className="flex gap-3 overflow-x-auto p-3 scrollbar-thin">
      {cols.map((status) => {
        const items = projects.filter((p) => p.status === status);
        return (
          <div key={status} className="w-64 shrink-0 rounded-md bg-subtle p-2">
            <div className="mb-2 flex items-center justify-between px-1">
              <StatusBadge defs={PROJECT_STATUS} value={status} />
              <span className="tabular text-xs text-ink-4">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.length === 0 && <p className="px-1 py-4 text-center text-xs text-ink-4">None</p>}
              {items.map((p) => (
                <Link key={p.id} href={`/projects/${p.id}`} className="block rounded-md border border-line bg-surface p-3 shadow-xs hover:border-line-strong">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[13px] font-medium leading-snug">{p.name}</p>
                    <span className={cn("mt-1 size-2 shrink-0 rounded-full", { HEALTHY: "bg-ok", AT_RISK: "bg-warn", CRITICAL: "bg-bad" }[p.health.level])} title={HEALTH[p.health.level].label} />
                  </div>
                  <p className="text-xs text-ink-3">{p.client.name}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <ProgressBar value={p.progress} />
                    <span className="tabular text-2xs text-ink-3">{Math.round(p.progress)}%</span>
                  </div>
                  <div className="mt-2 text-xs"><DeadlineCell due={p.dueDate} today={today} done={status === "COMPLETED" || status === "MAINTENANCE"} /></div>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ProjectTimeline({ projects, today }: { projects: ProjectSummary[]; today: string }) {
  const dated = projects.filter((p) => p.startDate && p.dueDate);
  if (dated.length === 0) return <EmptyState title="No dated projects." description="Add start and delivery dates to see projects on the timeline." />;
  const min = startOfMonth(dated.reduce((m, p) => (p.startDate! < m ? p.startDate! : m), today));
  const maxDue = dated.reduce((m, p) => (p.dueDate! > m ? p.dueDate! : m), today);
  const max = addDays(startOfNextMonth(maxDue), -1);
  const span = Math.max(1, daysBetween(min, max));
  const pct = (d: string) => (daysBetween(min, d) / span) * 100;

  const months: string[] = [];
  for (let m = min; m <= max; m = startOfNextMonth(m)) months.push(m);
  const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });

  return (
    <div className="overflow-x-auto p-4 scrollbar-thin">
      <div className="min-w-[720px]">
        <div className="relative ml-48 h-6 border-b border-line text-2xs text-ink-4">
          {months.map((m) => (
            <span key={m} className="absolute top-0 border-l border-line pl-1" style={{ left: `${pct(m)}%` }}>
              {monthFmt.format(parseISODate(m))}
            </span>
          ))}
        </div>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 z-10 ml-48 w-[calc(100%-12rem)]">
            <div className="absolute inset-y-0 border-l-2 border-accent/60" style={{ left: `${pct(today)}%` }} title="Today" />
          </div>
          {dated.map((p) => {
            const left = pct(p.startDate!);
            const width = Math.max(1, pct(p.dueDate!) - left);
            const tone = { HEALTHY: "bg-ok/15 border-ok/40", AT_RISK: "bg-warn/15 border-warn/40", CRITICAL: "bg-bad/15 border-bad/40" }[p.health.level];
            const fill = { HEALTHY: "bg-ok/50", AT_RISK: "bg-warn/50", CRITICAL: "bg-bad/50" }[p.health.level];
            return (
              <div key={p.id} className="flex h-10 items-center border-b border-line last:border-0">
                <Link href={`/projects/${p.id}`} className="w-48 shrink-0 truncate pr-3 text-[13px] hover:text-accent" title={p.name}>
                  {p.name}
                  <span className="block truncate text-2xs text-ink-4">{p.client.name}</span>
                </Link>
                <div className="relative h-full flex-1">
                  <div className={cn("absolute top-1/2 h-5 -translate-y-1/2 overflow-hidden rounded border", tone)} style={{ left: `${left}%`, width: `${width}%` }} title={`${p.startDate} → ${p.dueDate} · ${Math.round(p.progress)}%`}>
                    <div className={cn("h-full", fill)} style={{ width: `${p.progress}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
