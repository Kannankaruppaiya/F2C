import "server-only";
// Read models for delivery & finance records. Creation/editing workflows for these modules
// arrive in later phases; these queries already enforce the same scoping and permissions.
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { can, requirePermission, viaProject, type AuthContext } from "@/server/authz/context";
import { forbidden } from "@/server/errors";
import { isInvoiceOverdue } from "@/server/domain/finance";
import { todayISO, toISODate } from "@/lib/dates";
import { num } from "./metrics";
import { taskKey } from "./tasks";

export interface RecordFilter {
  projectId?: string;
  clientId?: string;
}

function scoped(ctx: AuthContext, f: RecordFilter) {
  const base = viaProject(ctx);
  return {
    ...base,
    ...(f.projectId ? { projectId: f.projectId } : {}),
    ...(f.clientId ? { project: { ...base.project, clientId: f.clientId } } : {}),
  };
}

const projectRef = { select: { id: true, name: true } } as const;

export async function listInvoices(ctx: AuthContext, f: RecordFilter = {}) {
  requirePermission(ctx, "finance.view");
  const today = todayISO(ctx.timezone);
  const rows = await db.invoice.findMany({
    where: { ...scoped(ctx, f), deletedAt: null },
    include: { project: projectRef, client: { select: { id: true, name: true } }, milestone: { select: { name: true } }, payments: { select: { amount: true, paidAt: true } } },
    orderBy: { issueDate: "desc" },
  });
  return rows.map((i) => {
    const paid = i.payments.reduce((s, p) => s + num(p.amount), 0);
    const total = num(i.total);
    const due = toISODate(i.dueDate)!;
    return {
      id: i.id,
      number: i.number,
      project: i.project,
      client: i.client,
      milestone: i.milestone?.name ?? null,
      subtotal: num(i.subtotal),
      tax: num(i.taxAmount),
      total,
      paid,
      balance: total - paid,
      issueDate: toISODate(i.issueDate)!,
      dueDate: due,
      status: isInvoiceOverdue({ status: i.status, dueDate: due, total, paid }, today) ? ("OVERDUE" as const) : i.status,
    };
  });
}

export async function listPayments(ctx: AuthContext, f: RecordFilter = {}) {
  requirePermission(ctx, "finance.view");
  const invoiceWhere: Prisma.InvoiceWhereInput = { ...scoped(ctx, f), deletedAt: null };
  const rows = await db.payment.findMany({
    where: { workspaceId: ctx.workspaceId, invoice: invoiceWhere },
    include: { invoice: { select: { id: true, number: true, project: projectRef } } },
    orderBy: { paidAt: "desc" },
  });
  return rows.map((p) => ({
    id: p.id,
    amount: num(p.amount),
    paidAt: toISODate(p.paidAt)!,
    method: p.method,
    transactionId: p.transactionId,
    invoice: { id: p.invoice.id, number: p.invoice.number },
    project: p.invoice.project,
  }));
}

export async function listMilestones(ctx: AuthContext, projectId: string) {
  requirePermission(ctx, "finance.view");
  const rows = await db.milestone.findMany({
    where: { ...scoped(ctx, { projectId }) },
    include: { phase: { select: { name: true } }, invoices: { where: { deletedAt: null }, select: { number: true } } },
    orderBy: [{ dueDate: "asc" }, { position: "asc" }],
  });
  return rows.map((m) => ({ id: m.id, name: m.name, amount: num(m.amount), dueDate: toISODate(m.dueDate), status: m.status, phase: m.phase?.name ?? null, invoices: m.invoices.map((i) => i.number) }));
}

export async function listExpenses(ctx: AuthContext, f: RecordFilter = {}) {
  requirePermission(ctx, "finance.view");
  const rows = await db.expense.findMany({ where: { ...scoped(ctx, f), deletedAt: null }, include: { project: projectRef }, orderBy: { incurredOn: "desc" } });
  return rows.map((e) => ({ id: e.id, category: e.category, description: e.description, amount: num(e.amount), date: toISODate(e.incurredOn)!, vendor: e.vendor, project: e.project }));
}

export async function listApprovals(ctx: AuthContext, f: RecordFilter = {}) {
  requirePermission(ctx, "project.view");
  const rows = await db.approval.findMany({
    where: scoped(ctx, f),
    include: {
      project: projectRef,
      client: { select: { name: true } },
      feature: { select: { name: true } },
      documentVersion: { select: { version: true, document: { select: { name: true } } } },
    },
    orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
  });
  return rows.map((a) => ({
    id: a.id,
    key: `APR-${String(a.number).padStart(3, "0")}`,
    title: a.title,
    status: a.status,
    project: a.project,
    client: a.client.name,
    document: a.documentVersion ? `${a.documentVersion.document.name} v${a.documentVersion.version}` : null,
    feature: a.feature?.name ?? null,
    requestedAt: a.requestedAt.toISOString(),
    dueDate: toISODate(a.dueDate),
    decidedBy: a.decidedByName,
    decidedAt: a.decidedAt?.toISOString() ?? null,
    comments: a.comments,
  }));
}

export async function listChangeRequests(ctx: AuthContext, f: RecordFilter = {}) {
  requirePermission(ctx, "project.view");
  const rows = await db.changeRequest.findMany({
    where: { ...scoped(ctx, f), deletedAt: null },
    include: { project: projectRef, _count: { select: { tasks: true } } },
    orderBy: { number: "desc" },
  });
  return rows.map((c) => ({
    id: c.id,
    key: `CR-${String(c.number).padStart(3, "0")}`,
    title: c.title,
    status: c.status,
    priority: c.priority,
    project: c.project,
    requestedBy: c.requestedBy,
    requestDate: toISODate(c.requestDate)!,
    originalScope: c.originalScope,
    requestedChange: c.requestedChange,
    impact: c.impact,
    additionalHours: num(c.additionalHours),
    // A CR's price is quoted to the client, so it is not internal financial data.
    additionalCost: num(c.additionalCost),
    taskCount: c._count.tasks,
  }));
}

export async function listDocuments(ctx: AuthContext, f: RecordFilter = {}) {
  requirePermission(ctx, "project.view");
  const rows = await db.document.findMany({
    where: { ...scoped(ctx, f), deletedAt: null },
    include: {
      project: projectRef,
      phase: { select: { name: true } },
      versions: { orderBy: { version: "desc" }, include: { uploadedBy: { select: { name: true } } } },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return rows.map((d) => ({
    id: d.id,
    name: d.name,
    category: d.category,
    status: d.status,
    project: d.project,
    phase: d.phase?.name ?? null,
    currentVersion: d.versions[0]?.version ?? null,
    updatedAt: (d.versions[0]?.createdAt ?? d.updatedAt).toISOString(),
    versions: d.versions.map((v) => ({
      id: v.id,
      version: v.version,
      fileName: v.fileName,
      sizeBytes: v.sizeBytes,
      status: v.status,
      uploadedBy: v.uploadedBy?.name ?? null,
      createdAt: v.createdAt.toISOString(),
      changeNotes: v.changeNotes,
    })),
  }));
}

export async function listBugs(ctx: AuthContext, f: RecordFilter = {}) {
  requirePermission(ctx, "project.view");
  const rows = await db.bug.findMany({
    where: { ...scoped(ctx, f), deletedAt: null },
    include: { project: projectRef, feature: { select: { name: true } }, task: { select: { id: true, number: true } }, assignee: { select: { name: true, avatarColor: true } } },
    orderBy: [{ status: "asc" }, { severity: "asc" }, { createdAt: "desc" }],
  });
  return rows.map((b) => ({
    id: b.id,
    key: `BUG-${String(b.number).padStart(3, "0")}`,
    title: b.title,
    severity: b.severity,
    status: b.status,
    environment: b.environment,
    project: b.project,
    feature: b.feature?.name ?? null,
    task: b.task ? { id: b.task.id, key: taskKey(b.task.number) } : null,
    assignee: b.assignee,
    stepsToReproduce: b.stepsToReproduce,
    expectedResult: b.expectedResult,
    actualResult: b.actualResult,
    createdAt: b.createdAt.toISOString(),
  }));
}

export async function listDeployments(ctx: AuthContext, f: RecordFilter = {}) {
  requirePermission(ctx, "project.view");
  const rows = await db.deployment.findMany({
    where: scoped(ctx, f),
    include: { project: projectRef, deployedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((d) => ({
    id: d.id,
    version: d.version,
    environment: d.environment,
    status: d.status,
    commitSha: d.commitSha,
    releaseNotes: d.releaseNotes,
    project: d.project,
    deployedBy: d.deployedBy?.name ?? null,
    date: (d.deployedAt ?? d.scheduledFor ?? d.createdAt).toISOString(),
  }));
}

export async function listHandover(ctx: AuthContext, projectId: string) {
  requirePermission(ctx, "project.view");
  const rows = await db.handoverItem.findMany({ where: scoped(ctx, { projectId }), orderBy: { position: "asc" } });
  return rows.map((h) => ({ id: h.id, name: h.name, isRequired: h.isRequired, status: h.status, notes: h.notes, completedAt: h.completedAt?.toISOString() ?? null }));
}

export async function getMaintenance(ctx: AuthContext, projectId: string) {
  requirePermission(ctx, "project.view");
  const plan = await db.maintenancePlan.findFirst({ where: scoped(ctx, { projectId }), include: { supportRequests: { orderBy: { createdAt: "desc" } } } });
  if (!plan) return null;
  const used = plan.supportRequests.reduce((s, r) => s + num(r.hoursUsed), 0);
  return {
    plan: plan.plan,
    startDate: toISODate(plan.startDate)!,
    endDate: toISODate(plan.endDate)!,
    monthlyCost: num(plan.monthlyCost),
    includedHours: num(plan.includedHours),
    usedHours: used,
    remainingHours: Math.max(0, num(plan.includedHours) - used),
    supportLevel: plan.supportLevel,
    requests: plan.supportRequests.map((r) => ({ id: r.id, title: r.title, kind: r.kind, status: r.status, hoursUsed: num(r.hoursUsed) })),
  };
}

export async function listTimeEntries(ctx: AuthContext, projectId: string) {
  // Internal effort is not visible to client users.
  if (!can(ctx, "time.log") && !can(ctx, "time.viewAll")) throw forbidden();
  const where: Prisma.TimeEntryWhereInput = scoped(ctx, { projectId });
  const rows = await db.timeEntry.findMany({
    where,
    include: { user: { select: { name: true } }, task: { select: { id: true, number: true, title: true } }, phase: { select: { name: true } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  return rows.map((e) => ({
    id: e.id,
    date: toISODate(e.date)!,
    hours: num(e.hours),
    description: e.description,
    user: e.user.name,
    phase: e.phase?.name ?? null,
    task: e.task ? { id: e.task.id, key: taskKey(e.task.number), title: e.task.title } : null,
    running: e.startedAt !== null && e.endedAt === null,
  }));
}

/** Counts used for tab badges on the project detail page. */
export async function projectTabCounts(ctx: AuthContext, projectId: string) {
  const s = scoped(ctx, { projectId });
  const [tasks, bugs, approvals, crs, docs] = await Promise.all([
    db.task.count({ where: { ...s, deletedAt: null, status: { not: "DONE" } } }),
    db.bug.count({ where: { ...s, deletedAt: null, status: { not: "CLOSED" } } }),
    db.approval.count({ where: { ...s, status: "PENDING" } }),
    db.changeRequest.count({ where: { ...s, deletedAt: null, status: { in: ["PENDING_CLIENT_APPROVAL", "PENDING_INTERNAL_REVIEW", "DRAFT"] } } }),
    db.document.count({ where: { ...s, deletedAt: null } }),
  ]);
  return { tasks, bugs, approvals, crs, docs };
}
