import "server-only";
import type { Prisma, Priority, ProjectStatus, TaskStatus } from "@prisma/client";
import { db } from "@/server/db";
import { can, projectScope, type AuthContext } from "@/server/authz/context";
import { computeHealth, type HealthResult } from "@/server/domain/health";
import { computeFinancials, paymentState, type PaymentState, type ProjectFinancials } from "@/server/domain/finance";
import { currentPhase, phaseProgress, projectProgress, type ProgressPhase } from "@/server/domain/progress";
import { daysBetween, todayISO, toISODate, type ISODate } from "@/lib/dates";
import { OPEN_BUG_STATUSES, OPEN_TASK_STATUSES } from "@/lib/status";

export const num = (d: Prisma.Decimal | number | null | undefined): number => (d == null ? 0 : Number(d));

export interface PhaseMetrics {
  id: string;
  name: string;
  position: number;
  status: ProgressPhase["status"];
  progress: number;
  estimatedHours: number;
  actualHours: number;
  taskCount: number;
  openTaskCount: number;
}

export interface ProjectSummary {
  id: string;
  code: string;
  name: string;
  status: ProjectStatus;
  priority: Priority;
  client: { id: string; name: string; company: string | null };
  projectManager: string | null;
  startDate: ISODate | null;
  dueDate: ISODate | null;
  daysRemaining: number | null;
  updatedAt: string;
  progress: number;
  currentPhase: { id: string; name: string; position: number } | null;
  phases: PhaseMetrics[];
  health: HealthResult;
  openTasks: number;
  overdueTasks: number;
  blockedTasks: number;
  estimatedHours: number;
  actualHours: number;
  pendingApprovals: number;
  /** null when the caller lacks finance.view — financial data never reaches unauthorized clients. */
  financials: ProjectFinancials | null;
  paymentState: PaymentState | null;
}

/**
 * Loads projects visible to the caller and computes progress, health and financials
 * from live records in a fixed number of queries (no N+1).
 */
export async function loadProjectSummaries(ctx: AuthContext, where: Prisma.ProjectWhereInput = {}): Promise<ProjectSummary[]> {
  const today = todayISO(ctx.timezone);
  const projects = await db.project.findMany({
    where: { AND: [projectScope(ctx), where] },
    include: {
      client: { select: { id: true, name: true, company: true } },
      projectManager: { select: { name: true } },
    },
  });
  if (projects.length === 0) return [];
  const ids = projects.map((p) => p.id);
  const inProjects = { projectId: { in: ids } };
  const showFinance = can(ctx, "finance.view");

  const [phases, tasks, timeByUser, members, workspace, invoices, expenses, approvals, changeRequests, criticalBugs] = await Promise.all([
    db.phase.findMany({
      where: { ...inProjects, deletedAt: null },
      select: { id: true, projectId: true, name: true, position: true, status: true, estimatedHours: true },
    }),
    db.task.findMany({
      where: { ...inProjects, deletedAt: null },
      select: { projectId: true, phaseId: true, status: true, priority: true, estimatedHours: true, dueDate: true },
    }),
    db.timeEntry.groupBy({ by: ["projectId", "phaseId", "userId"], where: inProjects, _sum: { hours: true } }),
    db.workspaceMember.findMany({ where: { workspaceId: ctx.workspaceId }, select: { userId: true, hourlyCost: true } }),
    db.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId }, select: { defaultHourlyCost: true } }),
    db.invoice.findMany({
      where: { ...inProjects, deletedAt: null },
      select: { projectId: true, number: true, total: true, status: true, dueDate: true, payments: { select: { amount: true } } },
    }),
    db.expense.groupBy({ by: ["projectId", "category"], where: { ...inProjects, deletedAt: null }, _sum: { amount: true } }),
    db.approval.findMany({ where: { ...inProjects, status: "PENDING" }, select: { projectId: true, title: true, dueDate: true } }),
    db.changeRequest.findMany({
      where: { ...inProjects, deletedAt: null, status: { in: ["PENDING_CLIENT_APPROVAL", "APPROVED", "IMPLEMENTED"] } },
      select: { projectId: true, status: true, additionalCost: true },
    }),
    db.bug.groupBy({ by: ["projectId"], where: { ...inProjects, deletedAt: null, severity: "CRITICAL", status: { in: OPEN_BUG_STATUSES } }, _count: true }),
  ]);
  const criticalBugsBy = new Map(criticalBugs.map((b) => [b.projectId, b._count]));

  const defaultRate = num(workspace.defaultHourlyCost);
  const rateByUser = new Map(members.map((m) => [m.userId, m.hourlyCost == null ? defaultRate : num(m.hourlyCost)]));
  const group = <T extends { projectId: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const list = m.get(r.projectId);
      if (list) list.push(r);
      else m.set(r.projectId, [r]);
    }
    return m;
  };
  const phasesBy = group(phases);
  const tasksBy = group(tasks);
  const timeBy = group(timeByUser);
  const invoicesBy = group(invoices);
  const expensesBy = group(expenses);
  const approvalsBy = group(approvals);
  const crsBy = group(changeRequests);

  return projects.map((p) => {
    const pTasks = tasksBy.get(p.id) ?? [];
    const pTime = timeBy.get(p.id) ?? [];
    const pPhases = (phasesBy.get(p.id) ?? []).sort((a, b) => a.position - b.position);

    const progressPhases: ProgressPhase[] = pPhases.map((ph) => ({
      id: ph.id,
      position: ph.position,
      status: ph.status,
      estimatedHours: num(ph.estimatedHours),
      tasks: pTasks.filter((t) => t.phaseId === ph.id).map((t) => ({ status: t.status, estimatedHours: num(t.estimatedHours) })),
    }));
    const progress = projectProgress(progressPhases);
    const cur = currentPhase(pPhases);

    const phaseMetrics: PhaseMetrics[] = pPhases.map((ph, idx) => {
      const phTasks = pTasks.filter((t) => t.phaseId === ph.id);
      return {
        id: ph.id,
        name: ph.name,
        position: ph.position,
        status: ph.status,
        progress: phaseProgress(progressPhases[idx]!),
        estimatedHours: Math.max(num(ph.estimatedHours), sumBy(phTasks, (t) => num(t.estimatedHours))),
        actualHours: sumBy(pTime.filter((t) => t.phaseId === ph.id), (t) => num(t._sum.hours)),
        taskCount: phTasks.length,
        openTaskCount: phTasks.filter((t) => isOpen(t.status)).length,
      };
    });

    const open = pTasks.filter((t) => isOpen(t.status));
    const overdue = open.filter((t) => t.dueDate && toISODate(t.dueDate)! < today);
    const blocked = open.filter((t) => t.status === "BLOCKED").length;
    const estimatedHours = Math.max(
      sumBy(pPhases, (ph) => num(ph.estimatedHours)),
      sumBy(pTasks, (t) => num(t.estimatedHours)),
    );
    const actualHours = sumBy(pTime, (t) => num(t._sum.hours));
    const laborCost = sumBy(pTime, (t) => num(t._sum.hours) * (rateByUser.get(t.userId) ?? defaultRate));

    const pCrs = crsBy.get(p.id) ?? [];
    const financials = computeFinancials({
      today,
      contractValue: num(p.contractValue),
      approvedChangeRequestValue: sumBy(pCrs.filter((c) => c.status !== "PENDING_CLIENT_APPROVAL"), (c) => num(c.additionalCost)),
      invoices: (invoicesBy.get(p.id) ?? []).map((inv) => ({
        number: inv.number,
        total: num(inv.total),
        paid: sumBy(inv.payments, (x) => num(x.amount)),
        status: inv.status,
        dueDate: toISODate(inv.dueDate)!,
      })),
      expenses: (expensesBy.get(p.id) ?? []).map((e) => ({ category: e.category, amount: num(e._sum.amount) })),
      laborCost,
      estimatedHours,
      actualHours,
      hourlyCost: defaultRate,
    });

    const pApprovals = approvalsBy.get(p.id) ?? [];
    const health = computeHealth({
      today,
      status: p.status,
      startDate: toISODate(p.startDate),
      dueDate: toISODate(p.dueDate),
      progress,
      overdueTasks: overdue.map((t) => ({ priority: t.priority })),
      blockedTasks: blocked,
      estimatedHours,
      actualHours,
      overdueApprovals: pApprovals.filter((a) => a.dueDate && toISODate(a.dueDate)! < today).map((a) => ({ title: a.title })),
      pendingApprovals: pApprovals.map((a) => ({ title: a.title })),
      pendingChangeRequests: pCrs.filter((c) => c.status === "PENDING_CLIENT_APPROVAL").length,
      overdueInvoices: showFinance ? financials.overdueInvoices : [],
      openCriticalBugs: criticalBugsBy.get(p.id) ?? 0,
    });

    const dueDate = toISODate(p.dueDate);
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      status: p.status,
      priority: p.priority,
      client: p.client,
      projectManager: p.projectManager?.name ?? null,
      startDate: toISODate(p.startDate),
      dueDate,
      daysRemaining: dueDate ? daysBetween(today, dueDate) : null,
      updatedAt: p.updatedAt.toISOString(),
      progress,
      currentPhase: cur ? { id: cur.id, name: cur.name, position: cur.position } : null,
      phases: phaseMetrics,
      health,
      openTasks: open.length,
      overdueTasks: overdue.length,
      blockedTasks: blocked,
      estimatedHours,
      actualHours,
      pendingApprovals: pApprovals.length,
      financials: showFinance ? financials : null,
      paymentState: showFinance ? paymentState(financials) : null,
    };
  });
}

function isOpen(s: TaskStatus): boolean {
  return OPEN_TASK_STATUSES.includes(s);
}

function sumBy<T>(xs: T[], f: (x: T) => number): number {
  let s = 0;
  for (const x of xs) s += f(x);
  return s;
}
