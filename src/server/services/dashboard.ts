import "server-only";
import { db } from "@/server/db";
import { can, viaProject, type AuthContext } from "@/server/authz/context";
import { addDays, parseISODate, startOfMonth, startOfNextMonth, startOfWeek, todayISO, toISODate, type ISODate } from "@/lib/dates";
import { ACTIVE_PROJECT_STATUSES, OPEN_BUG_STATUSES, OPEN_TASK_STATUSES } from "@/lib/status";
import { loadProjectSummaries, num, type ProjectSummary } from "./metrics";
import { listActivity } from "./activity";
import { taskKey } from "./tasks";

export interface AttentionItem {
  severity: "critical" | "warning" | "info";
  title: string;
  detail?: string;
  href: string;
}

export interface DeadlineItem {
  date: ISODate;
  kind: "task" | "project" | "invoice" | "approval" | "phase";
  title: string;
  context: string;
  href: string;
}

export async function getDashboard(ctx: AuthContext) {
  const today = todayISO(ctx.timezone);
  const showFinance = can(ctx, "finance.view");
  const scope = viaProject(ctx);
  const monthStart = parseISODate(startOfMonth(today));
  const monthEnd = parseISODate(startOfNextMonth(today));
  const horizon = addDays(startOfWeek(today), 13); // end of next week

  const [projects, pendingTasks, approvals, criticalBugs, upcomingTasks, invoices, monthPayments, monthExpenses, activity] = await Promise.all([
    loadProjectSummaries(ctx, { status: { in: ACTIVE_PROJECT_STATUSES } }),
    db.task.count({ where: { ...scope, deletedAt: null, status: { in: OPEN_TASK_STATUSES } } }),
    db.approval.findMany({
      where: { ...scope, status: "PENDING" },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { dueDate: "asc" },
    }),
    db.bug.groupBy({
      by: ["projectId"],
      where: { ...scope, deletedAt: null, severity: "CRITICAL", status: { in: OPEN_BUG_STATUSES } },
      _count: true,
    }),
    db.task.findMany({
      where: { ...scope, deletedAt: null, status: { in: OPEN_TASK_STATUSES }, dueDate: { lte: parseISODate(horizon) } },
      select: { id: true, number: true, title: true, dueDate: true, project: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
      take: 50,
    }),
    showFinance
      ? db.invoice.findMany({
          where: { ...scope, deletedAt: null, status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] } },
          select: { id: true, number: true, total: true, dueDate: true, projectId: true, project: { select: { name: true } }, payments: { select: { amount: true } } },
        })
      : Promise.resolve([]),
    showFinance
      ? db.payment.aggregate({ where: { workspaceId: ctx.workspaceId, invoice: { project: scope.project }, paidAt: { gte: monthStart, lt: monthEnd } }, _sum: { amount: true } })
      : Promise.resolve(null),
    showFinance
      ? db.expense.aggregate({ where: { ...scope, deletedAt: null, incurredOn: { gte: monthStart, lt: monthEnd } }, _sum: { amount: true } })
      : Promise.resolve(null),
    listActivity(ctx, { limit: 12 }),
  ]);

  // ── KPIs ──
  const openInvoices = invoices.map((i) => {
    const paid = i.payments.reduce((s, p) => s + num(p.amount), 0);
    const due = toISODate(i.dueDate)!;
    return { ...i, outstanding: num(i.total) - paid, due, overdueDays: due < today ? Math.round((parseISODate(today).getTime() - i.dueDate.getTime()) / 86_400_000) : 0 };
  });
  const revenue = num(monthPayments?._sum.amount);
  const expenses = num(monthExpenses?._sum.amount);
  const kpis = {
    activeProjects: projects.length,
    pendingTasks,
    pendingApprovals: approvals.length,
    outstanding: showFinance ? openInvoices.reduce((s, i) => s + i.outstanding, 0) : null,
    overdue: showFinance ? openInvoices.filter((i) => i.overdueDays > 0).reduce((s, i) => s + i.outstanding, 0) : null,
    monthRevenue: showFinance ? revenue : null,
    monthExpenses: showFinance ? expenses : null,
    monthProfit: showFinance ? revenue - expenses : null,
  };

  // ── Needs attention (ranked) ──
  const attention: AttentionItem[] = [];
  for (const inv of openInvoices.filter((i) => i.overdueDays > 0).sort((a, b) => b.overdueDays - a.overdueDays)) {
    attention.push({
      severity: inv.overdueDays > 30 ? "critical" : "warning",
      title: `Invoice ${inv.number} overdue by ${inv.overdueDays} day${inv.overdueDays === 1 ? "" : "s"}`,
      detail: inv.project.name,
      href: `/projects/${inv.projectId}`,
    });
  }
  for (const b of criticalBugs) {
    const p = projects.find((x) => x.id === b.projectId);
    if (!p) continue;
    attention.push({ severity: "critical", title: `${b._count} critical bug${b._count === 1 ? "" : "s"} unresolved`, detail: p.name, href: `/projects/${p.id}/bugs` });
  }
  for (const p of projects) {
    if (p.blockedTasks > 0) {
      attention.push({ severity: p.blockedTasks >= 3 ? "critical" : "warning", title: `${p.blockedTasks} blocked task${p.blockedTasks === 1 ? "" : "s"}`, detail: p.name, href: `/projects/${p.id}/tasks?status=BLOCKED` });
    }
    if (p.overdueTasks > 0) {
      attention.push({ severity: p.overdueTasks >= 3 ? "critical" : "warning", title: `${p.overdueTasks} overdue task${p.overdueTasks === 1 ? "" : "s"}`, detail: p.name, href: `/tasks?projectId=${p.id}&due=overdue` });
    }
    const earned = (p.estimatedHours * p.progress) / 100;
    if (earned >= 8 && p.actualHours > earned * 1.1) {
      attention.push({
        severity: p.actualHours > earned * 1.25 ? "critical" : "warning",
        title: `Project is ${Math.round((p.actualHours / earned - 1) * 100)}% over estimated hours`,
        detail: p.name,
        href: `/projects/${p.id}`,
      });
    }
    if (p.dueDate && p.daysRemaining !== null && p.daysRemaining >= 0 && p.daysRemaining <= 7 && p.progress < 85) {
      attention.push({ severity: "warning", title: `Deadline in ${p.daysRemaining} day${p.daysRemaining === 1 ? "" : "s"} at ${Math.round(p.progress)}%`, detail: p.name, href: `/projects/${p.id}` });
    }
  }
  for (const a of approvals) {
    const due = toISODate(a.dueDate);
    const overdue = due !== null && due < today;
    attention.push({ severity: overdue ? "warning" : "info", title: `Client approval ${overdue ? "overdue" : "pending"} for ${a.title}`, detail: a.project.name, href: `/projects/${a.project.id}/approvals` });
  }
  const rank = { critical: 0, warning: 1, info: 2 } as const;
  attention.sort((a, b) => rank[a.severity] - rank[b.severity]);

  // ── Deadlines ──
  const deadlines: DeadlineItem[] = [];
  for (const t of upcomingTasks) {
    deadlines.push({ date: toISODate(t.dueDate)!, kind: "task", title: `${taskKey(t.number)} ${t.title}`, context: t.project.name, href: `/tasks/${t.id}` });
  }
  for (const p of projects) {
    if (p.dueDate && p.dueDate <= horizon) deadlines.push({ date: p.dueDate, kind: "project", title: `${p.name} delivery`, context: p.client.name, href: `/projects/${p.id}` });
  }
  for (const i of openInvoices) {
    if (i.due >= today && i.due <= horizon) deadlines.push({ date: i.due, kind: "invoice", title: `${i.number} payment due`, context: i.project.name, href: `/projects/${i.projectId}` });
  }
  for (const a of approvals) {
    const due = toISODate(a.dueDate);
    if (due && due <= horizon) deadlines.push({ date: due, kind: "approval", title: `Approval: ${a.title}`, context: a.project.name, href: `/projects/${a.project.id}/approvals` });
  }
  deadlines.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return { today, kpis, projects: sortForDashboard(projects), attention, deadlines, activity, showFinance };
}

/** Critical first, then at risk, then by deadline. */
function sortForDashboard(projects: ProjectSummary[]): ProjectSummary[] {
  const order = { CRITICAL: 0, AT_RISK: 1, HEALTHY: 2 } as const;
  return [...projects].sort(
    (a, b) => order[a.health.level] - order[b.health.level] || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"),
  );
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;
