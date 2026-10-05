import "server-only";
import { db } from "@/server/db";
import { can, viaProject, type AuthContext } from "@/server/authz/context";
import { parseISODate, toISODate, type ISODate } from "@/lib/dates";
import { OPEN_TASK_STATUSES } from "@/lib/status";
import { taskKey } from "./tasks";

export type CalendarKind = "task" | "project" | "milestone" | "invoice" | "approval" | "deployment" | "meeting";

export interface CalendarItem {
  date: ISODate;
  kind: CalendarKind;
  title: string;
  href: string;
  project?: string;
}

/** Aggregates every dated obligation into one stream (calendar is a view, not a source of truth). */
export async function getCalendar(ctx: AuthContext, from: ISODate, to: ISODate): Promise<CalendarItem[]> {
  const range = { gte: parseISODate(from), lte: parseISODate(to) };
  const scope = viaProject(ctx);
  const finance = can(ctx, "finance.view");
  const [tasks, projects, milestones, invoices, approvals, deployments, events] = await Promise.all([
    db.task.findMany({ where: { ...scope, deletedAt: null, status: { in: OPEN_TASK_STATUSES }, dueDate: range }, select: { id: true, number: true, title: true, dueDate: true, project: { select: { name: true } } } }),
    db.project.findMany({ where: { ...scope.project, dueDate: range }, select: { id: true, name: true, dueDate: true } }),
    finance ? db.milestone.findMany({ where: { ...scope, dueDate: range }, select: { name: true, dueDate: true, projectId: true, project: { select: { name: true } } } }) : [],
    finance ? db.invoice.findMany({ where: { ...scope, deletedAt: null, dueDate: range, status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] } }, select: { number: true, dueDate: true, projectId: true, project: { select: { name: true } } } }) : [],
    db.approval.findMany({ where: { ...scope, status: "PENDING", dueDate: range }, select: { title: true, dueDate: true, projectId: true, project: { select: { name: true } } } }),
    db.deployment.findMany({ where: { ...scope, OR: [{ deployedAt: range }, { scheduledFor: range }] }, select: { version: true, environment: true, deployedAt: true, scheduledFor: true, projectId: true, project: { select: { name: true } } } }),
    db.calendarEvent.findMany({ where: { workspaceId: ctx.workspaceId, startsAt: range, OR: [{ projectId: null }, { project: scope.project }] }, select: { title: true, startsAt: true, projectId: true, project: { select: { name: true } } } }),
  ]);
  const items: CalendarItem[] = [
    ...tasks.map((t) => ({ date: toISODate(t.dueDate)!, kind: "task" as const, title: `${taskKey(t.number)} ${t.title}`, href: `/tasks/${t.id}`, project: t.project.name })),
    ...projects.map((p) => ({ date: toISODate(p.dueDate)!, kind: "project" as const, title: `${p.name} delivery`, href: `/projects/${p.id}` })),
    ...milestones.map((m) => ({ date: toISODate(m.dueDate)!, kind: "milestone" as const, title: m.name, href: `/projects/${m.projectId}/payments`, project: m.project.name })),
    ...invoices.map((i) => ({ date: toISODate(i.dueDate)!, kind: "invoice" as const, title: `${i.number} due`, href: `/projects/${i.projectId}/payments`, project: i.project.name })),
    ...approvals.map((a) => ({ date: toISODate(a.dueDate)!, kind: "approval" as const, title: `Approval: ${a.title}`, href: `/projects/${a.projectId}/approvals`, project: a.project.name })),
    ...deployments.map((d) => ({ date: toISODate(d.deployedAt ?? d.scheduledFor)!, kind: "deployment" as const, title: `${d.version} → ${d.environment.toLowerCase()}`, href: `/projects/${d.projectId}/deployment`, project: d.project.name })),
    ...events.map((e) => ({ date: e.startsAt.toISOString().slice(0, 10), kind: "meeting" as const, title: e.title, href: e.projectId ? `/projects/${e.projectId}` : "/calendar", project: e.project?.name })),
  ];
  return items.sort((a, b) => a.date.localeCompare(b.date));
}
