import Link from "next/link";
import { AlertOctagon, AlertTriangle, CheckCircle2 } from "lucide-react";
import { pageContext, load, moneyFmt } from "@/server/page-context";
import { getProject } from "@/server/services/projects";
import { listTasks } from "@/server/services/tasks";
import { listActivity } from "@/server/services/activity";
import { listApprovals, listChangeRequests } from "@/server/services/records";
import { Panel } from "@/components/ui/panel";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress";
import { AvatarName, EmptyState } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { ActivityFeed } from "@/features/activity/activity-feed";
import { cn } from "@/lib/cn";
import { formatDate, formatHours, formatPercent, relativeDue } from "@/lib/format";
import { APPROVAL_STATUS, CHANGE_REQUEST_STATUS, PHASE_STATUS, PRIORITY, PRIORITY_RANK, TASK_STATUS } from "@/lib/status";
import { todayISO } from "@/lib/dates";

export default async function ProjectOverviewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ctx = await pageContext();
  const { project, summary: s } = await load(() => getProject(ctx, projectId));
  const [openTasks, approvals, crs, activity] = await Promise.all([
    listTasks(ctx, { projectId, open: "1" }),
    listApprovals(ctx, { projectId }),
    listChangeRequests(ctx, { projectId }),
    listActivity(ctx, { projectId, limit: 8 }),
  ]);
  const today = todayISO(ctx.timezone);
  const fmt = moneyFmt(ctx);
  const f = s.financials;

  const blocked = openTasks.filter((t) => t.status === "BLOCKED");
  const overdue = openTasks.filter((t) => t.dueDate && t.dueDate < today && t.status !== "BLOCKED");
  // "Next up": unblocked open work, most urgent first.
  const nextUp = openTasks
    .filter((t) => t.status !== "BLOCKED")
    .sort((a, b) => {
      const ad = a.dueDate ?? "9999";
      const bd = b.dueDate ?? "9999";
      return ad !== bd ? (ad < bd ? -1 : 1) : PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
    })
    .slice(0, 6);
  const pendingApprovals = approvals.filter((a) => a.status === "PENDING");
  const lastApproved = approvals.find((a) => a.status === "APPROVED");

  const earned = (s.estimatedHours * s.progress) / 100;
  const variance = s.actualHours - earned;
  const overrun = earned > 0 ? variance / earned : 0;

  const healthIcon = { HEALTHY: <CheckCircle2 className="size-4 text-ok" />, AT_RISK: <AlertTriangle className="size-4 text-warn" />, CRITICAL: <AlertOctagon className="size-4 text-bad" /> }[s.health.level];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-5">
        <Panel>
          <div className={cn("flex gap-3 px-4 py-3", s.health.level === "CRITICAL" ? "bg-bad-soft/60" : s.health.level === "AT_RISK" ? "bg-warn-soft/60" : "bg-ok-soft/40")}>
            <span className="mt-0.5">{healthIcon}</span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold">{s.health.level === "HEALTHY" ? "Healthy" : s.health.level === "AT_RISK" ? "At risk" : "Critical"}</p>
              {s.health.reasons.length === 0 ? (
                <p className="text-xs text-ink-2">No delivery, effort, approval or payment risks detected.</p>
              ) : (
                <ul className="mt-0.5 space-y-0.5 text-xs text-ink-2">
                  {s.health.reasons.map((r) => (
                    <li key={r.message} className="flex gap-1.5">
                      <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", r.severity === "CRITICAL" ? "bg-bad" : "bg-warn")} />
                      {r.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Panel>

        <Panel title="What we're building" actions={<Link href={`/projects/${project.id}/scope`} className="text-xs text-accent hover:underline">Full scope</Link>} bodyClassName="px-4 py-3">
          <p className="text-[13px] leading-relaxed text-ink-2">{project.description ?? <span className="text-ink-4">No description yet.</span>}</p>
        </Panel>

        <Panel title="Phases" description={s.currentPhase ? `Currently in ${s.currentPhase.name}` : undefined} actions={<Link href={`/projects/${project.id}/phases`} className="text-xs text-accent hover:underline">Manage</Link>}>
          {s.phases.length === 0 ? (
            <EmptyState title="No phases defined." description="Break the project into phases to track progress and milestones." />
          ) : (
            <ol className="divide-y divide-line">
              {s.phases.map((p, i) => (
                <li key={p.id} className={cn("grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2", s.currentPhase?.id === p.id && "bg-accent-soft/40")}>
                  <span className="tabular text-xs text-ink-4">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium">{p.name}</span>
                      <StatusBadge defs={PHASE_STATUS} value={p.status} />
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <ProgressBar value={p.progress} className="max-w-48" />
                      <span className="tabular text-2xs text-ink-3">{Math.round(p.progress)}%</span>
                    </div>
                  </div>
                  <span className="tabular hidden text-right text-xs text-ink-3 sm:block">
                    {formatHours(p.actualHours)} / {formatHours(p.estimatedHours)}
                    <span className="block text-2xs text-ink-4">{p.openTaskCount} open of {p.taskCount}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="Blocked & overdue" description={`${blocked.length} blocked · ${overdue.length} overdue`}>
            {blocked.length + overdue.length === 0 ? (
              <EmptyState title="Nothing blocked or overdue." className="py-8" />
            ) : (
              <ul className="divide-y divide-line">
                {[...blocked, ...overdue].slice(0, 8).map((t) => (
                  <li key={t.id} className="px-4 py-2.5">
                    <Link href={`/tasks/${t.id}`} className="flex items-center gap-2 text-[13px] hover:text-accent">
                      <span className="font-mono text-2xs text-ink-4">{t.key}</span>
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      {t.status === "BLOCKED" ? <Badge tone="red">Blocked</Badge> : <Badge tone="amber">{relativeDue(t.dueDate, today).text}</Badge>}
                    </Link>
                    {t.blockedReason && <p className="mt-0.5 pl-9 text-xs text-ink-3">{t.blockedReason}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Next up" actions={<Link href={`/projects/${project.id}/tasks`} className="text-xs text-accent hover:underline">All tasks</Link>}>
            {nextUp.length === 0 ? (
              <EmptyState title="No open tasks." className="py-8" />
            ) : (
              <ul className="divide-y divide-line">
                {nextUp.map((t) => {
                  const d = relativeDue(t.dueDate, today);
                  return (
                    <li key={t.id}>
                      <Link href={`/tasks/${t.id}`} className="flex items-center gap-2 px-4 py-2.5 text-[13px] hover:bg-subtle">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{t.title}</span>
                          <span className="flex items-center gap-2 text-2xs text-ink-4">
                            <span className="font-mono">{t.key}</span>
                            <StatusBadge defs={TASK_STATUS} value={t.status} />
                            {t.priority === "HIGH" || t.priority === "CRITICAL" ? <Badge tone={PRIORITY[t.priority].tone}>{PRIORITY[t.priority].label}</Badge> : null}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-xs">
                          <span className={cn("block", d.overdue ? "text-bad" : "text-ink-3")}>{t.dueDate ? d.text : ""}</span>
                          <span className="hidden sm:block"><AvatarName name={t.assignee?.name} color={t.assignee?.avatarColor} /></span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        <Panel title="Recent activity" actions={<Link href={`/projects/${project.id}/activity`} className="text-xs text-accent hover:underline">Full log</Link>}>
          <ActivityFeed items={activity} showProject={false} />
        </Panel>
      </div>

      <div className="space-y-5">
        <Panel title="Effort">
          <dl className="grid grid-cols-3 divide-x divide-line">
            <div className="px-4 py-3"><dt className="text-2xs uppercase tracking-wide text-ink-4">Estimated</dt><dd className="tabular mt-0.5 text-base font-semibold">{formatHours(s.estimatedHours)}</dd></div>
            <div className="px-4 py-3"><dt className="text-2xs uppercase tracking-wide text-ink-4">Actual</dt><dd className="tabular mt-0.5 text-base font-semibold">{formatHours(s.actualHours)}</dd></div>
            <div className="px-4 py-3">
              <dt className="text-2xs uppercase tracking-wide text-ink-4">Variance</dt>
              <dd className={cn("tabular mt-0.5 text-base font-semibold", overrun > 0.1 ? "text-bad" : overrun < -0.05 ? "text-ok" : "")}>{variance >= 0 ? "+" : ""}{formatHours(variance)}</dd>
            </div>
          </dl>
          <p className={cn("border-t border-line px-4 py-2 text-xs", overrun > 0.1 ? "bg-bad-soft text-bad" : "text-ink-3")}>
            {earned < 1
              ? "Variance compares hours spent with the estimate for work completed so far."
              : overrun > 0.1
                ? `Actual effort is ${formatPercent(overrun * 100)} above estimate for the work completed (${formatHours(earned)} earned).`
                : `Within estimate for work completed (${formatHours(earned)} earned of ${formatHours(s.estimatedHours)}).`}
          </p>
        </Panel>

        {f && (
          <Panel title="Money" description="From invoices, payments, expenses and tracked time">
            <dl className="divide-y divide-line text-[13px]">
              {[
                ["Contract value", f.contractValue, "", "Incl. approved change requests"],
                ["Received", f.paid, "text-ok"],
                ["Outstanding", f.outstanding, f.outstanding > 0 ? "text-warn" : ""],
                ["Overdue", f.overdue, f.overdue > 0 ? "text-bad font-semibold" : ""],
                ["Not yet invoiced", f.uninvoiced, "text-ink-3"],
              ].map(([label, value, cls, hint]) => (
                <div key={label as string} className="flex items-center justify-between px-4 py-2">
                  <dt className="text-ink-2">{label}{hint && <span className="block text-2xs text-ink-4">{hint}</span>}</dt>
                  <dd className={cn("tabular", cls as string)}><Money value={value as number} fmt={fmt} /></dd>
                </div>
              ))}
            </dl>
            <div className="border-t border-line bg-subtle/60">
              <dl className="divide-y divide-line text-[13px]">
                <div className="flex justify-between px-4 py-2"><dt className="text-ink-2">Labour cost <span className="text-2xs text-ink-4">({formatHours(s.actualHours)})</span></dt><dd className="tabular"><Money value={f.laborCost} fmt={fmt} /></dd></div>
                <div className="flex justify-between px-4 py-2"><dt className="text-ink-2">Expenses</dt><dd className="tabular"><Money value={f.expensesTotal} fmt={fmt} /></dd></div>
                <div className="flex justify-between px-4 py-2 font-medium"><dt>Actual cost</dt><dd className="tabular"><Money value={f.actualCost} fmt={fmt} /></dd></div>
                <div className="flex justify-between px-4 py-2 font-semibold">
                  <dt>Actual profit <span className="block text-2xs font-normal text-ink-4">Received − cost so far</span></dt>
                  <dd className={cn("tabular text-right", f.actualProfit < 0 ? "text-bad" : "text-ok")}>
                    <Money value={f.actualProfit} fmt={fmt} />
                    {f.marginPct !== null && <span className="block text-2xs font-normal">{formatPercent(f.marginPct)} margin</span>}
                  </dd>
                </div>
                <div className="flex justify-between px-4 py-2">
                  <dt className="text-ink-2">Expected profit <span className="block text-2xs text-ink-4">Contract − projected cost</span></dt>
                  <dd className={cn("tabular text-right", f.expectedProfit < 0 ? "text-bad" : "")}>
                    <Money value={f.expectedProfit} fmt={fmt} />
                    {f.expectedMarginPct !== null && <span className="block text-2xs text-ink-4">{formatPercent(f.expectedMarginPct)} margin</span>}
                  </dd>
                </div>
              </dl>
            </div>
          </Panel>
        )}

        <Panel title="Client approvals" actions={<Link href={`/projects/${project.id}/approvals`} className="text-xs text-accent hover:underline">All</Link>}>
          {pendingApprovals.length === 0 && !lastApproved ? (
            <EmptyState title="No approvals requested yet." className="py-6" />
          ) : (
            <ul className="divide-y divide-line">
              {pendingApprovals.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-[13px]">
                  <span className="min-w-0">
                    <span className="block truncate">{a.title}</span>
                    <span className={cn("text-2xs", a.dueDate && a.dueDate < today ? "text-bad" : "text-ink-4")}>Due {formatDate(a.dueDate)}</span>
                  </span>
                  <StatusBadge defs={APPROVAL_STATUS} value={a.status} />
                </li>
              ))}
              {lastApproved && (
                <li className="flex items-center justify-between gap-2 px-4 py-2.5 text-[13px]">
                  <span className="min-w-0">
                    <span className="block truncate">{lastApproved.title}</span>
                    <span className="text-2xs text-ink-4">Approved by {lastApproved.decidedBy ?? "client"}</span>
                  </span>
                  <StatusBadge defs={APPROVAL_STATUS} value="APPROVED" />
                </li>
              )}
            </ul>
          )}
        </Panel>

        <Panel title="Scope changes" actions={<Link href={`/projects/${project.id}/change-requests`} className="text-xs text-accent hover:underline">All</Link>}>
          {crs.length === 0 ? (
            <EmptyState title="No change requests." className="py-6" />
          ) : (
            <ul className="divide-y divide-line">
              {crs.slice(0, 4).map((c) => (
                <li key={c.id} className="px-4 py-2.5 text-[13px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate"><span className="font-mono text-2xs text-ink-4">{c.key}</span> {c.title}</span>
                    <StatusBadge defs={CHANGE_REQUEST_STATUS} value={c.status} />
                  </div>
                  <p className="tabular text-2xs text-ink-4">+{c.additionalHours}h · <Money value={c.additionalCost} fmt={fmt} /></p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
