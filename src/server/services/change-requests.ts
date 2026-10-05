import "server-only";
import type { ChangeRequestStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { db, type Tx } from "@/server/db";
import { can, changeRequestScope, projectScope, requirePermission, type AuthContext } from "@/server/authz/context";
import { AppError, forbidden, notFound, ruleViolation } from "@/server/errors";
import {
  changeRequestCancelSchema,
  changeRequestCreateSchema,
  changeRequestDecisionSchema,
  changeRequestListQuery,
  changeRequestRejectSchema,
  changeRequestUpdateSchema,
  implementationTasksSchema,
  taskCreateSchema,
} from "@/server/validation/schemas";
import {
  availableCRActions,
  canCreateImplementationTasks,
  canTransitionCR,
  CR_EDITABLE,
  CR_IN_SCOPE,
  CR_TRANSITIONS,
  sendReadiness,
  type ChangeRequestAction,
} from "@/server/domain/change-requests";
import { toISODate } from "@/lib/dates";
import { CHANGE_REQUEST_STATUS } from "@/lib/status";
import { nextNumber, recordActivity } from "./activity";
import { notify } from "./notifications";
import { clientUserIds } from "./documents";
import { createTaskInTx, taskKey } from "./tasks";
import { num } from "./metrics";

export const crKey = (n: number) => `CR-${String(n).padStart(3, "0")}`;

const include = {
  project: { select: { id: true, name: true, projectManagerId: true, clientId: true } },
  requestedByUser: { select: { id: true, name: true, memberships: { select: { role: true, workspaceId: true } } } },
  decidedBy: { select: { name: true } },
  _count: { select: { tasks: { where: { deletedAt: null } }, features: { where: { deletedAt: null } } } },
} satisfies Prisma.ChangeRequestInclude;

type CRWithRefs = Prisma.ChangeRequestGetPayload<{ include: typeof include }>;

function toRow(c: CRWithRefs, ctx: AuthContext) {
  const internal = ctx.role !== "CLIENT";
  const manage = internal && can(ctx, "changeRequest.manage");
  const actions = availableCRActions(c.status).filter((a) => {
    if (a === "approve" || a === "reject") return (ctx.role === "CLIENT" && can(ctx, "changeRequest.decide")) || manage;
    return manage;
  });
  return {
    id: c.id,
    key: crKey(c.number),
    number: c.number,
    title: c.title,
    status: c.status,
    priority: c.priority,
    project: { id: c.project.id, name: c.project.name },
    requestedBy: c.requestedBy ?? c.requestedByUser?.name ?? null,
    requestedByClient: c.requestedByUser?.memberships.some((m) => m.workspaceId === ctx.workspaceId && m.role === "CLIENT") ?? false,
    requestDate: toISODate(c.requestDate)!,
    description: c.description,
    originalScope: c.originalScope,
    requestedChange: c.requestedChange,
    impact: c.impact,
    estimatedHours: num(c.estimatedHours),
    additionalCost: num(c.additionalCost),
    clientDecision: c.clientDecision,
    decidedBy: c.decidedBy?.name ?? null,
    decisionOnBehalf: c.decisionOnBehalf,
    cancellationReason: c.cancellationReason,
    submittedAt: c.submittedAt?.toISOString() ?? null,
    resolvedAt: c.resolvedAt?.toISOString() ?? null,
    implementedAt: c.implementedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    taskCount: c._count.tasks,
    featureCount: c._count.features,
    actions,
    canEdit: manage && CR_EDITABLE.includes(c.status),
    canCreateTasks: manage && canCreateImplementationTasks(c.status),
  };
}

export type ChangeRequestRow = ReturnType<typeof toRow>;

export async function listChangeRequests(ctx: AuthContext, raw: z.input<typeof changeRequestListQuery> = {}) {
  requirePermission(ctx, "project.view");
  const q = changeRequestListQuery.parse(raw);
  const and: Prisma.ChangeRequestWhereInput[] = [changeRequestScope(ctx)];
  if (q.status) and.push({ status: q.status });
  if (q.projectId) and.push({ projectId: q.projectId });
  if (q.clientId) and.push({ clientId: q.clientId });
  if (q.q) {
    const n = Number(q.q.replace(/^cr-/i, ""));
    and.push({ OR: [{ title: { contains: q.q, mode: "insensitive" } }, ...(Number.isInteger(n) && n > 0 ? [{ number: n }] : [])] });
  }
  const rows = await db.changeRequest.findMany({ where: { AND: and }, include, orderBy: { number: "desc" }, take: 500 });
  return rows.map((c) => toRow(c, ctx));
}

async function findCR(ctx: AuthContext, id: string) {
  const c = await db.changeRequest.findFirst({ where: { AND: [changeRequestScope(ctx), { id }] }, include });
  if (!c) throw notFound("Change request");
  return c;
}

export async function getChangeRequest(ctx: AuthContext, id: string) {
  requirePermission(ctx, "project.view");
  const c = await findCR(ctx, id);
  const [tasks, features, documents] = await Promise.all([
    db.task.findMany({
      where: { changeRequestId: c.id, deletedAt: null },
      orderBy: { number: "asc" },
      select: { id: true, number: true, title: true, status: true, estimatedHours: true, assignee: { select: { name: true } } },
    }),
    db.feature.findMany({ where: { changeRequestId: c.id, deletedAt: null }, select: { id: true, name: true, status: true, phase: { select: { name: true } } } }),
    ctx.role === "CLIENT"
      ? Promise.resolve([])
      : db.document.findMany({ where: { changeRequestId: c.id, deletedAt: null }, select: { id: true, name: true, status: true } }),
  ]);
  const row = toRow(c, ctx);
  return {
    ...row,
    // Clients don't see internal task breakdowns, only progress.
    tasks: ctx.role === "CLIENT" ? [] : tasks.map((t) => ({ id: t.id, key: taskKey(t.number), title: t.title, status: t.status, estimatedHours: num(t.estimatedHours), assignee: t.assignee?.name ?? null })),
    taskProgress: tasks.length ? tasks.filter((t) => t.status === "DONE").length / tasks.length : null,
    features: features.map((f) => ({ id: f.id, name: f.name, status: f.status, phase: f.phase.name })),
    documents,
    sendProblems: sendReadiness({ impact: c.impact, estimatedHours: num(c.estimatedHours), requestedChange: c.requestedChange }),
  };
}

export type ChangeRequestDetail = Awaited<ReturnType<typeof getChangeRequest>>;

export async function createChangeRequest(ctx: AuthContext, input: z.input<typeof changeRequestCreateSchema>) {
  requirePermission(ctx, "changeRequest.request");
  const data = changeRequestCreateSchema.parse(input);
  const project = await db.project.findFirst({ where: { AND: [projectScope(ctx), { id: data.projectId }] }, select: { id: true, clientId: true, projectManagerId: true } });
  if (!project) throw notFound("Project");
  const isClient = ctx.role === "CLIENT";

  return db.$transaction(async (tx) => {
    const number = await nextNumber(tx, ctx.workspaceId, "change_request");
    const cr = await tx.changeRequest.create({
      data: {
        workspaceId: ctx.workspaceId,
        projectId: project.id,
        clientId: project.clientId,
        number,
        title: data.title,
        description: data.description ?? null,
        requestedChange: data.requestedChange ?? null,
        priority: data.priority,
        requestedById: ctx.userId,
        requestedBy: isClient ? ctx.userName : (data.requestedBy ?? ctx.userName),
        // Estimates and impact are internal analysis; clients only describe the change.
        originalScope: isClient ? null : (data.originalScope ?? null),
        impact: isClient ? null : (data.impact ?? null),
        estimatedHours: isClient ? 0 : data.estimatedHours,
        additionalCost: isClient ? 0 : data.additionalCost,
      },
    });
    await recordActivity(
      ctx,
      { entityType: "change_request", entityId: cr.id, projectId: project.id, action: "change_request.created", summary: `${crKey(number)} created: ${cr.title}`, metadata: { changeRequestId: cr.id }, clientVisible: isClient },
      tx,
    );
    if (isClient) {
      await notify(tx, ctx, [project.projectManagerId], { kind: "change_request.requested", title: `${ctx.userName} requested a change: ${crKey(number)}`, body: cr.title, href: `/change-requests/${cr.id}` });
    }
    return cr;
  });
}

export async function updateChangeRequest(ctx: AuthContext, id: string, input: z.input<typeof changeRequestUpdateSchema>) {
  requirePermission(ctx, "changeRequest.manage");
  const data = changeRequestUpdateSchema.parse(input);
  const c = await findCR(ctx, id);
  if (!CR_EDITABLE.includes(c.status)) throw ruleViolation("Only draft or under-review change requests can be edited. Withdraw it from the client first.");
  return db.$transaction(async (tx) => {
    const res = await tx.changeRequest.updateMany({ where: { id: c.id, status: { in: CR_EDITABLE } }, data });
    if (res.count !== 1) throw new AppError("CONFLICT", "The change request changed state; reload and try again");
    await recordActivity(ctx, { entityType: "change_request", entityId: c.id, projectId: c.projectId, action: "change_request.updated", summary: `${crKey(c.number)} updated`, metadata: { changeRequestId: c.id } }, tx);
  });
}

/** Conditional status update: fails if another request already moved the CR. */
async function move(tx: Tx, c: { id: string; status: ChangeRequestStatus }, action: ChangeRequestAction, data: Prisma.ChangeRequestUncheckedUpdateManyInput = {}) {
  const res = await tx.changeRequest.updateMany({ where: { id: c.id, status: c.status }, data: { status: CR_TRANSITIONS[action].to, ...data } });
  if (res.count !== 1) throw new AppError("CONFLICT", "The change request changed state; reload and try again");
}

function assertCan(c: { status: ChangeRequestStatus }, action: ChangeRequestAction) {
  if (!canTransitionCR(c.status, action)) {
    throw ruleViolation(`A change request that is ${CHANGE_REQUEST_STATUS[c.status].label.toLowerCase()} cannot be ${action === "send" ? "sent to the client" : `${action}${action.endsWith("e") ? "d" : "ed"}`}`);
  }
}

export async function transitionChangeRequest(ctx: AuthContext, id: string, action: "submit" | "send" | "withdraw" | "implement") {
  requirePermission(ctx, "changeRequest.manage");
  if (ctx.role === "CLIENT") throw forbidden();
  const c = await findCR(ctx, id);
  assertCan(c, action);
  const key = crKey(c.number);

  if (action === "send") {
    const problems = sendReadiness({ impact: c.impact, estimatedHours: num(c.estimatedHours), requestedChange: c.requestedChange });
    if (problems.length) throw ruleViolation(`Before sending: ${problems.join(", ").toLowerCase()}`);
  }
  if (action === "implement") {
    const open = await db.task.count({ where: { changeRequestId: c.id, deletedAt: null, status: { not: "DONE" } } });
    if (open > 0) throw ruleViolation(`${open} implementation task${open === 1 ? " is" : "s are"} still open`);
  }

  return db.$transaction(async (tx) => {
    const now = new Date();
    await move(tx, c, action, action === "send" ? { submittedAt: now } : action === "implement" ? { implementedAt: now } : {});
    const summary = {
      submit: `${key} submitted for internal review`,
      send: `${key} sent to the client for approval`,
      withdraw: `${key} withdrawn from the client for revision`,
      implement: `${key} implemented`,
    }[action];
    await recordActivity(
      ctx,
      { entityType: "change_request", entityId: c.id, projectId: c.projectId, action: `change_request.${action === "send" ? "sent" : action === "implement" ? "implemented" : action === "submit" ? "submitted" : "withdrawn"}`, summary, metadata: { changeRequestId: c.id }, clientVisible: action !== "submit" },
      tx,
    );
    if (action === "send" || action === "withdraw" || action === "implement") {
      const clients = await clientUserIds(tx, ctx.workspaceId, c.project.clientId);
      const title = { send: `${key} requires your review`, withdraw: `${key} was withdrawn for revision`, implement: `${key} has been implemented` }[action];
      await notify(tx, ctx, clients, { kind: `change_request.${action}`, title, body: c.title, href: `/change-requests/${c.id}` });
    }
  });
}

/**
 * Client decision. Client users of the project's client decide directly; an internal manager may
 * record a decision the client gave outside the app (stored with decisionOnBehalf = true).
 */
export async function decideChangeRequest(ctx: AuthContext, id: string, decision: "approve" | "reject", input: z.input<typeof changeRequestDecisionSchema>) {
  const { note, onBehalf } = (decision === "reject" ? changeRequestRejectSchema : changeRequestDecisionSchema).parse(input);
  const isClient = ctx.role === "CLIENT";
  if (isClient) requirePermission(ctx, "changeRequest.decide");
  else {
    requirePermission(ctx, "changeRequest.manage");
    if (!onBehalf) throw ruleViolation("Only the client can approve or reject. To record a decision the client made offline, confirm it was given on their behalf.");
    if (!note?.trim()) throw new AppError("VALIDATION", "Note how the client communicated the decision", { note: ["Required when recording on behalf of the client"] });
  }
  const c = await findCR(ctx, id);
  assertCan(c, decision);
  const key = crKey(c.number);

  return db.$transaction(async (tx) => {
    await move(tx, c, decision, {
      resolvedAt: new Date(),
      clientDecision: note ?? null,
      decidedById: ctx.userId,
      decisionOnBehalf: !isClient,
    });
    const verb = decision === "approve" ? "approved" : "rejected";
    const summary = isClient ? `${key} ${verb} by ${ctx.userName}` : `Client ${decision === "approve" ? "approval" : "rejection"} of ${key} recorded by ${ctx.userName}`;
    await recordActivity(
      ctx,
      {
        entityType: "change_request",
        entityId: c.id,
        projectId: c.projectId,
        action: `change_request.${verb}`,
        summary,
        metadata: { changeRequestId: c.id, onBehalf: !isClient, note: note ?? null, additionalCost: num(c.additionalCost), estimatedHours: num(c.estimatedHours) },
        clientVisible: true,
      },
      tx,
    );
    await notify(tx, ctx, [c.project.projectManagerId, c.requestedById], {
      kind: `change_request.${verb}`,
      title: `${key} ${verb} by client`,
      body: note ?? c.title,
      href: `/change-requests/${c.id}`,
    });
    if (!isClient) {
      await notify(tx, ctx, await clientUserIds(tx, ctx.workspaceId, c.project.clientId), { kind: `change_request.${verb}`, title: `${key} recorded as ${verb}`, body: note, href: `/change-requests/${c.id}` });
    }
  });
}

export async function cancelChangeRequest(ctx: AuthContext, id: string, input: z.input<typeof changeRequestCancelSchema>) {
  requirePermission(ctx, "changeRequest.manage");
  if (ctx.role === "CLIENT") throw forbidden();
  const { reason } = changeRequestCancelSchema.parse(input);
  const c = await findCR(ctx, id);
  assertCan(c, "cancel");
  return db.$transaction(async (tx) => {
    await move(tx, c, "cancel", { resolvedAt: new Date(), cancellationReason: reason });
    await recordActivity(
      ctx,
      { entityType: "change_request", entityId: c.id, projectId: c.projectId, action: "change_request.cancelled", summary: `${crKey(c.number)} cancelled`, metadata: { changeRequestId: c.id, reason }, clientVisible: c.submittedAt !== null || c.requestedById !== null },
      tx,
    );
    if (c.status === "PENDING_CLIENT_APPROVAL") {
      await notify(tx, ctx, await clientUserIds(tx, ctx.workspaceId, c.project.clientId), { kind: "change_request.cancelled", title: `${crKey(c.number)} was cancelled`, body: reason, href: `/change-requests/${c.id}` });
    }
  });
}

/**
 * Creates the user-confirmed implementation tasks for an APPROVED change request (never automatic).
 * Optionally creates a feature for the change, which then counts toward "approved changes" scope.
 * All or nothing.
 */
export async function createImplementationTasks(ctx: AuthContext, id: string, input: z.input<typeof implementationTasksSchema>) {
  requirePermission(ctx, "changeRequest.manage");
  requirePermission(ctx, "task.create");
  if (ctx.role === "CLIENT") throw forbidden();
  const data = implementationTasksSchema.parse(input);
  const c = await findCR(ctx, id);
  if (!canCreateImplementationTasks(c.status)) {
    throw ruleViolation(`Implementation tasks can only be created for approved change requests (this one is ${CHANGE_REQUEST_STATUS[c.status].label.toLowerCase()})`);
  }
  const key = crKey(c.number);

  return db.$transaction(async (tx) => {
    // Re-check inside the transaction so a concurrent cancel/implement can't slip through.
    const fresh = await tx.changeRequest.findUniqueOrThrow({ where: { id: c.id }, select: { status: true } });
    if (!canCreateImplementationTasks(fresh.status)) throw new AppError("CONFLICT", "The change request is no longer approved");

    let featureId: string | null = null;
    if (data.feature) {
      const phase = await tx.phase.findFirst({ where: { id: data.feature.phaseId, projectId: c.projectId, deletedAt: null }, select: { id: true } });
      if (!phase) throw ruleViolation("Phase does not belong to this project");
      const last = await tx.feature.aggregate({ where: { phaseId: phase.id, deletedAt: null }, _max: { position: true } });
      const feature = await tx.feature.create({
        data: {
          workspaceId: ctx.workspaceId,
          projectId: c.projectId,
          phaseId: phase.id,
          changeRequestId: c.id,
          name: data.feature.name,
          description: c.requestedChange,
          status: "PLANNED",
          priority: c.priority,
          estimatedHours: c.estimatedHours,
          position: (last._max.position ?? 0) + 1,
        },
      });
      featureId = feature.id;
      await recordActivity(ctx, { entityType: "feature", entityId: feature.id, projectId: c.projectId, action: "feature.created", summary: `Feature ${feature.name} added to scope by ${key}`, metadata: { changeRequestId: c.id } }, tx);
    }

    const created = [];
    for (const t of data.tasks) {
      const parsed = taskCreateSchema.parse({
        projectId: c.projectId,
        title: t.title,
        phaseId: featureId && data.feature ? data.feature.phaseId : t.phaseId,
        featureId: t.featureId ?? featureId,
        estimatedHours: t.estimatedHours,
        assigneeId: t.assigneeId ?? null,
        dueDate: t.dueDate ?? null,
        status: "TODO",
        priority: c.priority,
        description: `Implements ${key}: ${c.title}`,
      });
      if (parsed.assigneeId && parsed.assigneeId !== ctx.userId && !can(ctx, "task.assign")) throw forbidden("You can only assign tasks to yourself");
      created.push(await createTaskInTx(tx, ctx, { ...parsed, changeRequestId: c.id }));
    }
    await recordActivity(
      ctx,
      {
        entityType: "change_request",
        entityId: c.id,
        projectId: c.projectId,
        action: "change_request.tasks_created",
        summary: `${key} implementation tasks created (${created.length})`,
        metadata: { changeRequestId: c.id, taskIds: created.map((t) => t.id), featureId },
        clientVisible: true,
      },
      tx,
    );
    return { tasks: created.map((t) => ({ id: t.id, key: taskKey(t.number), title: t.title })), featureId };
  });
}

/** Approved change requests available to link a feature to (scope provenance). */
export async function listApprovedChangeRequests(ctx: AuthContext, projectId: string) {
  const rows = await db.changeRequest.findMany({
    where: { AND: [changeRequestScope(ctx), { projectId, status: { in: CR_IN_SCOPE } }] },
    select: { id: true, number: true, title: true },
    orderBy: { number: "asc" },
  });
  return rows.map((r) => ({ id: r.id, key: crKey(r.number), title: r.title }));
}
