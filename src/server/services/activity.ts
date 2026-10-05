import "server-only";
import type { Prisma } from "@prisma/client";
import { db, type Tx } from "@/server/db";
import type { AuthContext } from "@/server/authz/context";
import { can, projectScope } from "@/server/authz/context";

export interface ActivityInput {
  entityType: string;
  entityId: string;
  action: string;
  summary: string;
  projectId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/** Append an audit record. There is intentionally no update/delete counterpart. */
export async function recordActivity(ctx: AuthContext, input: ActivityInput, tx: Tx = db): Promise<void> {
  await tx.activity.create({
    data: {
      workspaceId: ctx.workspaceId,
      actorId: ctx.userId,
      projectId: input.projectId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      summary: input.summary,
      metadata: input.metadata,
    },
  });
}

/** Atomically allocate the next human-readable sequence number (TASK-112, CR-014). */
export async function nextNumber(tx: Tx, workspaceId: string, key: string): Promise<number> {
  const row = await tx.workspaceCounter.upsert({
    where: { workspaceId_key: { workspaceId, key } },
    create: { workspaceId, key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return row.value;
}

export interface ActivityItem {
  id: string;
  summary: string;
  action: string;
  entityType: string;
  entityId: string;
  actorName: string | null;
  projectId: string | null;
  projectName: string | null;
  createdAt: string;
}

export async function listActivity(
  ctx: AuthContext,
  opts: { projectId?: string; clientId?: string; entity?: { type: string; id: string }; limit?: number } = {},
): Promise<ActivityItem[]> {
  const where: Prisma.ActivityWhereInput = { workspaceId: ctx.workspaceId };
  if (opts.projectId) where.projectId = opts.projectId;
  if (opts.entity) Object.assign(where, { entityType: opts.entity.type, entityId: opts.entity.id });
  if (opts.clientId) {
    where.OR = [{ project: { clientId: opts.clientId } }, { entityType: "client", entityId: opts.clientId }];
  }
  // Non workspace-wide roles only see activity for projects they can see.
  if (!can(ctx, "audit.view")) where.project = projectScope(ctx);
  // Financial events are hidden from roles without finance access.
  if (!can(ctx, "finance.view")) {
    const financial = ["invoice", "payment", "expense"];
    if (opts.entity) {
      if (financial.includes(opts.entity.type)) return [];
    } else {
      where.entityType = { notIn: financial };
    }
  }

  const rows = await db.activity.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 30,
    include: { actor: { select: { name: true } }, project: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    summary: r.summary,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    actorName: r.actor?.name ?? null,
    projectId: r.projectId,
    projectName: r.project?.name ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}
