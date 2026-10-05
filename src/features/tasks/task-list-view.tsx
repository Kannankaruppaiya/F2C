import Link from "next/link";
import { Columns3, List, Plus } from "lucide-react";
import { can, type AuthContext } from "@/server/authz/context";
import { listTasks } from "@/server/services/tasks";
import { listProjectOptions, listTeamMembers } from "@/server/services/projects";
import { taskListQuery } from "@/server/validation/schemas";
import { Panel } from "@/components/ui/panel";
import { ButtonLink } from "@/components/ui/button";
import { Segmented } from "@/components/ui/tabs";
import { FilterBar, FilterSelect, SearchInput } from "@/components/ui/filter-bar";
import { ColumnToggle } from "@/components/ui/column-toggle";
import { PRIORITY, TASK_STATUS, options } from "@/lib/status";
import { todayISO } from "@/lib/dates";
import { hrefWith } from "@/lib/url";
import { NoTasks, TASK_COLUMNS, TaskBoard, TaskTable } from "./task-list";

/** Shared task list (global /tasks and the project Tasks tab). Filters live in the URL. */
export async function TaskListView({ ctx, base, params, projectId }: { ctx: AuthContext; base: string; params: Record<string, string>; projectId?: string }) {
  const view = params.view === "board" ? "board" : "list";
  const parsed = taskListQuery.safeParse({ ...params, projectId: projectId ?? params.projectId });
  const query = parsed.success ? parsed.data : taskListQuery.parse({ projectId });
  // The board shows done tasks too so the Done column means something.
  const effective = view === "board" && !params.open ? { ...query, open: "0" as const } : query;
  const [tasks, projects, team] = await Promise.all([listTasks(ctx, effective), projectId ? Promise.resolve([]) : listProjectOptions(ctx), listTeamMembers(ctx)]);
  const today = todayISO(ctx.timezone);
  const canEdit = can(ctx, "task.edit");
  const filtered = !!(params.q || params.status || params.priority || params.assigneeId || params.due || params.featureId || params.phaseId || (!projectId && params.projectId));
  const newHref = projectId ? `/tasks/new?projectId=${projectId}` : "/tasks/new";

  return (
    <Panel
      title={
        <FilterBar action={base} hidden={{ view: params.view, featureId: params.featureId, phaseId: params.phaseId }}>
          <SearchInput defaultValue={params.q} placeholder="Search tasks or T-123" />
          {!projectId && projects.length > 0 && <FilterSelect name="projectId" label="All projects" defaultValue={params.projectId} options={projects.map((p) => ({ value: p.id, label: p.name }))} />}
          <FilterSelect name="status" label={view === "board" ? "All statuses" : "Open tasks"} defaultValue={params.status} options={options(TASK_STATUS)} />
          <FilterSelect name="assigneeId" label="Anyone" defaultValue={params.assigneeId} options={[{ value: "me", label: "Assigned to me" }, { value: "none", label: "Unassigned" }, ...team.map((m) => ({ value: m.id, label: m.name }))]} />
          <FilterSelect name="priority" label="Any priority" defaultValue={params.priority} options={options(PRIORITY)} />
          <FilterSelect name="due" label="Any due date" defaultValue={params.due} options={[{ value: "overdue", label: "Overdue" }, { value: "today", label: "Due today" }, { value: "week", label: "Due in 7 days" }]} />
          {view === "list" && !params.status && <FilterSelect name="open" label="Open only" defaultValue={params.open === "0" ? "0" : undefined} options={[{ value: "0", label: "Include done" }]} />}
          {filtered && <Link href={hrefWith(base, { view: params.view })} className="text-xs text-ink-3 hover:text-ink">Clear</Link>}
        </FilterBar>
      }
      actions={
        <>
          <Segmented
            items={[
              { href: hrefWith(base, params, { view: null }), label: "List", active: view === "list", icon: <List className="size-3.5" /> },
              { href: hrefWith(base, params, { view: "board" }), label: "Board", active: view === "board", icon: <Columns3 className="size-3.5" /> },
            ]}
          />
          {view === "list" && <ColumnToggle tableId="tasks-table" columns={TASK_COLUMNS} />}
          {can(ctx, "task.create") && <ButtonLink href={newHref} variant="primary"><Plus className="size-3.5" /> <span className="hidden sm:inline">Task</span></ButtonLink>}
        </>
      }
    >
      {(params.featureId || params.phaseId) && (
        <div className="flex items-center gap-2 border-b border-line bg-accent-soft/40 px-4 py-1.5 text-xs text-ink-2">
          Filtered to a {params.featureId ? "feature" : "phase"}.
          <Link href={hrefWith(base, params, { featureId: null, phaseId: null })} className="text-accent hover:underline">Show all</Link>
        </div>
      )}
      {tasks.length === 0 ? (
        <NoTasks filtered={filtered} action={can(ctx, "task.create") && <ButtonLink href={newHref} variant="primary">Create a task</ButtonLink>} />
      ) : view === "board" ? (
        <TaskBoard tasks={tasks} today={today} showProject={!projectId} canEdit={canEdit} />
      ) : (
        <TaskTable id="tasks-table" tasks={tasks} today={today} showProject={!projectId} canEdit={canEdit} />
      )}
    </Panel>
  );
}
