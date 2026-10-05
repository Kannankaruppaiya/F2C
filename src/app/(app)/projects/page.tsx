import type { Metadata } from "next";
import Link from "next/link";
import { CalendarRange, Columns3, LayoutGrid, List, Plus } from "lucide-react";
import { pageContext, moneyFmt } from "@/server/page-context";
import { can } from "@/server/authz/context";
import { listProjects } from "@/server/services/projects";
import { listClientOptions } from "@/server/services/clients";
import { projectListQuery } from "@/server/validation/schemas";
import { PageHeader, Panel } from "@/components/ui/panel";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Segmented } from "@/components/ui/tabs";
import { FilterBar, FilterSelect, SearchInput } from "@/components/ui/filter-bar";
import { ColumnToggle } from "@/components/ui/column-toggle";
import { SortTH, TH, THead } from "@/components/ui/table";
import { PROJECT_COLUMNS, ProjectTable } from "@/features/projects/project-table";
import { ProjectGrid, ProjectKanban, ProjectTimeline } from "@/features/projects/project-views";
import { HEALTH, PRIORITY, PROJECT_STATUS, options } from "@/lib/status";
import { todayISO } from "@/lib/dates";
import { flatParams, hrefWith, type SearchParams } from "@/lib/url";

export const metadata: Metadata = { title: "Projects" };

const VIEWS = ["table", "grid", "kanban", "timeline"] as const;

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await pageContext();
  const params = flatParams(await searchParams);
  const view = (VIEWS as readonly string[]).includes(params.view ?? "") ? params.view! : "table";
  const parsed = projectListQuery.safeParse(params);
  const query = parsed.success ? parsed.data : projectListQuery.parse({});
  // Kanban shows every status by default so columns are meaningful.
  const effective = view === "kanban" && !params.scope ? { ...query, scope: "all" as const } : query;
  const [projects, clients] = await Promise.all([listProjects(ctx, effective), listClientOptions(ctx)]);
  const fmt = moneyFmt(ctx);
  const today = todayISO(ctx.timezone);
  const showFinance = can(ctx, "finance.view");
  const filtered = !!(params.q || params.status || params.clientId || params.priority || params.health || params.payment);
  const hrefFor = (field: string, dir: "asc" | "desc") => hrefWith("/projects", params, { sort: field, dir });

  return (
    <>
      <PageHeader
        title="Projects"
        description={`${projects.length} ${effective.scope === "active" && !params.status ? "in delivery" : "projects"}`}
        actions={
          <>
            <Segmented
              items={[
                { href: hrefWith("/projects", params, { view: null }), label: "Table", active: view === "table", icon: <List className="size-3.5" /> },
                { href: hrefWith("/projects", params, { view: "grid" }), label: "Grid", active: view === "grid", icon: <LayoutGrid className="size-3.5" /> },
                { href: hrefWith("/projects", params, { view: "kanban" }), label: "Kanban", active: view === "kanban", icon: <Columns3 className="size-3.5" /> },
                { href: hrefWith("/projects", params, { view: "timeline" }), label: "Timeline", active: view === "timeline", icon: <CalendarRange className="size-3.5" /> },
              ]}
            />
            {can(ctx, "project.create") && <ButtonLink href="/projects/new" variant="primary"><Plus className="size-3.5" /> New project</ButtonLink>}
          </>
        }
      />
      <Panel
        title={
          <FilterBar action="/projects" hidden={{ view: params.view, sort: params.sort, dir: params.dir }}>
            <SearchInput defaultValue={params.q} placeholder="Search name, code, client" />
            <FilterSelect name="scope" label="In delivery" defaultValue={params.scope === "all" ? "all" : undefined} options={[{ value: "all", label: "All projects" }]} />
            <FilterSelect name="status" label="Any status" defaultValue={params.status} options={options(PROJECT_STATUS)} />
            {clients.length > 0 && <FilterSelect name="clientId" label="Any client" defaultValue={params.clientId} options={clients.map((c) => ({ value: c.id, label: c.name }))} />}
            <FilterSelect name="priority" label="Any priority" defaultValue={params.priority} options={options(PRIORITY)} />
            <FilterSelect name="health" label="Any health" defaultValue={params.health} options={options(HEALTH)} />
            {showFinance && (
              <FilterSelect name="payment" label="Any payment" defaultValue={params.payment} options={[{ value: "OVERDUE", label: "Overdue" }, { value: "DUE", label: "Payment due" }, { value: "PAID", label: "Paid" }, { value: "NOT_INVOICED", label: "Not invoiced" }]} />
            )}
            {filtered && <Link href={hrefWith("/projects", { view: params.view })} className="text-xs text-ink-3 hover:text-ink">Clear</Link>}
          </FilterBar>
        }
        actions={view === "table" && <ColumnToggle tableId="projects-table" columns={showFinance ? PROJECT_COLUMNS : PROJECT_COLUMNS.filter((c) => c.key !== "payment")} />}
      >
        {projects.length === 0 ? (
          filtered ? (
            <EmptyState title="No projects match these filters." action={<ButtonLink href="/projects">Clear filters</ButtonLink>} />
          ) : (
            <EmptyState
              title="No active projects yet."
              description="Create a project for a client to start tracking phases, features, tasks, approvals and payments."
              action={can(ctx, "project.create") && <ButtonLink href="/projects/new" variant="primary">Create your first project</ButtonLink>}
            />
          )
        ) : view === "grid" ? (
          <ProjectGrid projects={projects} today={today} fmt={fmt} />
        ) : view === "kanban" ? (
          <ProjectKanban projects={projects} today={today} />
        ) : view === "timeline" ? (
          <ProjectTimeline projects={projects} today={today} />
        ) : (
          <ProjectTable
            id="projects-table"
            projects={projects}
            today={today}
            fmt={fmt}
            showStatus
            header={
              <THead>
                <SortTH label="Project" field="name" current={query.sort} dir={query.dir} hrefFor={hrefFor} />
                <TH data-col="client" className="hidden md:table-cell">Client</TH>
                <TH data-col="status" className="hidden lg:table-cell">Status</TH>
                <TH data-col="phase" className="hidden lg:table-cell">Current phase</TH>
                <SortTH col="progress" label="Progress" field="progress" current={query.sort} dir={query.dir} hrefFor={hrefFor} />
                <SortTH col="deadline" label="Deadline" field="dueDate" current={query.sort} dir={query.dir} hrefFor={hrefFor} className="hidden sm:table-cell" />
                {showFinance && <TH data-col="payment" className="hidden md:table-cell">Payment</TH>}
                <TH data-col="health">Health</TH>
                <TH className="w-8"><span className="sr-only">Open</span></TH>
              </THead>
            }
          />
        )}
      </Panel>
    </>
  );
}
