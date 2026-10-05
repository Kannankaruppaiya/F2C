import type { Metadata } from "next";
import Link from "@/components/ui/link";
import { Check, ChevronRight } from "lucide-react";
import { pageContext, load, moneyFmt } from "@/server/page-context";
import { getChangeRequest } from "@/server/services/change-requests";
import { listTeamMembers } from "@/server/services/projects";
import { listActivity } from "@/server/services/activity";
import { db } from "@/server/db";
import { DefinitionList, Panel } from "@/components/ui/panel";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { ProgressBar } from "@/components/ui/progress";
import { ActivityFeed } from "@/features/activity/activity-feed";
import { ChangeRequestActions, ImplementationTasksDialog } from "@/features/change-requests/cr-actions";
import { EditChangeRequestButton } from "@/features/change-requests/cr-form";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime, formatHours } from "@/lib/format";
import { CHANGE_REQUEST_STATUS, FEATURE_STATUS, PRIORITY, TASK_STATUS } from "@/lib/status";

export const metadata: Metadata = { title: "Change request" };

const STEPS = [
  { key: "DRAFT", label: "Draft" },
  { key: "UNDER_REVIEW", label: "Impact analysis" },
  { key: "PENDING_CLIENT_APPROVAL", label: "Client approval" },
  { key: "APPROVED", label: "Approved" },
  { key: "IMPLEMENTED", label: "Implemented" },
] as const;

export default async function ChangeRequestDetailPage({ params }: { params: Promise<{ changeRequestId: string }> }) {
  const { changeRequestId } = await params;
  const ctx = await pageContext();
  const cr = await load(() => getChangeRequest(ctx, changeRequestId));
  const isClient = ctx.role === "CLIENT";
  const fmt = moneyFmt(ctx);
  const [activity, phases, team] = await Promise.all([
    listActivity(ctx, { entity: { type: "change_request", id: cr.id }, limit: 50 }),
    cr.canCreateTasks ? db.phase.findMany({ where: { projectId: cr.project.id, deletedAt: null }, orderBy: { position: "asc" }, select: { id: true, name: true } }) : Promise.resolve([]),
    cr.canCreateTasks ? listTeamMembers(ctx) : Promise.resolve([]),
  ]);
  const ended = cr.status === "REJECTED" || cr.status === "CANCELLED";
  const stepIndex = STEPS.findIndex((s) => s.key === cr.status);

  return (
    <>
      <nav className="mb-2 flex flex-wrap items-center gap-1 text-xs text-ink-3" aria-label="Breadcrumb">
        <Link href="/change-requests" className="hover:text-ink">Change Requests</Link>
        <ChevronRight className="size-3" />
        <Link href={`/projects/${cr.project.id}/change-requests`} className="hover:text-ink">{cr.project.name}</Link>
      </nav>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-ink-3">{cr.key}</span>
            <h1 className="text-xl font-semibold tracking-tight">{cr.title}</h1>
            <StatusBadge defs={CHANGE_REQUEST_STATUS} value={cr.status} />
            <Badge tone={PRIORITY[cr.priority].tone}>{PRIORITY[cr.priority].label}</Badge>
          </div>
          <p className="mt-1 text-xs text-ink-3">
            Requested by {cr.requestedBy ?? "—"}{cr.requestedByClient ? " (client)" : ""} on {formatDate(cr.requestDate, { year: true })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {cr.canEdit && (
            <EditChangeRequestButton
              id={cr.id}
              values={{ title: cr.title, description: cr.description, originalScope: cr.originalScope, requestedChange: cr.requestedChange, impact: cr.impact, estimatedHours: cr.estimatedHours, additionalCost: cr.additionalCost, priority: cr.priority, requestedBy: cr.requestedBy }}
            />
          )}
          <ChangeRequestActions id={cr.id} crKey={cr.key} title={cr.title} actions={cr.actions} isClient={isClient} sendProblems={cr.sendProblems} cost={cr.additionalCost} hours={cr.estimatedHours} fmt={fmt} />
          {cr.canCreateTasks && phases.length > 0 && <ImplementationTasksDialog id={cr.id} crKey={cr.key} title={cr.title} estimatedHours={cr.estimatedHours} phases={phases} team={team} />}
        </div>
      </div>

      {/* Workflow position */}
      <ol className="mt-5 flex flex-wrap gap-y-2 rounded-lg border border-line bg-surface px-4 py-3 text-xs">
        {STEPS.map((s, i) => {
          const done = !ended && stepIndex > i;
          const current = !ended && stepIndex === i;
          return (
            <li key={s.key} className="flex items-center">
              <span className={cn("flex items-center gap-1.5", current ? "font-semibold text-accent" : done ? "text-ok" : "text-ink-4")}>
                <span className={cn("flex size-5 items-center justify-center rounded-full border text-2xs", current ? "border-accent bg-accent-soft" : done ? "border-ok bg-ok-soft" : "border-line")}>
                  {done ? <Check className="size-3" /> : i + 1}
                </span>
                {s.label}
              </span>
              {i < STEPS.length - 1 && <span className="mx-3 h-px w-6 bg-line" />}
            </li>
          );
        })}
        {ended && <li className="ml-auto"><StatusBadge defs={CHANGE_REQUEST_STATUS} value={cr.status} /></li>}
      </ol>

      {cr.status === "PENDING_CLIENT_APPROVAL" && isClient && (
        <div className="mt-4 rounded-md border border-warn/30 bg-warn-soft px-4 py-2.5 text-[13px]">
          <strong>Your decision is needed.</strong> Approving adds this change to the project for {formatHours(cr.estimatedHours)} and <Money value={cr.additionalCost} fmt={fmt} />.
        </div>
      )}
      {cr.sendProblems.length > 0 && cr.actions.includes("send") && (
        <div className="mt-4 rounded-md border border-line bg-subtle px-4 py-2.5 text-[13px] text-ink-2">
          Before sending to the client: {cr.sendProblems.join(" · ")}.
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <Panel title="Scope change">
            <div className="grid divide-y divide-line md:grid-cols-2 md:divide-x md:divide-y-0">
              <div className="px-4 py-3">
                <p className="text-2xs font-medium uppercase tracking-wide text-ink-4">Original scope</p>
                <p className="mt-1 whitespace-pre-line text-[13px] text-ink-2">{cr.originalScope ?? "—"}</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-2xs font-medium uppercase tracking-wide text-ink-4">Requested change</p>
                <p className="mt-1 whitespace-pre-line text-[13px] font-medium text-ink">{cr.requestedChange ?? "—"}</p>
              </div>
            </div>
            {cr.description && <p className="whitespace-pre-line border-t border-line px-4 py-3 text-[13px] text-ink-2">{cr.description}</p>}
          </Panel>

          {(cr.clientDecision || cr.cancellationReason || cr.resolvedAt) && (
            <div className={cn("rounded-lg border px-4 py-3 text-[13px]", cr.status === "REJECTED" ? "border-bad/30 bg-bad-soft" : cr.status === "CANCELLED" ? "border-line bg-subtle" : "border-ok/30 bg-ok-soft")}>
              <p className="font-semibold">
                {cr.status === "CANCELLED" ? "Cancelled" : cr.status === "REJECTED" ? "Rejected" : "Approved"}
                {cr.decidedBy && cr.status !== "CANCELLED" && ` by ${cr.decisionOnBehalf ? `the client (recorded by ${cr.decidedBy})` : cr.decidedBy}`}
                {cr.resolvedAt && <span className="font-normal text-ink-3"> · {formatDateTime(cr.resolvedAt)}</span>}
              </p>
              {cr.clientDecision && <p className="mt-1 whitespace-pre-line text-ink-2">“{cr.clientDecision}”</p>}
              {cr.cancellationReason && <p className="mt-1 text-ink-2">Reason: {cr.cancellationReason}</p>}
            </div>
          )}

          {!isClient && (cr.status === "APPROVED" || cr.status === "IMPLEMENTED" || cr.tasks.length > 0) && (
            <Panel title="Implementation" description={cr.tasks.length ? `${cr.tasks.filter((t) => t.status === "DONE").length} of ${cr.tasks.length} tasks done` : "No tasks yet"}>
              {cr.tasks.length === 0 ? (
                <EmptyState title="No implementation tasks yet." description="Tasks are only created when you confirm them with “Create implementation tasks”." className="py-8" />
              ) : (
                <ul className="divide-y divide-line">
                  {cr.tasks.map((t) => (
                    <li key={t.id}>
                      <Link href={`/tasks/${t.id}`} className="flex items-center gap-2 px-4 py-2 text-[13px] hover:bg-subtle">
                        <span className="font-mono text-2xs text-ink-4">{t.key}</span>
                        <span className="min-w-0 flex-1 truncate">{t.title}</span>
                        <span className="text-xs text-ink-3">{t.assignee ?? "Unassigned"}</span>
                        <span className="tabular text-xs text-ink-3">{formatHours(t.estimatedHours)}</span>
                        <StatusBadge defs={TASK_STATUS} value={t.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {cr.features.length > 0 && (
                <div className="border-t border-line px-4 py-2.5 text-xs text-ink-3">
                  Added to scope: {cr.features.map((f) => (
                    <span key={f.id} className="mr-2 inline-flex items-center gap-1">{f.name} <Badge tone={FEATURE_STATUS[f.status].tone}>{FEATURE_STATUS[f.status].label}</Badge></span>
                  ))}
                </div>
              )}
            </Panel>
          )}
          {isClient && cr.taskProgress !== null && (
            <Panel title="Implementation progress" bodyClassName="px-4 py-3">
              <div className="flex items-center gap-2"><ProgressBar value={cr.taskProgress * 100} /><span className="tabular text-xs">{Math.round(cr.taskProgress * 100)}%</span></div>
            </Panel>
          )}

          <Panel title="Activity">
            <ActivityFeed items={activity} showProject={false} empty="No activity yet." />
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Estimate" description={cr.status === "PENDING_CLIENT_APPROVAL" ? "Locked while the client reviews" : undefined}>
            <dl className="grid grid-cols-2 divide-x divide-line">
              <div className="px-4 py-3"><dt className="text-2xs uppercase tracking-wide text-ink-4">Additional hours</dt><dd className="tabular mt-0.5 text-lg font-semibold">{formatHours(cr.estimatedHours)}</dd></div>
              <div className="px-4 py-3"><dt className="text-2xs uppercase tracking-wide text-ink-4">Additional cost</dt><dd className="mt-0.5 text-lg font-semibold"><Money value={cr.additionalCost} fmt={fmt} /></dd></div>
            </dl>
            <div className="border-t border-line px-4 py-3">
              <p className="text-2xs font-medium uppercase tracking-wide text-ink-4">Impact</p>
              <p className="mt-1 whitespace-pre-line text-[13px] text-ink-2">{cr.impact ?? <span className="text-ink-4">Not analysed yet</span>}</p>
            </div>
            {cr.status === "APPROVED" || cr.status === "IMPLEMENTED" ? (
              <p className="border-t border-line bg-subtle px-4 py-2 text-xs text-ink-3">The additional cost will be invoiced from this record when finance (Phase 4) is enabled.</p>
            ) : null}
          </Panel>
          <Panel title="Details" bodyClassName="p-4">
            <DefinitionList
              single
              items={[
                { label: "Project", value: <Link className="hover:text-accent" href={`/projects/${cr.project.id}`}>{cr.project.name}</Link> },
                { label: "Sent to client", value: cr.submittedAt ? formatDateTime(cr.submittedAt) : "Not yet" },
                ...(cr.implementedAt ? [{ label: "Implemented", value: formatDateTime(cr.implementedAt) }] : []),
                ...(cr.documents.length ? [{ label: "Documents", value: <span className="flex flex-col">{cr.documents.map((d) => <Link key={d.id} className="hover:text-accent" href={`/documents/${d.id}`}>{d.name}</Link>)}</span> }] : []),
              ]}
            />
          </Panel>
        </div>
      </div>
    </>
  );
}
