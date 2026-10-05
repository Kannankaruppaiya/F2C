import "server-only";
import { db } from "@/server/db";
import type { AuthContext } from "@/server/authz/context";
import { assertProjectAccess, listProjectOptions, listTeamMembers } from "@/server/services/projects";
import { taskKey } from "@/server/services/tasks";
import type { TaskFormOptions } from "./task-form";

/** Options for the task form, scoped to projects the caller can see. */
export async function loadTaskFormOptions(ctx: AuthContext, projectId: string | null, excludeTaskId?: string): Promise<TaskFormOptions> {
  const [projects, team] = await Promise.all([listProjectOptions(ctx), listTeamMembers(ctx)]);
  if (!projectId) return { projects, team, phases: [], features: [], tasks: [] };
  await assertProjectAccess(ctx, projectId);
  const [phases, features, tasks] = await Promise.all([
    db.phase.findMany({ where: { projectId, deletedAt: null }, orderBy: { position: "asc" }, select: { id: true, name: true } }),
    db.feature.findMany({ where: { projectId, deletedAt: null }, orderBy: { position: "asc" }, select: { id: true, name: true, phaseId: true } }),
    db.task.findMany({ where: { projectId, deletedAt: null, ...(excludeTaskId ? { id: { not: excludeTaskId } } : {}) }, orderBy: { number: "asc" }, select: { id: true, number: true, title: true } }),
  ]);
  return { projects, team, phases, features, tasks: tasks.map((t) => ({ id: t.id, key: taskKey(t.number), title: t.title })) };
}
