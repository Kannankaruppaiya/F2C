import Link from "@/components/ui/link";
import { Badge } from "@/components/ui/badge";
import { AvatarName, EmptyState } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { formatHours, relativeDue } from "@/lib/format";
import { PRIORITY, TASK_STATUS, options } from "@/lib/status";
import type { TaskRow } from "@/server/services/tasks";
import { TaskStatusSelect } from "./task-status-select";
import { MessageSquare } from "lucide-react";

export const TASK_COLUMNS = [
  { key: "project", label: "Project / phase" },
  { key: "assignee", label: "Assignee" },
  { key: "priority", label: "Priority" },
  { key: "due", label: "Due" },
  { key: "hours", label: "Hours" },
];

export function TaskTable({ tasks, today, showProject = true, canEdit, id }: { tasks: TaskRow[]; today: string; showProject?: boolean; canEdit: boolean; id?: string }) {
  return (
    <Table id={id}>
      <THead>
        <TH>Task</TH>
        <TH>Status</TH>
        <TH data-col="project" className="hidden lg:table-cell">{showProject ? "Project / phase" : "Phase / feature"}</TH>
        <TH data-col="assignee" className="hidden md:table-cell">Assignee</TH>
        <TH data-col="priority" className="hidden sm:table-cell">Priority</TH>
        <TH data-col="due">Due</TH>
        <TH data-col="hours" className="hidden text-right xl:table-cell">Actual / est.</TH>
      </THead>
      <tbody>
        {tasks.map((t) => {
          const due = relativeDue(t.dueDate, today);
          const done = t.status === "DONE";
          return (
            <TR key={t.id}>
              <TD className="max-w-md">
                <Link href={`/tasks/${t.id}`} className={cn("block truncate font-medium hover:text-accent", done && "text-ink-3 line-through decoration-ink-4")}>{t.title}</Link>
                <div className="flex items-center gap-2 text-2xs text-ink-4">
                  <span className="font-mono">{t.key}</span>
                  {t.subtaskCount > 0 && <span>{t.subtaskCount} subtasks</span>}
                  {t.commentCount > 0 && <span className="inline-flex items-center gap-0.5"><MessageSquare className="size-3" />{t.commentCount}</span>}
                  {t.blockedReason && <span className="truncate text-bad" title={t.blockedReason}>{t.blockedReason}</span>}
                </div>
              </TD>
              <TD><TaskStatusSelect taskId={t.id} status={t.status} disabled={!canEdit} /></TD>
              <TD data-col="project" className="hidden max-w-56 lg:table-cell">
                {showProject ? (
                  <>
                    <Link href={`/projects/${t.project.id}`} className="block truncate text-ink-2 hover:text-accent">{t.project.name}</Link>
                    <span className="block truncate text-2xs text-ink-4">{t.phase.name}{t.feature ? ` · ${t.feature.name}` : ""}</span>
                  </>
                ) : (
                  <>
                    <span className="block truncate text-ink-2">{t.phase.name}</span>
                    {t.feature && <span className="block truncate text-2xs text-ink-4">{t.feature.name}</span>}
                  </>
                )}
              </TD>
              <TD data-col="assignee" className="hidden md:table-cell"><AvatarName name={t.assignee?.name} color={t.assignee?.avatarColor} /></TD>
              <TD data-col="priority" className="hidden sm:table-cell"><Badge tone={PRIORITY[t.priority].tone}>{PRIORITY[t.priority].label}</Badge></TD>
              <TD data-col="due" className={cn("tabular text-xs whitespace-nowrap", !done && due.overdue ? "font-medium text-bad" : !done && due.days !== null && due.days <= 1 ? "text-warn" : "text-ink-2")}>
                {t.dueDate ? (done ? t.dueDate.slice(5) : due.text) : <span className="text-ink-4">—</span>}
              </TD>
              <TD data-col="hours" className={cn("tabular hidden text-right text-xs xl:table-cell", t.estimatedHours > 0 && t.actualHours > t.estimatedHours ? "text-bad" : "text-ink-2")}>
                {formatHours(t.actualHours)} / {formatHours(t.estimatedHours)}
              </TD>
            </TR>
          );
        })}
      </tbody>
    </Table>
  );
}

export function TaskBoard({ tasks, today, showProject = true, canEdit }: { tasks: TaskRow[]; today: string; showProject?: boolean; canEdit: boolean }) {
  const cols = options(TASK_STATUS).filter((c) => c.value !== "BACKLOG" || tasks.some((t) => t.status === "BACKLOG"));
  return (
    <div className="flex gap-3 overflow-x-auto p-3 scrollbar-thin">
      {cols.map((c) => {
        const items = tasks.filter((t) => t.status === c.value);
        return (
          <div key={c.value} className="w-64 shrink-0 rounded-md bg-subtle p-2">
            <div className="mb-2 flex items-center justify-between px-1">
              <Badge tone={TASK_STATUS[c.value].tone}>{c.label}</Badge>
              <span className="tabular text-xs text-ink-4">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.length === 0 && <p className="py-4 text-center text-xs text-ink-4">No tasks</p>}
              {items.map((t) => {
                const due = relativeDue(t.dueDate, today);
                return (
                  <div key={t.id} className="rounded-md border border-line bg-surface p-2.5 shadow-xs">
                    <Link href={`/tasks/${t.id}`} className="block text-[13px] leading-snug font-medium hover:text-accent">{t.title}</Link>
                    <p className="mt-0.5 truncate text-2xs text-ink-4">
                      <span className="font-mono">{t.key}</span> · {showProject ? t.project.name : t.phase.name}
                    </p>
                    {t.blockedReason && <p className="mt-1 line-clamp-2 text-2xs text-bad">{t.blockedReason}</p>}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <TaskStatusSelect taskId={t.id} status={t.status} disabled={!canEdit} />
                      <span className="flex items-center gap-1.5">
                        {(t.priority === "HIGH" || t.priority === "CRITICAL") && <Badge tone={PRIORITY[t.priority].tone}>{PRIORITY[t.priority].label}</Badge>}
                        {t.dueDate && t.status !== "DONE" && <span className={cn("text-2xs", due.overdue ? "font-medium text-bad" : "text-ink-3")}>{due.text}</span>}
                      </span>
                    </div>
                    {t.assignee && <div className="mt-2 text-xs text-ink-2"><AvatarName name={t.assignee.name} color={t.assignee.avatarColor} /></div>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function NoTasks({ filtered, action }: { filtered: boolean; action?: React.ReactNode }) {
  return filtered ? <EmptyState title="No tasks match these filters." /> : <EmptyState title="No tasks yet." description="Break features into tasks with owners, estimates and due dates." action={action} />;
}
