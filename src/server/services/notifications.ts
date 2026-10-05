import "server-only";
import { db, type Tx } from "@/server/db";
import type { AuthContext } from "@/server/authz/context";

export async function listNotifications(ctx: AuthContext, limit = 20) {
  const [items, unread] = await Promise.all([
    db.notification.findMany({
      where: { workspaceId: ctx.workspaceId, userId: ctx.userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    db.notification.count({ where: { workspaceId: ctx.workspaceId, userId: ctx.userId, readAt: null } }),
  ]);
  return {
    unread,
    items: items.map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      href: n.href,
      read: n.readAt !== null,
      createdAt: n.createdAt.toISOString(),
    })),
  };
}

export type NotificationList = Awaited<ReturnType<typeof listNotifications>>;

/** Marks the given notifications (or all, when ids is omitted) as read for the caller only. */
export async function markNotificationsRead(ctx: AuthContext, ids?: string[]) {
  await db.notification.updateMany({
    where: { workspaceId: ctx.workspaceId, userId: ctx.userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
}

/** In-app notifications (email delivery is a later phase). Never notifies the actor themself. */
export async function notify(
  tx: Tx,
  ctx: AuthContext,
  userIds: (string | null | undefined)[],
  n: { kind: string; title: string; body?: string | null; href?: string | null },
): Promise<void> {
  const recipients = [...new Set(userIds.filter((u): u is string => !!u && u !== ctx.userId))];
  if (recipients.length === 0) return;
  await tx.notification.createMany({
    data: recipients.map((userId) => ({ workspaceId: ctx.workspaceId, userId, kind: n.kind, title: n.title, body: n.body ?? null, href: n.href ?? null })),
  });
}
