import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Pencil } from "lucide-react";
import { pageContext, load } from "@/server/page-context";
import { can } from "@/server/authz/context";
import { getRunningTimer, getTask } from "@/server/services/tasks";
import { listTeamMembers } from "@/server/services/projects";
import { listActivity } from "@/server/services/activity";
import { Panel, DefinitionList } from "@/components/ui/panel";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { AvatarName } from "@/components/ui/misc";
import { ActivityFeed } from "@/features/activity/activity-feed";
import { Comments, DeleteTaskButton, LogTimeForm, Subtasks, TaskQuickActions } from "@/features/tasks/task-detail-client";
import { cn } from "@/lib/cn";
import { formatDate, formatHours, relativeDue } from "@/lib/format";
import { PRIORITY, TASK_STATUS } from "@/lib/status";
import { todayISO } from "@/lib/dates";

export async function generateMetadata({ params }: { params: Promise<{ taskId: string }> }): Promise<Metadata> {
  const ctx = await pageContext();
  const t = await getTask(ctx, (await params).taskId).catch(() => null);
  return { title: t ? `${t.key} ${t.title}` : "Task" };
}

export default async function TaskDetailPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const ctx = await pageContext();
  const task = await load(() => getTask(ctx, taskId));
  const [team, timer, activity] = await Promise.all([listTeamMembers(ctx), getRunningTimer(ctx), listActivity(ctx, { entity: { type: "task", id: task.id }, limit: 20 })]);
  const today = todayISO(ctx.timezone);
  const due = relativeDue(task.dueDate, today);
  const canEdit = can(ctx, "task.edit");
  const canLog = can(ctx, "time.log");
  const variance = task.actualHours - task.estimatedHours;
  const doneSubs = task.subtasks.filter((s) => s.isDone).length;

  return (
    <>
      <nav className="mb-2 flex flex-wrap items-center gap-1 text-xs text-ink-3" aria-label="Breadcrumb">
        <Link href={`/projects/${task.project.id}`} className="hover:text-ink">{task.project.name}</Link>
        <ChevronRight className="size-3" />
        <Link href={`/projects/${task.project.id}/phases`} className="hover:text-ink">{task.phase.name}</Link>
        {task.feature && (
          <>
            <ChevronRight className="size-3" />
            <Link href={`/projects/${task.project.id}/features#${task.feature.id}`} className="hover:text-ink">{task.feature.name}</Link>
          </>
        )}
      </nav>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-ink-4">{task.key}</span>
            <StatusBadge defs={TASK_STATUS} value={task.status} />
            <Badge tone={PRIORITY[task.priority].tone}>{PRIORITY[task.priority].label}</Badge>
            {task.changeRequest && <Badge tone="violet">From CR-{String(task.changeRequest.number).padStart(3, "0")}</Badge>}
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">{task.title}</h1>
        </div>
        <div className="flex shrink-0 gap-2">
          {canEdit && <ButtonLink href={`/tasks/${task.id}/edit`}><Pencil className="size-3.5" /> Edit</ButtonLink>}
          {can(ctx, "task.delete") && <DeleteTaskButton taskId={task.id} />}
        </div>
      </div>

      <div className="mt-4">
        <TaskQuickActions
          taskId={task.id}
          status={task.status}
          priority={task.priority}
          assigneeId={task.assignee?.id ?? null}
          team={team}
          timerRunningHere={timer?.task?.id === task.id}
          canEdit={canEdit}
          canAssign={can(ctx, "task.assign")}
          canLogTime={canLog}
          selfId={ctx.userId}
        />
      </div>

      {task.status === "BLOCKED" && (
        <div className="mt-4 rounded-md border border-bad/20 bg-bad-soft px-4 py-2.5 text-[13px] text-bad">
          <span className="font-semibold">Blocked</span>{task.blockedReason ? `: ${task.blockedReason}` : " — add a reason so others know what's needed."}
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <Panel title="Description" bodyClassName="px-4 py-3">
            <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink-2">{task.description ?? <span className="text-ink-4">No description.</span>}</p>
          </Panel>
          {task.acceptanceCriteria && (
            <Panel title="Acceptance criteria" bodyClassName="px-4 py-3">
              <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink-2">{task.acceptanceCriteria}</p>
            </Panel>
          )}
          <Panel title="Subtasks" description={task.subtasks.length ? `${doneSubs} of ${task.subtasks.length} done` : undefined}>
            <Subtasks taskId={task.id} items={task.subtasks} canEdit={canEdit} />
          </Panel>
          <Panel title="Comments" description={task.comments.length ? `${task.comments.length}` : undefined}>
            <Comments taskId={task.id} comments={task.comments} canComment={canEdit} />
          </Panel>
          <Panel title="Activity">
            <ActivityFeed items={activity} showProject={false} empty="No activity on this task yet." />
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Details" bodyClassName="p-4">
            <DefinitionList
              single
              items={[
                { label: "Assignee", value: <AvatarName name={task.assignee?.name} color={task.assignee?.avatarColor} /> },
                { label: "Due", value: task.dueDate ? <span className={cn(task.status !== "DONE" && due.overdue && "font-medium text-bad")}>{formatDate(task.dueDate, { year: true })}{task.status !== "DONE" && ` · ${due.text}`}</span> : null },
                { label: "Created", value: `${formatDate(task.createdAt.slice(0, 10), { year: true })}${task.createdBy ? ` by ${task.createdBy}` : ""}` },
                ...(task.completedAt ? [{ label: "Completed", value: formatDate(task.completedAt.slice(0, 10), { year: true }) }] : []),
              ]}
            />
          </Panel>

          <Panel title="Time tracking">
            <dl className="grid grid-cols-3 divide-x divide-line border-b border-line text-center">
              <div className="py-2.5"><dt className="text-2xs uppercase text-ink-4">Estimated</dt><dd className="tabular text-sm font-semibold">{formatHours(task.estimatedHours)}</dd></div>
              <div className="py-2.5"><dt className="text-2xs uppercase text-ink-4">Actual</dt><dd className="tabular text-sm font-semibold">{formatHours(task.actualHours)}</dd></div>
              <div className="py-2.5">
                <dt className="text-2xs uppercase text-ink-4">Variance</dt>
                <dd className={cn("tabular text-sm font-semibold", task.estimatedHours > 0 && variance > 0 && "text-bad")}>{task.estimatedHours > 0 ? `${variance > 0 ? "+" : ""}${formatHours(variance)}` : "—"}</dd>
              </div>
            </dl>
            {task.estimatedHours > 0 && variance > 0 && <p className="border-b border-line bg-bad-soft px-4 py-1.5 text-xs text-bad">Actual effort exceeds the estimate.</p>}
            <ul className="max-h-60 divide-y divide-line overflow-y-auto">
              {task.timeEntries.length === 0 && <li className="px-4 py-3 text-xs text-ink-4">No time logged yet.</li>}
              {task.timeEntries.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 px-4 py-1.5 text-xs">
                  <span className="min-w-0">
                    <span className="text-ink-2">{e.user.name}</span>
                    <span className="text-ink-4"> · {formatDate(e.date)}</span>
                    {e.description && <span className="block truncate text-ink-4">{e.description}</span>}
                  </span>
                  <span className={cn("tabular shrink-0", e.running ? "text-ok" : "text-ink")}>{e.running ? "running" : formatHours(e.hours)}</span>
                </li>
              ))}
            </ul>
            {canLog && <LogTimeForm taskId={task.id} projectId={task.project.id} today={today} />}
          </Panel>

          {(task.dependsOn.length > 0 || task.blocks.length > 0) && (
            <Panel title="Dependencies" bodyClassName="p-4 space-y-3 text-[13px]">
              {task.dependsOn.length > 0 && (
                <div>
                  <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-ink-4">Waiting on</p>
                  <ul className="space-y-1">{task.dependsOn.map((d) => <li key={d.id} className="flex items-center gap-2"><StatusBadge defs={TASK_STATUS} value={d.status} /><Link href={`/tasks/${d.id}`} className="truncate hover:text-accent"><span className="font-mono text-2xs text-ink-4">{d.key}</span> {d.title}</Link></li>)}</ul>
                </div>
              )}
              {task.blocks.length > 0 && (
                <div>
                  <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-ink-4">Blocks</p>
                  <ul className="space-y-1">{task.blocks.map((d) => <li key={d.id} className="flex items-center gap-2"><StatusBadge defs={TASK_STATUS} value={d.status} /><Link href={`/tasks/${d.id}`} className="truncate hover:text-accent"><span className="font-mono text-2xs text-ink-4">{d.key}</span> {d.title}</Link></li>)}</ul>
                </div>
              )}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
