// Centralized RBAC. Client-safe (no server imports) so the UI can hide controls
// using the same map — but every service re-checks on the server.
import type { Role } from "@prisma/client";

export const PERMISSIONS = [
  "project.view",
  "project.create",
  "project.edit",
  "project.delete",
  "client.view",
  "client.edit",
  "client.delete",
  "phase.edit",
  "feature.edit",
  "task.create",
  "task.edit",
  "task.assign",
  "task.delete",
  "bug.create",
  "bug.edit",
  "document.upload",
  "document.approve",
  "changeRequest.manage",
  "finance.view",
  "invoice.create",
  "payment.record",
  "expense.manage",
  "time.log",
  "time.viewAll",
  "users.manage",
  "audit.view",
  "settings.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const DELIVERY: Permission[] = ["project.view", "task.create", "task.edit", "bug.create", "bug.edit", "document.upload", "time.log"];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: PERMISSIONS,
  ADMIN: PERMISSIONS.filter((p) => p !== "document.approve"),
  PROJECT_MANAGER: [
    ...DELIVERY,
    "project.create",
    "project.edit",
    "client.view",
    "client.edit",
    "phase.edit",
    "feature.edit",
    "task.assign",
    "task.delete",
    "changeRequest.manage",
    "finance.view",
    "time.viewAll",
  ],
  DEVELOPER: DELIVERY,
  DESIGNER: DELIVERY,
  QA: DELIVERY,
  FINANCE: ["project.view", "client.view", "finance.view", "invoice.create", "payment.record", "expense.manage", "time.viewAll"],
  CLIENT: ["project.view", "bug.create", "document.approve"],
};

const sets = Object.fromEntries(
  Object.entries(ROLE_PERMISSIONS).map(([role, perms]) => [role, new Set(perms)]),
) as Record<Role, Set<Permission>>;

export function roleHas(role: Role | null | undefined, permission: Permission): boolean {
  return !!role && sets[role].has(permission);
}

/** Roles that see every project in the workspace (others are scoped by membership / client). */
export const WORKSPACE_WIDE_ROLES: Role[] = ["OWNER", "ADMIN", "PROJECT_MANAGER", "FINANCE"];
