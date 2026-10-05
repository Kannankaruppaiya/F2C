import Link from "next/link";
import { ChevronRight, ExternalLink, GitBranch, Pencil, Plus } from "lucide-react";
import { pageContext, load, moneyFmt } from "@/server/page-context";
import { can } from "@/server/authz/context";
import { getProject } from "@/server/services/projects";
import { projectTabCounts } from "@/server/services/records";
import { ButtonLink } from "@/components/ui/button";
import { HealthBadge, StatusBadge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress";
import { Money } from "@/components/ui/money";
import { NavTabs } from "@/components/ui/tabs";
import { ProjectStatusControl } from "@/features/projects/status-control";
import { formatDate, relativeDue } from "@/lib/format";
import { PROJECT_STATUS } from "@/lib/status";
import { todayISO } from "@/lib/dates";
import { cn } from "@/lib/cn";

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ctx = await pageContext();
  const { project, summary } = await load(() => getProject(ctx, projectId));
  const counts = await projectTabCounts(ctx, projectId);
  const today = todayISO(ctx.timezone);
  const fmt = moneyFmt(ctx);
  const base = `/projects/${project.id}`;
  const showFinance = can(ctx, "finance.view");
  const internal = ctx.role !== "CLIENT";
  const due = relativeDue(summary.dueDate, today);
  const delivered = project.status === "COMPLETED" || project.status === "MAINTENANCE";

  const tabs = [
    { href: base, label: "Overview", exact: true },
    { href: `${base}/scope`, label: "Scope" },
    { href: `${base}/phases`, label: "Phases", count: summary.phases.length },
    { href: `${base}/features`, label: "Features" },
    { href: `${base}/tasks`, label: "Tasks", count: counts.tasks },
    { href: `${base}/bugs`, label: "Bugs", count: counts.bugs },
    { href: `${base}/documents`, label: "Documents", count: counts.docs },
    { href: `${base}/approvals`, label: "Approvals", count: counts.approvals },
    { href: `${base}/change-requests`, label: "Change Requests", count: counts.crs },
    ...(showFinance ? [{ href: `${base}/payments`, label: "Payments" }] : []),
    ...(internal ? [{ href: `${base}/time`, label: "Time" }] : []),
    ...(showFinance ? [{ href: `${base}/expenses`, label: "Expenses" }] : []),
    { href: `${base}/deployment`, label: "Deployment" },
    { href: `${base}/handover`, label: "Handover" },
    { href: `${base}/maintenance`, label: "Maintenance" },
    { href: `${base}/activity`, label: "Activity" },
  ];

  return (
    <>
      <nav className="mb-2 flex items-center gap-1 text-xs text-ink-3" aria-label="Breadcrumb">
        <Link href="/projects" className="hover:text-ink">Projects</Link>
        <ChevronRight className="size-3" />
        <Link href={`/clients/${project.client.id}`} className="hover:text-ink">{project.client.name}</Link>
      </nav>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
            <span className="font-mono text-xs text-ink-4">{project.code}</span>
            <StatusBadge defs={PROJECT_STATUS} value={project.status} />
            <HealthBadge level={summary.health.level} title={summary.health.summary} />
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
            {project.projectType && <span>{project.projectType}</span>}
            {project.projectManager && <span>PM: {project.projectManager.name}</span>}
            {project.repositoryUrl && (
              <a href={project.repositoryUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:text-accent"><GitBranch className="size-3" /> Repository</a>
            )}
            {project.stagingUrl && <a href={project.stagingUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:text-accent"><ExternalLink className="size-3" /> Staging</a>}
            {project.productionUrl && <a href={project.productionUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:text-accent"><ExternalLink className="size-3" /> Production</a>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can(ctx, "project.edit") && <ProjectStatusControl projectId={project.id} status={project.status} />}
          {can(ctx, "project.edit") && <ButtonLink href={`${base}/edit`}><Pencil className="size-3.5" /> Edit</ButtonLink>}
          {can(ctx, "feature.edit") && <ButtonLink href={`${base}/features?new=1`}><Plus className="size-3.5" /> Feature</ButtonLink>}
          {can(ctx, "task.create") && <ButtonLink href={`/tasks/new?projectId=${project.id}`} variant="primary"><Plus className="size-3.5" /> Task</ButtonLink>}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
        <div className="bg-surface px-4 py-3">
          <p className="text-2xs font-medium uppercase tracking-wide text-ink-3">Progress</p>
          <div className="mt-1.5 flex items-center gap-2">
            <ProgressBar value={summary.progress} className="h-2" />
            <span className="tabular text-sm font-semibold">{Math.round(summary.progress)}%</span>
          </div>
        </div>
        <div className="bg-surface px-4 py-3">
          <p className="text-2xs font-medium uppercase tracking-wide text-ink-3">Current phase</p>
          <p className="mt-1 truncate text-sm font-semibold">{summary.currentPhase?.name ?? (summary.phases.length ? "All phases complete" : "No phases")}</p>
        </div>
        <div className="bg-surface px-4 py-3">
          <p className="text-2xs font-medium uppercase tracking-wide text-ink-3">Deadline</p>
          <p className="tabular mt-1 text-sm font-semibold">
            {formatDate(summary.dueDate, { year: true })}
            {summary.dueDate && !delivered && <span className={cn("ml-1.5 text-xs font-normal", due.overdue ? "text-bad" : (due.days ?? 99) <= 7 ? "text-warn" : "text-ink-3")}>{due.text}</span>}
          </p>
        </div>
        <div className="bg-surface px-4 py-3">
          <p className="text-2xs font-medium uppercase tracking-wide text-ink-3">{showFinance ? "Contract value" : "Open tasks"}</p>
          <p className="mt-1 text-sm font-semibold">{showFinance ? <Money value={summary.financials?.contractValue} fmt={fmt} /> : summary.openTasks}</p>
        </div>
      </div>

      <div className="mt-4 border-b border-line">
        <NavTabs items={tabs} />
      </div>
      <div className="mt-5">{children}</div>
    </>
  );
}
