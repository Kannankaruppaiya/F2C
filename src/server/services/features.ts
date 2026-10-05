import "server-only";
import { z } from "zod";
import { db, type Tx } from "@/server/db";
import { requirePermission, type AuthContext } from "@/server/authz/context";
import { notFound, ruleViolation } from "@/server/errors";
import { featureCreateSchema, featureUpdateSchema } from "@/server/validation/schemas";
import { FEATURE_STATUS, OPEN_TASK_STATUSES } from "@/lib/status";
import { taskProgress } from "@/server/domain/progress";
import { assertProjectAccess } from "./projects";
import { num } from "./metrics";
import { recordActivity } from "./activity";

export async function listFeatures(ctx: AuthContext, projectId: string, opts: { phaseId?: string } = {}) {
  await assertProjectAccess(ctx, projectId);
  const features = await db.feature.findMany({
    where: { projectId, workspaceId: ctx.workspaceId, deletedAt: null, ...(opts.phaseId ? { phaseId: opts.phaseId } : {}) },
    orderBy: [{ phase: { position: "asc" } }, { position: "asc" }, { createdAt: "asc" }],
    include: {
      phase: { select: { id: true, name: true, position: true } },
      changeRequest: { select: { id: true, number: true } },
      acceptanceCriteria: { orderBy: { position: "asc" } },
      dependencies: { select: { dependsOnId: true } },
      tasks: { where: { deletedAt: null }, select: { status: true, estimatedHours: true } },
      _count: { select: { bugs: { where: { deletedAt: null, status: { not: "CLOSED" } } } } },
    },
  });
  const hours = await db.timeEntry.groupBy({ by: ["featureId"], where: { projectId, featureId: { in: features.map((f) => f.id) } }, _sum: { hours: true } });
  const hoursBy = new Map(hours.map((h) => [h.featureId, num(h._sum.hours)]));

  return features.map((f) => {
    const tasks = f.tasks.map((t) => ({ status: t.status, estimatedHours: num(t.estimatedHours) }));
    return {
      id: f.id,
      name: f.name,
      description: f.description,
      priority: f.priority,
      status: f.status,
      phase: f.phase,
      estimatedHours: Math.max(num(f.estimatedHours), tasks.reduce((s, t) => s + t.estimatedHours, 0)),
      plannedHours: num(f.estimatedHours),
      actualHours: hoursBy.get(f.id) ?? 0,
      progress: f.status === "COMPLETED" ? 100 : taskProgress(tasks),
      taskCount: tasks.length,
      openTaskCount: tasks.filter((t) => OPEN_TASK_STATUSES.includes(t.status)).length,
      openBugCount: f._count.bugs,
      acceptanceCriteria: f.acceptanceCriteria.map((a) => ({ id: a.id, text: a.text, isMet: a.isMet })),
      dependsOnIds: f.dependencies.map((d) => d.dependsOnId),
      changeRequest: f.changeRequest ? { id: f.changeRequest.id, key: `CR-${String(f.changeRequest.number).padStart(3, "0")}` } : null,
    };
  });
}

export type FeatureRow = Awaited<ReturnType<typeof listFeatures>>[number];

async function assertPhaseInProject(tx: Tx, projectId: string, phaseId: string) {
  const phase = await tx.phase.findFirst({ where: { id: phaseId, projectId, deletedAt: null }, select: { id: true } });
  if (!phase) throw ruleViolation("Phase does not belong to this project");
}

/** A feature can only be attributed to an approved/implemented change request of the same project. */
async function assertChangeRequest(tx: Tx, projectId: string, changeRequestId: string | null | undefined) {
  if (!changeRequestId) return;
  const cr = await tx.changeRequest.findFirst({ where: { id: changeRequestId, projectId, deletedAt: null }, select: { status: true } });
  if (!cr) throw ruleViolation("Change request does not belong to this project");
  if (cr.status !== "APPROVED" && cr.status !== "IMPLEMENTED") throw ruleViolation("Only approved change requests can add features to scope");
}

async function setDependencies(tx: Tx, projectId: string, featureId: string, dependsOnIds: string[]) {
  const ids = [...new Set(dependsOnIds.filter((d) => d !== featureId))];
  if (ids.length) {
    const n = await tx.feature.count({ where: { id: { in: ids }, projectId, deletedAt: null } });
    if (n !== ids.length) throw ruleViolation("Feature dependencies must be features of the same project");
  }
  await tx.featureDependency.deleteMany({ where: { featureId } });
  if (ids.length) await tx.featureDependency.createMany({ data: ids.map((dependsOnId) => ({ featureId, dependsOnId })) });
}

/** Replace criteria while preserving the "met" state of unchanged lines. */
async function setCriteria(tx: Tx, workspaceId: string, featureId: string, lines: string[]) {
  const existing = await tx.acceptanceCriterion.findMany({ where: { featureId } });
  const met = new Map(existing.map((e) => [e.text, e.isMet]));
  await tx.acceptanceCriterion.deleteMany({ where: { featureId } });
  if (lines.length) {
    await tx.acceptanceCriterion.createMany({
      data: lines.map((text, position) => ({ workspaceId, featureId, text, position, isMet: met.get(text) ?? false })),
    });
  }
}

export async function createFeature(ctx: AuthContext, projectId: string, input: z.input<typeof featureCreateSchema>) {
  requirePermission(ctx, "feature.edit");
  const data = featureCreateSchema.parse(input);
  await assertProjectAccess(ctx, projectId);
  return db.$transaction(async (tx) => {
    await assertPhaseInProject(tx, projectId, data.phaseId);
    await assertChangeRequest(tx, projectId, data.changeRequestId);
    const { acceptanceCriteria, dependsOnIds, ...rest } = data;
    const last = await tx.feature.aggregate({ where: { phaseId: data.phaseId, deletedAt: null }, _max: { position: true } });
    const feature = await tx.feature.create({
      data: { ...rest, projectId, workspaceId: ctx.workspaceId, position: (last._max.position ?? 0) + 1 },
    });
    await setCriteria(tx, ctx.workspaceId, feature.id, acceptanceCriteria);
    await setDependencies(tx, projectId, feature.id, dependsOnIds);
    await recordActivity(ctx, { entityType: "feature", entityId: feature.id, projectId, action: "feature.created", summary: `Feature ${feature.name} created` }, tx);
    return feature;
  });
}

async function getFeatureRow(ctx: AuthContext, featureId: string) {
  const feature = await db.feature.findFirst({ where: { id: featureId, workspaceId: ctx.workspaceId, deletedAt: null } });
  if (!feature) throw notFound("Feature");
  await assertProjectAccess(ctx, feature.projectId);
  return feature;
}

export async function updateFeature(ctx: AuthContext, featureId: string, input: z.input<typeof featureUpdateSchema>) {
  requirePermission(ctx, "feature.edit");
  const data = featureUpdateSchema.parse(input);
  const existing = await getFeatureRow(ctx, featureId);
  return db.$transaction(async (tx) => {
    if (data.phaseId && data.phaseId !== existing.phaseId) {
      await assertPhaseInProject(tx, existing.projectId, data.phaseId);
      // Tasks follow their feature into the new phase (rule 4: a feature's tasks share its phase).
      await tx.task.updateMany({ where: { featureId }, data: { phaseId: data.phaseId } });
    }
    if (data.changeRequestId !== undefined) await assertChangeRequest(tx, existing.projectId, data.changeRequestId);
    const { acceptanceCriteria, dependsOnIds, ...rest } = data;
    const feature = await tx.feature.update({ where: { id: featureId }, data: rest });
    if (acceptanceCriteria) await setCriteria(tx, ctx.workspaceId, featureId, acceptanceCriteria);
    if (dependsOnIds) await setDependencies(tx, existing.projectId, featureId, dependsOnIds);
    const statusChanged = data.status && data.status !== existing.status;
    await recordActivity(
      ctx,
      {
        entityType: "feature",
        entityId: featureId,
        projectId: existing.projectId,
        action: statusChanged ? "feature.status_changed" : "feature.updated",
        summary: statusChanged ? `Feature ${feature.name} moved to ${FEATURE_STATUS[data.status!].label}` : `Feature ${feature.name} updated`,
      },
      tx,
    );
    return feature;
  });
}

export async function toggleCriterion(ctx: AuthContext, criterionId: string) {
  requirePermission(ctx, "task.edit");
  const c = await db.acceptanceCriterion.findFirst({ where: { id: criterionId, workspaceId: ctx.workspaceId }, include: { feature: true } });
  if (!c) throw notFound("Acceptance criterion");
  await assertProjectAccess(ctx, c.feature.projectId);
  await db.$transaction(async (tx) => {
    await tx.acceptanceCriterion.update({ where: { id: criterionId }, data: { isMet: !c.isMet } });
    await recordActivity(
      ctx,
      {
        entityType: "feature",
        entityId: c.featureId,
        projectId: c.feature.projectId,
        action: "feature.criterion_toggled",
        summary: `${c.isMet ? "Unmarked" : "Verified"} "${c.text}" on ${c.feature.name}`,
      },
      tx,
    );
  });
  return c.feature.projectId;
}

export async function deleteFeature(ctx: AuthContext, featureId: string) {
  requirePermission(ctx, "feature.edit");
  const feature = await getFeatureRow(ctx, featureId);
  const tasks = await db.task.count({ where: { featureId, deletedAt: null } });
  if (tasks > 0) throw ruleViolation("Delete or move this feature's tasks first");
  await db.$transaction(async (tx) => {
    await tx.feature.update({ where: { id: featureId }, data: { deletedAt: new Date() } });
    await recordActivity(ctx, { entityType: "feature", entityId: featureId, projectId: feature.projectId, action: "feature.deleted", summary: `Feature ${feature.name} deleted` }, tx);
  });
  return feature.projectId;
}
