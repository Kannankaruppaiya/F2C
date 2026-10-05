import "server-only";
import type { Prisma, TaskStatus } from "@prisma/client";
import { z } from "zod";
import { db, type Tx } from "@/server/db";
import { can, requirePermission, viaProject, type AuthContext } from "@/server/authz/context";
import { forbidden, notFound, ruleViolation } from "@/server/errors";
import { commentSchema, subtaskSchema, taskCreateSchema, taskListQuery, taskUpdateSchema, timeEntrySchema } from "@/server/validation/schemas";
import { OPEN_TASK_STATUSES, PRIORITY, PRIORITY_RANK, TASK_STATUS } from "@/lib/status";
import { addDays, parseISODate, todayISO, toISODate } from "@/lib/dates";
import { assertProjectAccess } from "./projects";
import { num } from "./metrics";
import { nextNumber, recordActivity } from "./activity";

export const taskKey = (n: number) => `T-${n}`;

const listInclude = {
  project: { select: { id: true, name: true, code: true } },
  phase: { select: { id: true, name: true } },
  feature: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true, avatarColor: true } },
  _count: { select: { subtasks: true, comments: true } },
} satisfies Prisma.TaskInclude;

type TaskWithList = Prisma.TaskGetPayload<{ include: typeof listInclude }>;

function toRow(t: TaskWithList, actualHours: number) {
  return {
    id: t.id,
    key: taskKey(t.number),
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueDate: toISODate(t.dueDate),
    estimatedHours: num(t.estimatedHours),
    actualHours,
    project: t.project,
    phase: t.phase,
    feature: t.feature,
    assignee: t.assignee,
    blockedReason: t.blockedReason,
    subtaskCount: t._count.subtasks,
    commentCount: t._count.comments,
  };
}

export type TaskRow = ReturnType<typeof toRow>;

async function actualHoursFor(taskIds: string[]) {
  if (taskIds.length === 0) return new Map<string, number>();
  const rows = await db.timeEntry.groupBy({ by: ["taskId"], where: { taskId: { in: taskIds } }, _sum: { hours: true } });
  return new Map(rows.map((r) => [r.taskId!, num(r._sum.hours)]));
}

export async function listTasks(ctx: AuthContext, rawQuery: z.input<typeof taskListQuery> = {}): Promise<TaskRow[]> {
  requirePermission(ctx, "project.view");
  const q = taskListQuery.parse(rawQuery);
  const today = todayISO(ctx.timezone);
  const where: Prisma.TaskWhereInput = { ...viaProject(ctx), deletedAt: null };
  if (q.projectId) where.projectId = q.projectId;
  if (q.phaseId) where.phaseId = q.phaseId;
  if (q.featureId) where.featureId = q.featureId;
  if (q.status) where.status = q.status;
  else if (q.open === "1") where.status = { in: OPEN_TASK_STATUSES };
  if (q.priority) where.priority = q.priority;
  if (q.assigneeId === "me") where.assigneeId = ctx.userId;
  else if (q.assigneeId === "none") where.assigneeId = null;
  else if (q.assigneeId) where.assigneeId = q.assigneeId;
  if (q.due === "overdue") where.dueDate = { lt: parseISODate(today) };
  if (q.due === "today") where.dueDate = parseISODate(today);
  if (q.due === "week") where.dueDate = { gte: parseISODate(today), lte: parseISODate(addDays(today, 7)) };
  if (q.q) {
    const n = Number(q.q.replace(/^t-/i, ""));
    where.OR = [
      { title: { contains: q.q, mode: "insensitive" } },
      ...(Number.isInteger(n) && n > 0 ? [{ number: n }] : []),
    ];
  }
  const tasks = await db.task.findMany({ where, include: listInclude, take: 500 });
  const hours = await actualHoursFor(tasks.map((t) => t.id));
  return tasks
    .map((t) => toRow(t, hours.get(t.id) ?? 0))
    .sort((a, b) => {
      // Overdue & urgent first, then by due date, then priority.
      const ad = a.dueDate ?? "9999-12-31";
      const bd = b.dueDate ?? "9999-12-31";
      if (ad !== bd) return ad < bd ? -1 : 1;
      return PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
    });
}

export async function getTask(ctx: AuthContext, id: string) {
  requirePermission(ctx, "project.view");
  const task = await db.task.findFirst({
    where: { id, ...viaProject(ctx), deletedAt: null },
    include: {
      ...listInclude,
      createdBy: { select: { name: true } },
      changeRequest: { select: { id: true, number: true, title: true } },
      subtasks: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
      comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true, avatarColor: true } } } },
      timeEntries: { orderBy: [{ date: "desc" }, { createdAt: "desc" }], include: { user: { select: { id: true, name: true } } } },
      dependencies: { include: { dependsOn: { select: { id: true, number: true, title: true, status: true } } } },
      dependents: { include: { task: { select: { id: true, number: true, title: true, status: true } } } },
    },
  });
  if (!task) throw notFound("Task");
  const actual = task.timeEntries.reduce((s, e) => s + num(e.hours), 0);
  return {
    ...toRow(task, actual),
    description: task.description,
    acceptanceCriteria: task.acceptanceCriteria,
    createdBy: task.createdBy?.name ?? null,
    createdAt: task.createdAt.toISOString(),
    completedAt: task.completedAt?.toISOString() ?? null,
    changeRequest: task.changeRequest,
    subtasks: task.subtasks.map((s) => ({ id: s.id, title: s.title, isDone: s.isDone })),
    comments: task.comments.map((c) => ({ id: c.id, body: c.body, author: c.author, createdAt: c.createdAt.toISOString() })),
    timeEntries: task.timeEntries.map((e) => ({
      id: e.id,
      date: toISODate(e.date)!,
      hours: num(e.hours),
      description: e.description,
      user: e.user,
      running: e.startedAt !== null && e.endedAt === null,
      startedAt: e.startedAt?.toISOString() ?? null,
    })),
    dependsOn: task.dependencies.map((d) => ({ ...d.dependsOn, key: taskKey(d.dependsOn.number) })),
    blocks: task.dependents.map((d) => ({ ...d.task, key: taskKey(d.task.number) })),
  };
}

export type TaskDetail = Awaited<ReturnType<typeof getTask>>;

async function validateRefs(
  tx: Tx,
  ctx: AuthContext,
  projectId: string,
  refs: { phaseId?: string; featureId?: string | null; assigneeId?: string | null },
) {
  if (refs.phaseId) {
    const phase = await tx.phase.findFirst({ where: { id: refs.phaseId, projectId, deletedAt: null }, select: { id: true } });
    if (!phase) throw ruleViolation("Phase does not belong to this project");
  }
  if (refs.featureId) {
    const feature = await tx.feature.findFirst({ where: { id: refs.featureId, projectId, deletedAt: null }, select: { phaseId: true } });
    if (!feature) throw ruleViolation("Feature does not belong to this project");
    if (refs.phaseId && feature.phaseId !== refs.phaseId) throw ruleViolation("Feature belongs to a different phase");
  }
  if (refs.assigneeId) {
    const member = await tx.workspaceMember.findFirst({
      where: { workspaceId: ctx.workspaceId, userId: refs.assigneeId, role: { not: "CLIENT" } },
      select: { id: true },
    });
    if (!member) throw ruleViolation("Assignee is not a member of this workspace");
    // Assignees must be able to see the project they're working on.
    await tx.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: refs.assigneeId } },
      create: { projectId, userId: refs.assigneeId, workspaceId: ctx.workspaceId },
      update: {},
    });
  }
}

async function setDependencies(tx: Tx, projectId: string, taskId: string, dependsOnIds: string[]) {
  const ids = [...new Set(dependsOnIds.filter((d) => d !== taskId))];
  if (ids.length) {
    const n = await tx.task.count({ where: { id: { in: ids }, projectId, deletedAt: null } });
    if (n !== ids.length) throw ruleViolation("Task dependencies must be tasks in the same project");
    // Reject direct cycles (A depends on B while B depends on A).
    const cycle = await tx.taskDependency.findFirst({ where: { taskId: { in: ids }, dependsOnId: taskId } });
    if (cycle) throw ruleViolation("Circular dependency: one of these tasks already depends on this task");
  }
  await tx.taskDependency.deleteMany({ where: { taskId } });
  if (ids.length) await tx.taskDependency.createMany({ data: ids.map((dependsOnId) => ({ taskId, dependsOnId })) });
}

function canAssign(ctx: AuthContext, assigneeId: string | null | undefined) {
  return assigneeId === undefined || assigneeId === null || assigneeId === ctx.userId || can(ctx, "task.assign");
}

export async function createTask(ctx: AuthContext, input: z.input<typeof taskCreateSchema>) {
  requirePermission(ctx, "task.create");
  const data = taskCreateSchema.parse(input);
  if (!canAssign(ctx, data.assigneeId)) throw forbidden("You can only assign tasks to yourself");
  await assertProjectAccess(ctx, data.projectId);
  return db.$transaction((tx) => createTaskInTx(tx, ctx, data));
}

/**
 * Task creation core, run inside a caller-owned transaction. Shared by the task form and by
 * change-request implementation tasks so both enforce identical rules. Caller must have checked
 * permissions and project access.
 */
export async function createTaskInTx(
  tx: Tx,
  ctx: AuthContext,
  data: z.output<typeof taskCreateSchema> & { changeRequestId?: string | null },
) {
  let phaseId = data.phaseId;
  // A task under a feature always lives in that feature's phase.
  if (data.featureId) {
    const f = await tx.feature.findFirst({ where: { id: data.featureId, projectId: data.projectId, deletedAt: null }, select: { phaseId: true } });
    if (f) phaseId = f.phaseId;
  }
  await validateRefs(tx, ctx, data.projectId, { phaseId, featureId: data.featureId, assigneeId: data.assigneeId });
  const number = await nextNumber(tx, ctx.workspaceId, "task");
  const { dependsOnIds, dueDate, ...rest } = data;
  const task = await tx.task.create({
    data: {
      ...rest,
      phaseId,
      number,
      dueDate: dueDate ? parseISODate(dueDate) : null,
      workspaceId: ctx.workspaceId,
      createdById: ctx.userId,
      completedAt: data.status === "DONE" ? new Date() : null,
    },
  });
  await setDependencies(tx, data.projectId, task.id, dependsOnIds);
  await recordActivity(
    ctx,
    { entityType: "task", entityId: task.id, projectId: data.projectId, action: "task.created", summary: `Task ${taskKey(number)} "${task.title}" created` },
    tx,
  );
  return task;
}

async function getTaskRow(ctx: AuthContext, id: string) {
  const task = await db.task.findFirst({ where: { id, ...viaProject(ctx), deletedAt: null } });
  if (!task) throw notFound("Task");
  return task;
}

async function assertCanComplete(tx: Tx, taskId: string) {
  const open = await tx.taskDependency.findMany({
    where: { taskId, dependsOn: { status: { not: "DONE" }, deletedAt: null } },
    include: { dependsOn: { select: { number: true } } },
  });
  if (open.length > 0) {
    throw ruleViolation(`Waiting on ${open.map((d) => taskKey(d.dependsOn.number)).join(", ")} — complete dependencies first`);
  }
}

export async function updateTask(ctx: AuthContext, id: string, input: z.input<typeof taskUpdateSchema>) {
  requirePermission(ctx, "task.edit");
  const data = taskUpdateSchema.parse(input);
  const existing = await getTaskRow(ctx, id);
  if (data.assigneeId !== undefined && data.assigneeId !== existing.assigneeId && !canAssign(ctx, data.assigneeId)) {
    throw forbidden("You can only assign tasks to yourself");
  }

  return db.$transaction(async (tx) => {
    const phaseId = data.phaseId ?? existing.phaseId;
    let featureId = data.featureId === undefined ? existing.featureId : data.featureId;
    // Moving to another phase detaches the task from a feature in the old phase.
    if (data.phaseId && data.phaseId !== existing.phaseId && data.featureId === undefined) featureId = null;
    await validateRefs(tx, ctx, existing.projectId, { phaseId, featureId, assigneeId: data.assigneeId });
    if (data.status === "DONE" && existing.status !== "DONE") await assertCanComplete(tx, id);

    const { dependsOnIds, dueDate, ...rest } = data;
    const task = await tx.task.update({
      where: { id },
      data: {
        ...rest,
        featureId,
        dueDate: dueDate === undefined ? undefined : dueDate ? parseISODate(dueDate) : null,
        completedAt: data.status ? (data.status === "DONE" ? existing.completedAt ?? new Date() : null) : undefined,
        blockedReason: data.status && data.status !== "BLOCKED" ? null : rest.blockedReason,
      },
    });
    if (dependsOnIds) await setDependencies(tx, existing.projectId, id, dependsOnIds);

    const key = taskKey(task.number);
    const events: { action: string; summary: string }[] = [];
    if (data.status && data.status !== existing.status) {
      events.push({
        action: data.status === "DONE" ? "task.completed" : "task.status_changed",
        summary: data.status === "DONE" ? `Task ${key} "${task.title}" completed` : `Task ${key} moved to ${TASK_STATUS[data.status].label}`,
      });
    }
    if (data.assigneeId !== undefined && data.assigneeId !== existing.assigneeId) {
      const user = data.assigneeId ? await tx.user.findUnique({ where: { id: data.assigneeId }, select: { name: true } }) : null;
      events.push({ action: "task.assigned", summary: user ? `Task ${key} assigned to ${user.name}` : `Task ${key} unassigned` });
      if (data.assigneeId && data.assigneeId !== ctx.userId) {
        await tx.notification.create({
          data: {
            workspaceId: ctx.workspaceId,
            userId: data.assigneeId,
            kind: "task.assigned",
            title: `${ctx.userName} assigned you ${key}`,
            body: task.title,
            href: `/tasks/${task.id}`,
          },
        });
      }
    }
    if (data.priority && data.priority !== existing.priority) {
      events.push({ action: "task.priority_changed", summary: `Task ${key} priority set to ${PRIORITY[data.priority].label}` });
    }
    if (events.length === 0) events.push({ action: "task.updated", summary: `Task ${key} updated` });
    for (const e of events) {
      await recordActivity(ctx, { entityType: "task", entityId: id, projectId: existing.projectId, ...e }, tx);
    }
    return task;
  });
}

export async function setTaskStatus(ctx: AuthContext, id: string, status: TaskStatus) {
  return updateTask(ctx, id, { status });
}

export async function deleteTask(ctx: AuthContext, id: string) {
  requirePermission(ctx, "task.delete");
  const task = await getTaskRow(ctx, id);
  await db.$transaction(async (tx) => {
    await tx.task.update({ where: { id }, data: { deletedAt: new Date() } });
    await tx.taskDependency.deleteMany({ where: { OR: [{ taskId: id }, { dependsOnId: id }] } });
    await recordActivity(ctx, { entityType: "task", entityId: id, projectId: task.projectId, action: "task.deleted", summary: `Task ${taskKey(task.number)} deleted` }, tx);
  });
  return task.projectId;
}

// ─── Subtasks & comments ───

export async function addSubtask(ctx: AuthContext, taskId: string, input: z.input<typeof subtaskSchema>) {
  requirePermission(ctx, "task.edit");
  const { title } = subtaskSchema.parse(input);
  await getTaskRow(ctx, taskId);
  const last = await db.subtask.aggregate({ where: { taskId }, _max: { position: true } });
  return db.subtask.create({ data: { taskId, title, workspaceId: ctx.workspaceId, position: (last._max.position ?? 0) + 1 } });
}

export async function toggleSubtask(ctx: AuthContext, subtaskId: string) {
  requirePermission(ctx, "task.edit");
  const s = await db.subtask.findFirst({ where: { id: subtaskId, workspaceId: ctx.workspaceId } });
  if (!s) throw notFound("Subtask");
  await getTaskRow(ctx, s.taskId);
  await db.subtask.update({ where: { id: subtaskId }, data: { isDone: !s.isDone } });
  return s.taskId;
}

export async function deleteSubtask(ctx: AuthContext, subtaskId: string) {
  requirePermission(ctx, "task.edit");
  const s = await db.subtask.findFirst({ where: { id: subtaskId, workspaceId: ctx.workspaceId } });
  if (!s) throw notFound("Subtask");
  await getTaskRow(ctx, s.taskId);
  await db.subtask.delete({ where: { id: subtaskId } });
  return s.taskId;
}

export async function addComment(ctx: AuthContext, taskId: string, input: z.input<typeof commentSchema>) {
  requirePermission(ctx, "task.edit");
  const { body } = commentSchema.parse(input);
  const task = await getTaskRow(ctx, taskId);
  return db.$transaction(async (tx) => {
    const c = await tx.taskComment.create({ data: { taskId, body, authorId: ctx.userId, workspaceId: ctx.workspaceId } });
    await recordActivity(ctx, { entityType: "task", entityId: taskId, projectId: task.projectId, action: "task.commented", summary: `Comment on ${taskKey(task.number)}` }, tx);
    if (task.assigneeId && task.assigneeId !== ctx.userId) {
      await tx.notification.create({
        data: {
          workspaceId: ctx.workspaceId,
          userId: task.assigneeId,
          kind: "task.commented",
          title: `${ctx.userName} commented on ${taskKey(task.number)}`,
          body: body.slice(0, 140),
          href: `/tasks/${taskId}`,
        },
      });
    }
    return c;
  });
}

// ─── Time tracking ───

export async function getRunningTimer(ctx: AuthContext) {
  const entry = await db.timeEntry.findFirst({
    where: { workspaceId: ctx.workspaceId, userId: ctx.userId, startedAt: { not: null }, endedAt: null },
    include: { task: { select: { id: true, number: true, title: true } }, project: { select: { name: true } } },
  });
  if (!entry) return null;
  return {
    id: entry.id,
    startedAt: entry.startedAt!.toISOString(),
    task: entry.task ? { id: entry.task.id, key: taskKey(entry.task.number), title: entry.task.title } : null,
    projectName: entry.project.name,
  };
}

async function stopRunning(tx: Tx, ctx: AuthContext) {
  const running = await tx.timeEntry.findMany({ where: { workspaceId: ctx.workspaceId, userId: ctx.userId, startedAt: { not: null }, endedAt: null } });
  const now = new Date();
  for (const r of running) {
    const hrs = Math.min(24, Math.max(0.01, (now.getTime() - r.startedAt!.getTime()) / 3_600_000));
    await tx.timeEntry.update({ where: { id: r.id }, data: { endedAt: now, hours: Math.round(hrs * 100) / 100 } });
  }
  return running;
}

export async function startTimer(ctx: AuthContext, taskId: string) {
  requirePermission(ctx, "time.log");
  const task = await getTaskRow(ctx, taskId);
  return db.$transaction(async (tx) => {
    await stopRunning(tx, ctx);
    const entry = await tx.timeEntry.create({
      data: {
        workspaceId: ctx.workspaceId,
        projectId: task.projectId,
        phaseId: task.phaseId,
        featureId: task.featureId,
        taskId,
        userId: ctx.userId,
        date: parseISODate(todayISO(ctx.timezone)),
        startedAt: new Date(),
      },
    });
    if (task.status === "TODO" || task.status === "BACKLOG") {
      await tx.task.update({ where: { id: taskId }, data: { status: "IN_PROGRESS" } });
      await recordActivity(ctx, { entityType: "task", entityId: taskId, projectId: task.projectId, action: "task.status_changed", summary: `Task ${taskKey(task.number)} moved to In Progress` }, tx);
    }
    return entry;
  });
}

export async function stopTimer(ctx: AuthContext) {
  requirePermission(ctx, "time.log");
  return db.$transaction(async (tx) => {
    const stopped = await stopRunning(tx, ctx);
    for (const s of stopped) {
      await recordActivity(ctx, { entityType: "time_entry", entityId: s.id, projectId: s.projectId, action: "time.logged", summary: `${ctx.userName} stopped a timer` }, tx);
    }
    return stopped.map((s) => s.taskId);
  });
}

export async function logTime(ctx: AuthContext, input: z.input<typeof timeEntrySchema>) {
  requirePermission(ctx, "time.log");
  const data = timeEntrySchema.parse(input);
  await assertProjectAccess(ctx, data.projectId);
  let task: { id: string; phaseId: string; featureId: string | null; number: number } | null = null;
  if (data.taskId) {
    task = await db.task.findFirst({ where: { id: data.taskId, projectId: data.projectId, deletedAt: null }, select: { id: true, phaseId: true, featureId: true, number: true } });
    if (!task) throw ruleViolation("Task does not belong to this project");
  }
  if (data.date > todayISO(ctx.timezone)) throw ruleViolation("Time cannot be logged in the future");
  return db.$transaction(async (tx) => {
    const entry = await tx.timeEntry.create({
      data: {
        workspaceId: ctx.workspaceId,
        projectId: data.projectId,
        phaseId: task?.phaseId ?? null,
        featureId: task?.featureId ?? null,
        taskId: task?.id ?? null,
        userId: ctx.userId,
        date: parseISODate(data.date),
        hours: data.hours,
        description: data.description,
      },
    });
    await recordActivity(
      ctx,
      {
        entityType: "time_entry",
        entityId: entry.id,
        projectId: data.projectId,
        action: "time.logged",
        summary: `${data.hours}h logged${task ? ` on ${taskKey(task.number)}` : ""}`,
      },
      tx,
    );
    return entry;
  });
}
