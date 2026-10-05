import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { pageContext, moneyFmt } from "@/server/page-context";
import { getDashboard } from "@/server/services/dashboard";
import { can } from "@/server/authz/context";
import { PageHeader, Panel } from "@/components/ui/panel";
import { Stat, StatGrid, EmptyState } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { ProjectTable } from "@/features/projects/project-table";
import { NeedsAttention } from "@/features/dashboard/attention";
import { Deadlines } from "@/features/dashboard/deadlines";
import { ActivityFeed } from "@/features/activity/activity-feed";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };

function greeting(tz: string) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: tz }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage() {
  const ctx = await pageContext();
  const d = await getDashboard(ctx);
  const fmt = moneyFmt(ctx);
  const k = d.kpis;
  const critical = d.attention.filter((a) => a.severity === "critical").length;

  return (
    <>
      <PageHeader
        title={`${greeting(ctx.timezone)}, ${ctx.userName.split(" ")[0]}`}
        description={`${formatDate(d.today, { year: true })} · ${d.attention.length === 0 ? "Everything is on track." : `${d.attention.length} item${d.attention.length === 1 ? "" : "s"} need attention${critical ? `, ${critical} critical` : ""}.`}`}
        actions={
          can(ctx, "project.create") && (
            <ButtonLink href="/projects/new" variant="primary">
              <Plus className="size-3.5" /> New project
            </ButtonLink>
          )
        }
      />

      <StatGrid className={d.showFinance ? "grid-cols-2 sm:grid-cols-4 xl:grid-cols-8" : "grid-cols-3"}>
        <Stat label="Active projects" value={k.activeProjects} href="/projects" />
        <Stat label="Pending tasks" value={k.pendingTasks} href="/tasks" />
        <Stat label="Pending approvals" value={k.pendingApprovals} tone={k.pendingApprovals ? "warn" : undefined} href="/approvals" />
        {d.showFinance && (
          <>
            <Stat label="Payments due" value={<Money value={k.outstanding} fmt={fmt} compact />} />
            <Stat label="Overdue" value={<Money value={k.overdue} fmt={fmt} compact />} tone={k.overdue ? "bad" : undefined} />
            <Stat label="Revenue (month)" value={<Money value={k.monthRevenue} fmt={fmt} compact />} sub="Payments received" />
            <Stat label="Expenses (month)" value={<Money value={k.monthExpenses} fmt={fmt} compact />} />
            <Stat label="Profit (month)" value={<Money value={k.monthProfit} fmt={fmt} compact />} tone={(k.monthProfit ?? 0) < 0 ? "bad" : "ok"} sub="Revenue − expenses" />
          </>
        )}
      </StatGrid>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel title="Active projects" description="Sorted by health, then deadline" actions={<ButtonLink href="/projects" size="xs" variant="ghost">View all</ButtonLink>}>
          {d.projects.length === 0 ? (
            <EmptyState
              title="No active projects yet."
              description="Projects you're delivering will appear here with live progress, health and payment status."
              action={can(ctx, "project.create") && <ButtonLink href="/projects/new" variant="primary">Create your first project</ButtonLink>}
            />
          ) : (
            <ProjectTable projects={d.projects} today={d.today} fmt={fmt} compact />
          )}
        </Panel>
        <Panel title="Needs attention" description={d.attention.length ? `${d.attention.length} open item${d.attention.length === 1 ? "" : "s"}` : undefined}>
          <NeedsAttention items={d.attention} />
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Upcoming deadlines" description="Tasks, deliveries, payments and approvals">
          <Deadlines items={d.deadlines} today={d.today} />
        </Panel>
        <Panel title="Recent activity">
          <ActivityFeed items={d.activity} />
        </Panel>
      </div>
    </>
  );
}
