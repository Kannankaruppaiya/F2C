import "server-only";
import { cache } from "react";
import type { Prisma, ProjectStatus } from "@prisma/client";
import { z } from "zod";
import { db, type Tx } from "@/server/db";
import { can, projectScope, requirePermission, type AuthContext } from "@/server/authz/context";
import { forbidden, notFound, ruleViolation } from "@/server/errors";
import { projectCreateSchema, projectListQuery, projectUpdateSchema } from "@/server/validation/schemas";
import { ACTIVE_PROJECT_STATUSES, PROJECT_STATUS, PROJECT_TRANSITIONS, PRIORITY_RANK } from "@/lib/status";
import { parseISODate } from "@/lib/dates";
import { loadProjectSummaries, num, type ProjectSummary } from "./metrics";
import { nextNumber, recordActivity } from "./activity";

export const STANDARD_PHASES = [
  "Discovery",
  "UI/UX",
  "Backend",
  "Frontend",
  "AI Integration",
  "QA",
  "Client UAT",
  "Deployment",
  "Handover",
  "Maintenance",
] as const;

export const STANDARD_HANDOVER_ITEMS: { name: string; required: boolean }[] = [
  { name: "Source Code", required: true },
  { name: "Production URL", required: true },
  { name: "Technical Documentation", required: true },
  { name: "API Documentation", required: false },
  { name: "Database Documentation", required: false },
  { name: "Deployment Documentation", required: true },
  { name: "Credentials Transfer", required: true },
  { name: "Admin Training", required: false },
  { name: "User Training", required: false },
  { name: "Backup", required: true },
  { name: "Final Invoice", required: true },
  { name: "Warranty Details", required: false },
];

/** Verifies the caller can see the project; returns the minimal row. Used by every child service. */
export async function assertProjectAccess(ctx: AuthContext, projectId: string) {
  const project = await db.project.findFirst({
    where: { AND: [projectScope(ctx), { id: projectId }] },
    select: { id: true, name: true, clientId: true, status: true, workspaceId: true },
  });
  if (!project) throw notFound("Project");
  return project;
}

export type ProjectListQuery = z.input<typeof projectListQuery>;

export async function listProjects(ctx: AuthContext, rawQuery: ProjectListQuery = {}): Promise<ProjectSummary[]> {
  requirePermission(ctx, "project.view");
  const q = projectListQuery.parse(rawQuery);
  const where: Prisma.ProjectWhereInput = {};
  if (q.status) where.status = q.status;
  else if (q.scope === "active") where.status = { in: ACTIVE_PROJECT_STATUSES };
  if (q.clientId) where.clientId = q.clientId;
  if (q.priority) where.priority = q.priority;
  if (q.q) {
    where.OR = [
      { name: { contains: q.q, mode: "insensitive" } },
      { code: { contains: q.q, mode: "insensitive" } },
      { client: { name: { contains: q.q, mode: "insensitive" } } },
    ];
  }

  let rows = await loadProjectSummaries(ctx, where);
  if (q.health) rows = rows.filter((r) => r.health.level === q.health);
  if (q.payment) rows = rows.filter((r) => r.paymentState === q.payment);

  const dir = q.dir === "desc" ? -1 : 1;
  rows.sort((a, b) => {
    switch (q.sort) {
      case "name":
        return a.name.localeCompare(b.name) * dir;
      case "progress":
        return (a.progress - b.progress) * dir;
      case "contractValue":
        return ((a.financials?.contractValue ?? 0) - (b.financials?.contractValue ?? 0)) * dir;
      case "updated":
        return (a.updatedAt < b.updatedAt ? -1 : 1) * dir;
      case "dueDate":
      default:
        // Undated projects sort last regardless of direction.
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]) * dir;
    }
  });
  return rows;
}

/** Request-memoized: the project layout and its tab pages share one load. */
export const getProject = cache(async (ctx: AuthContext, id: string) => {
  requirePermission(ctx, "project.view");
  const project = await db.project.findFirst({
    where: { AND: [projectScope(ctx), { id }] },
    include: {
      client: { select: { id: true, name: true, company: true } },
      projectManager: { select: { id: true, name: true } },
      members: { include: { user: { select: { id: true, name: true, avatarColor: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!project) throw notFound("Project");
  const [summary] = await loadProjectSummaries(ctx, { id });
  const showFinance = can(ctx, "finance.view");
  return {
    project: {
      ...project,
      contractValue: showFinance ? num(project.contractValue) : null,
      paymentTerms: showFinance ? project.paymentTerms : null,
    },
    summary: summary!,
  };
});

async function assertClientInWorkspace(tx: Tx, ctx: AuthContext, clientId: string) {
  const c = await tx.client.findFirst({ where: { id: clientId, workspaceId: ctx.workspaceId, deletedAt: null }, select: { id: true } });
  if (!c) throw ruleViolation("Selected client does not exist in this workspace");
}

async function assertUsersInWorkspace(tx: Tx, ctx: AuthContext, userIds: string[]) {
  if (userIds.length === 0) return;
  const n = await tx.workspaceMember.count({ where: { workspaceId: ctx.workspaceId, userId: { in: userIds }, role: { not: "CLIENT" } } });
  if (n !== new Set(userIds).size) throw ruleViolation("All team members must belong to this workspace");
}

const toDate = (s: string | null | undefined) => (s ? parseISODate(s) : s === null ? null : undefined);

export async function createProject(
  ctx: AuthContext,
  input: z.input<typeof projectCreateSchema>,
  opts: { standardPhases?: boolean } = {},
) {
  requirePermission(ctx, "project.create");
  const data = projectCreateSchema.parse(input);
  return db.$transaction(async (tx) => {
    await assertClientInWorkspace(tx, ctx, data.clientId);
    const memberIds = [...new Set([...data.memberIds, ...(data.projectManagerId ? [data.projectManagerId] : [])])];
    await assertUsersInWorkspace(tx, ctx, memberIds);

    const n = await nextNumber(tx, ctx.workspaceId, "project");
    const { memberIds: _m, startDate, dueDate, ...rest } = data;
    const project = await tx.project.create({
      data: {
        ...rest,
        code: `PRJ-${String(n).padStart(3, "0")}`,
        workspaceId: ctx.workspaceId,
        startDate: toDate(startDate),
        dueDate: toDate(dueDate),
        members: { create: memberIds.map((userId) => ({ userId, workspaceId: ctx.workspaceId })) },
        handoverItems: {
          create: STANDARD_HANDOVER_ITEMS.map((h, i) => ({ name: h.name, isRequired: h.required, position: i, workspaceId: ctx.workspaceId })),
        },
        phases: opts.standardPhases
          ? { create: STANDARD_PHASES.map((name, i) => ({ name, position: i + 1, workspaceId: ctx.workspaceId })) }
          : undefined,
      },
    });
    await recordActivity(
      ctx,
      { entityType: "project", entityId: project.id, projectId: project.id, action: "project.created", summary: `Project ${project.name} created` },
      tx,
    );
    return project;
  });
}

export async function updateProject(ctx: AuthContext, id: string, input: z.input<typeof projectUpdateSchema>) {
  requirePermission(ctx, "project.edit");
  const data = projectUpdateSchema.parse(input);
  const existing = await db.project.findFirst({ where: { AND: [projectScope(ctx), { id }] } });
  if (!existing) throw notFound("Project");

  if (data.status && data.status !== existing.status) await assertTransition(ctx, existing.id, existing.status, data.status);
  // Contract value and payment terms are financial data.
  if ((data.contractValue !== undefined && data.contractValue !== num(existing.contractValue)) && !can(ctx, "finance.view")) throw forbidden();

  return db.$transaction(async (tx) => {
    if (data.clientId) await assertClientInWorkspace(tx, ctx, data.clientId);
    const { memberIds, startDate, dueDate, ...rest } = data;
    if (memberIds) {
      const ids = [...new Set([...memberIds, ...(data.projectManagerId ? [data.projectManagerId] : [])])];
      await assertUsersInWorkspace(tx, ctx, ids);
      await tx.projectMember.deleteMany({ where: { projectId: id, userId: { notIn: ids } } });
      const existingMembers = await tx.projectMember.findMany({ where: { projectId: id }, select: { userId: true } });
      const have = new Set(existingMembers.map((m) => m.userId));
      const add = ids.filter((u) => !have.has(u));
      if (add.length) await tx.projectMember.createMany({ data: add.map((userId) => ({ userId, projectId: id, workspaceId: ctx.workspaceId })) });
    }
    const project = await tx.project.update({
      where: { id },
      data: {
        ...rest,
        startDate: toDate(startDate),
        dueDate: toDate(dueDate),
        completedAt: data.status === "COMPLETED" ? new Date() : data.status ? null : undefined,
      },
    });
    const statusChanged = data.status && data.status !== existing.status;
    await recordActivity(
      ctx,
      {
        entityType: "project",
        entityId: id,
        projectId: id,
        action: statusChanged ? "project.status_changed" : "project.updated",
        summary: statusChanged
          ? `${project.name} moved to ${PROJECT_STATUS[data.status!].label}`
          : `Project ${project.name} details updated`,
        metadata: statusChanged ? { from: existing.status, to: data.status! } : undefined,
      },
      tx,
    );
    return project;
  });
}

/** Status transition rules, including "cannot complete before handover" (rule 17). */
async function assertTransition(ctx: AuthContext, projectId: string, from: ProjectStatus, to: ProjectStatus) {
  if (!PROJECT_TRANSITIONS[from].includes(to)) {
    throw ruleViolation(`A project cannot move from ${PROJECT_STATUS[from].label} to ${PROJECT_STATUS[to].label}`);
  }
  if (to === "COMPLETED") {
    const pending = await db.handoverItem.findMany({
      where: { projectId, workspaceId: ctx.workspaceId, isRequired: true, status: "PENDING" },
      select: { name: true },
    });
    if (pending.length > 0) {
      throw ruleViolation(
        `Complete the required handover items first: ${pending.map((p) => p.name).join(", ")}`,
      );
    }
  }
}

export async function deleteProject(ctx: AuthContext, id: string) {
  requirePermission(ctx, "project.delete");
  const project = await assertProjectAccess(ctx, id);
  const payments = await db.payment.count({ where: { invoice: { projectId: id } } });
  if (payments > 0) throw ruleViolation("Projects with recorded payments cannot be deleted. Cancel the project instead.");
  await db.$transaction(async (tx) => {
    await tx.project.update({ where: { id }, data: { deletedAt: new Date() } });
    await recordActivity(ctx, { entityType: "project", entityId: id, projectId: id, action: "project.deleted", summary: `Project ${project.name} deleted` }, tx);
  });
}

export async function listProjectOptions(ctx: AuthContext) {
  return db.project.findMany({
    where: { AND: [projectScope(ctx), { status: { notIn: ["CANCELLED"] } }] },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });
}

export async function listTeamMembers(ctx: AuthContext) {
  const rows = await db.workspaceMember.findMany({
    where: { workspaceId: ctx.workspaceId, role: { not: "CLIENT" } },
    include: { user: { select: { id: true, name: true, avatarColor: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return rows.map((r) => ({ id: r.user.id, name: r.user.name, role: r.role, avatarColor: r.user.avatarColor }));
}
