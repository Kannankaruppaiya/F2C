import "server-only";
import { cache } from "react";
import type { Prisma, Role } from "@prisma/client";
import { getCurrentSession } from "@/server/auth/session";
import { AppError, forbidden } from "@/server/errors";
import { roleHas, WORKSPACE_WIDE_ROLES, type Permission } from "./permissions";

/** Everything a service needs to authorize and scope a request. */
export interface AuthContext {
  userId: string;
  userName: string;
  workspaceId: string;
  role: Role;
  clientId: string | null;
  timezone: string;
  currency: string;
  locale: string;
}

/** Memoized per request, so services called with it can themselves be request-memoized. */
export const getAuthContext = cache(async (): Promise<AuthContext> => {
  const s = await getCurrentSession();
  if (!s) throw new AppError("UNAUTHENTICATED", "Sign in required");
  if (!s.workspace || !s.role) throw new AppError("FORBIDDEN", "No workspace membership");
  return {
    userId: s.user.id,
    userName: s.user.name,
    workspaceId: s.workspace.id,
    role: s.role,
    clientId: s.clientId,
    timezone: s.workspace.timezone,
    currency: s.workspace.currency,
    locale: s.workspace.locale,
  };
});

export function can(ctx: AuthContext, permission: Permission): boolean {
  return roleHas(ctx.role, permission);
}

export function requirePermission(ctx: AuthContext, permission: Permission): void {
  if (!can(ctx, permission)) throw forbidden();
}

/**
 * Row-level scope for projects. Every project query in the service layer goes through this,
 * so tenant isolation and per-role visibility are enforced in one place.
 */
export function projectScope(ctx: AuthContext): Prisma.ProjectWhereInput {
  const base: Prisma.ProjectWhereInput = { workspaceId: ctx.workspaceId, deletedAt: null };
  if (WORKSPACE_WIDE_ROLES.includes(ctx.role)) return base;
  if (ctx.role === "CLIENT") return { ...base, clientId: ctx.clientId ?? "__none__" };
  return { ...base, members: { some: { userId: ctx.userId } } };
}

/** Child-row scope: records whose project is visible to the caller. */
export function viaProject(ctx: AuthContext): { workspaceId: string; project: Prisma.ProjectWhereInput } {
  return { workspaceId: ctx.workspaceId, project: projectScope(ctx) };
}

// ─── Phase 3 row scopes (docs/ARCHITECTURE.md §10.7) ───

const NO_CLIENT = "__none__";

/**
 * Documents visible to the caller. Clients see only non-archived documents of their client
 * (directly or via a project) that have at least one version shared with them.
 */
export function documentScope(ctx: AuthContext): Prisma.DocumentWhereInput {
  const base: Prisma.DocumentWhereInput = { workspaceId: ctx.workspaceId, deletedAt: null };
  if (WORKSPACE_WIDE_ROLES.includes(ctx.role)) return base;
  if (ctx.role === "CLIENT") {
    const clientId = ctx.clientId ?? NO_CLIENT;
    return {
      ...base,
      status: { not: "ARCHIVED" },
      versions: { some: { sharedAt: { not: null } } },
      OR: [{ project: { ...projectScope(ctx) } }, { clientId }],
    };
  }
  // Delivery roles: project documents of projects they belong to (no client-level documents).
  return { ...base, project: projectScope(ctx) };
}

/** Versions of a visible document the caller may see/download. Clients: shared versions only. */
export function versionScope(ctx: AuthContext): Prisma.DocumentVersionWhereInput {
  return ctx.role === "CLIENT" ? { sharedAt: { not: null } } : {};
}

/** Approvals visible to the caller: those on projects in scope (clients: their client's projects). */
export function approvalScope(ctx: AuthContext): Prisma.ApprovalWhereInput {
  return { workspaceId: ctx.workspaceId, project: projectScope(ctx) };
}

/** Change requests visible to the caller. Clients: ones they raised, or ones sent to them. */
export function changeRequestScope(ctx: AuthContext): Prisma.ChangeRequestWhereInput {
  const base: Prisma.ChangeRequestWhereInput = { workspaceId: ctx.workspaceId, deletedAt: null, project: projectScope(ctx) };
  if (ctx.role !== "CLIENT") return base;
  return { ...base, OR: [{ requestedById: ctx.userId }, { submittedAt: { not: null } }] };
}
