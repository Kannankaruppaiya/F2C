import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { changeRequestScope, type AuthContext } from "@/server/authz/context";
import { CR_IN_SCOPE } from "@/server/domain/change-requests";
import { assertProjectAccess } from "./projects";
import { crKey } from "./change-requests";
import { num } from "./metrics";

/**
 * Scope protection (docs/ARCHITECTURE.md §10.6): original scope vs approved changes vs current.
 * Computed from live rows so increased effort is always explainable.
 */
export async function getScopeSummary(ctx: AuthContext, projectId: string) {
  await assertProjectAccess(ctx, projectId);
  const [features, crs] = await Promise.all([
    db.feature.findMany({
      where: { projectId, deletedAt: null, status: { not: "REJECTED" } },
      select: { id: true, name: true, estimatedHours: true, changeRequestId: true, changeRequest: { select: { status: true } } },
    }),
    db.changeRequest.findMany({
      where: { AND: [changeRequestScope(ctx), { projectId }] },
      select: { id: true, number: true, title: true, status: true, estimatedHours: true, additionalCost: true },
      orderBy: { number: "asc" },
    }),
  ]);
  const original = features.filter((f) => !f.changeRequestId);
  const added = features.filter((f) => f.changeRequest && CR_IN_SCOPE.includes(f.changeRequest.status));
  const approved = crs.filter((c) => CR_IN_SCOPE.includes(c.status));
  const pending = crs.filter((c) => c.status === "PENDING_CLIENT_APPROVAL");
  const sum = (xs: { estimatedHours: Prisma.Decimal }[]) => xs.reduce((s, x) => s + num(x.estimatedHours), 0);
  return {
    original: { features: original.length, hours: sum(original) },
    approvedChanges: {
      features: added.length,
      changeRequests: approved.length,
      hours: sum(approved),
      cost: approved.reduce((s, c) => s + num(c.additionalCost), 0),
      items: approved.map((c) => ({ id: c.id, key: crKey(c.number), title: c.title, hours: num(c.estimatedHours), cost: num(c.additionalCost), status: c.status })),
    },
    pendingChanges: { changeRequests: pending.length, hours: sum(pending), cost: pending.reduce((s, c) => s + num(c.additionalCost), 0) },
    rejectedChanges: crs.filter((c) => c.status === "REJECTED").length,
    current: { features: original.length + added.length, hours: sum(original) + sum(approved) },
  };
}

export type ScopeSummary = Awaited<ReturnType<typeof getScopeSummary>>;
