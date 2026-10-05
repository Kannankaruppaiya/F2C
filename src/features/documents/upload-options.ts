import "server-only";
import { db } from "@/server/db";
import { can, projectScope, type AuthContext } from "@/server/authz/context";
import { WORKSPACE_WIDE_ROLES } from "@/server/authz/permissions";
import { maxUploadBytes } from "@/server/storage/config";
import type { UploadProjectOption } from "./upload-dialog";

/** Projects (with phases) and clients the caller may upload documents to. */
export async function loadUploadOptions(ctx: AuthContext): Promise<{ projects: UploadProjectOption[]; clients: { id: string; name: string }[]; maxMb: number; canUpload: boolean; canShare: boolean }> {
  const canUpload = ctx.role !== "CLIENT" && can(ctx, "document.upload");
  if (!canUpload) return { projects: [], clients: [], maxMb: 0, canUpload, canShare: false };
  const [projects, clients] = await Promise.all([
    db.project.findMany({
      where: { AND: [projectScope(ctx), { status: { not: "CANCELLED" } }] },
      select: { id: true, name: true, phases: { where: { deletedAt: null }, orderBy: { position: "asc" }, select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    }),
    WORKSPACE_WIDE_ROLES.includes(ctx.role)
      ? db.client.findMany({ where: { workspaceId: ctx.workspaceId, deletedAt: null, status: { not: "ARCHIVED" } }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);
  return { projects, clients, maxMb: Math.round(maxUploadBytes() / 1024 / 1024), canUpload, canShare: can(ctx, "document.manage") };
}
