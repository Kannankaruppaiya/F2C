import "server-only";
import { z } from "zod";
import { db, type Tx } from "@/server/db";
import { requirePermission, type AuthContext } from "@/server/authz/context";
import { notFound, ruleViolation } from "@/server/errors";
import { phaseCreateSchema, phaseUpdateSchema } from "@/server/validation/schemas";
import { PHASE_STATUS } from "@/lib/status";
import { parseISODate, toISODate } from "@/lib/dates";
import { assertProjectAccess } from "./projects";
import { loadProjectSummaries, num } from "./metrics";
import { recordActivity } from "./activity";

export async function listPhases(ctx: AuthContext, projectId: string) {
  await assertProjectAccess(ctx, projectId);
  const [phases, [summary], milestones] = await Promise.all([
    db.phase.findMany({
      where: { projectId, workspaceId: ctx.workspaceId, deletedAt: null },
      orderBy: { position: "asc" },
      include: {
        dependencies: { select: { dependsOnId: true } },
        _count: { select: { features: { where: { deletedAt: null } }, bugs: { where: { deletedAt: null, status: { not: "CLOSED" } } } } },
      },
    }),
    loadProjectSummaries(ctx, { id: projectId }),
    db.milestone.findMany({ where: { projectId, workspaceId: ctx.workspaceId }, select: { phaseId: true, name: true, amount: true, status: true } }),
  ]);
  const metrics = new Map(summary!.phases.map((p) => [p.id, p]));
  const showFinance = summary!.financials !== null;
  return phases.map((p) => {
    const m = metrics.get(p.id);
    const milestone = milestones.find((x) => x.phaseId === p.id);
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      position: p.position,
      status: p.status,
      startDate: toISODate(p.startDate),
      endDate: toISODate(p.endDate),
      budget: showFinance && p.budget != null ? num(p.budget) : null,
      estimatedHours: m?.estimatedHours ?? num(p.estimatedHours),
      plannedHours: num(p.estimatedHours),
      actualHours: m?.actualHours ?? 0,
      progress: m?.progress ?? 0,
      taskCount: m?.taskCount ?? 0,
      openTaskCount: m?.openTaskCount ?? 0,
      featureCount: p._count.features,
      openBugCount: p._count.bugs,
      dependsOnIds: p.dependencies.map((d) => d.dependsOnId),
      milestone: showFinance && milestone ? { name: milestone.name, amount: num(milestone.amount), status: milestone.status } : null,
    };
  });
}

export type PhaseRow = Awaited<ReturnType<typeof listPhases>>[number];

async function setDependencies(tx: Tx, projectId: string, phaseId: string, dependsOnIds: string[]) {
  const ids = [...new Set(dependsOnIds.filter((d) => d !== phaseId))];
  if (ids.length) {
    const n = await tx.phase.count({ where: { id: { in: ids }, projectId, deletedAt: null } });
    if (n !== ids.length) throw ruleViolation("Phase dependencies must be phases of the same project");
  }
  await tx.phaseDependency.deleteMany({ where: { phaseId } });
  if (ids.length) await tx.phaseDependency.createMany({ data: ids.map((dependsOnId) => ({ phaseId, dependsOnId })) });
}

const toDate = (s: string | null | undefined) => (s ? parseISODate(s) : s === null ? null : undefined);

export async function createPhase(ctx: AuthContext, projectId: string, input: z.input<typeof phaseCreateSchema>) {
  requirePermission(ctx, "phase.edit");
  const data = phaseCreateSchema.parse(input);
  const project = await assertProjectAccess(ctx, projectId);
  return db.$transaction(async (tx) => {
    const last = await tx.phase.aggregate({ where: { projectId, deletedAt: null }, _max: { position: true } });
    const { dependsOnIds, startDate, endDate, ...rest } = data;
    const phase = await tx.phase.create({
      data: {
        ...rest,
        startDate: toDate(startDate),
        endDate: toDate(endDate),
        projectId,
        workspaceId: ctx.workspaceId,
        position: (last._max.position ?? 0) + 1,
      },
    });
    await setDependencies(tx, projectId, phase.id, dependsOnIds);
    await recordActivity(ctx, { entityType: "phase", entityId: phase.id, projectId, action: "phase.created", summary: `Phase ${phase.name} added to ${project.name}` }, tx);
    return phase;
  });
}

async function getPhaseRow(ctx: AuthContext, phaseId: string) {
  const phase = await db.phase.findFirst({ where: { id: phaseId, workspaceId: ctx.workspaceId, deletedAt: null } });
  if (!phase) throw notFound("Phase");
  await assertProjectAccess(ctx, phase.projectId);
  return phase;
}

export async function updatePhase(ctx: AuthContext, phaseId: string, input: z.input<typeof phaseUpdateSchema>) {
  requirePermission(ctx, "phase.edit");
  const data = phaseUpdateSchema.parse(input);
  const existing = await getPhaseRow(ctx, phaseId);
  const start = data.startDate !== undefined ? data.startDate : toISODate(existing.startDate);
  const end = data.endDate !== undefined ? data.endDate : toISODate(existing.endDate);
  if (start && end && end < start) throw ruleViolation("End date must be on or after start date");

  if (data.status === "COMPLETED" && existing.status !== "COMPLETED") {
    const open = await db.task.count({ where: { phaseId, deletedAt: null, status: { not: "DONE" } } });
    if (open > 0) throw ruleViolation(`${open} task${open === 1 ? " is" : "s are"} still open in this phase`);
  }

  return db.$transaction(async (tx) => {
    const { dependsOnIds, startDate, endDate, ...rest } = data;
    const phase = await tx.phase.update({ where: { id: phaseId }, data: { ...rest, startDate: toDate(startDate), endDate: toDate(endDate) } });
    if (dependsOnIds) await setDependencies(tx, existing.projectId, phaseId, dependsOnIds);
    const statusChanged = data.status && data.status !== existing.status;
    await recordActivity(
      ctx,
      {
        entityType: "phase",
        entityId: phaseId,
        projectId: existing.projectId,
        action: statusChanged ? "phase.status_changed" : "phase.updated",
        summary: statusChanged ? `Phase ${phase.name} moved to ${PHASE_STATUS[data.status!].label}` : `Phase ${phase.name} updated`,
      },
      tx,
    );
    return phase;
  });
}

export async function movePhase(ctx: AuthContext, phaseId: string, direction: "up" | "down") {
  requirePermission(ctx, "phase.edit");
  const phase = await getPhaseRow(ctx, phaseId);
  const neighbour = await db.phase.findFirst({
    where: {
      projectId: phase.projectId,
      deletedAt: null,
      position: direction === "up" ? { lt: phase.position } : { gt: phase.position },
    },
    orderBy: { position: direction === "up" ? "desc" : "asc" },
  });
  if (!neighbour) return;
  await db.$transaction([
    db.phase.update({ where: { id: phase.id }, data: { position: neighbour.position } }),
    db.phase.update({ where: { id: neighbour.id }, data: { position: phase.position } }),
  ]);
}

export async function deletePhase(ctx: AuthContext, phaseId: string) {
  requirePermission(ctx, "phase.edit");
  const phase = await getPhaseRow(ctx, phaseId);
  const [tasks, features] = await Promise.all([
    db.task.count({ where: { phaseId, deletedAt: null } }),
    db.feature.count({ where: { phaseId, deletedAt: null } }),
  ]);
  if (tasks + features > 0) throw ruleViolation("Move or delete this phase's features and tasks before deleting it");
  await db.$transaction(async (tx) => {
    await tx.phase.update({ where: { id: phaseId }, data: { deletedAt: new Date() } });
    await tx.phaseDependency.deleteMany({ where: { OR: [{ phaseId }, { dependsOnId: phaseId }] } });
    await recordActivity(ctx, { entityType: "phase", entityId: phaseId, projectId: phase.projectId, action: "phase.deleted", summary: `Phase ${phase.name} deleted` }, tx);
  });
}
