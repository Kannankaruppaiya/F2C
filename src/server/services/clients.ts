import "server-only";
import type { ClientStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/server/db";
import { can, requirePermission, type AuthContext } from "@/server/authz/context";
import { notFound, ruleViolation } from "@/server/errors";
import { clientCreateSchema, clientUpdateSchema, contactSchema } from "@/server/validation/schemas";
import { ACTIVE_PROJECT_STATUSES } from "@/lib/status";
import { loadProjectSummaries, type ProjectSummary } from "./metrics";
import { recordActivity } from "./activity";

export interface ClientRow {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  status: ClientStatus;
  activeProjects: number;
  totalProjects: number;
  contractValue: number | null;
  paid: number | null;
  outstanding: number | null;
  overdue: number | null;
  lastActivityAt: string | null;
}

export interface ClientListQuery {
  q?: string;
  status?: ClientStatus;
  sort?: "name" | "contractValue" | "outstanding" | "lastActivity";
  dir?: "asc" | "desc";
}

function aggregate(projects: ProjectSummary[]) {
  const active = projects.filter((p) => ACTIVE_PROJECT_STATUSES.includes(p.status)).length;
  const fin = projects.map((p) => p.financials).filter((f) => f !== null);
  const total = (k: "contractValue" | "paid" | "outstanding" | "overdue") =>
    fin.length === projects.length ? fin.reduce((s, f) => s + f[k], 0) : null;
  return {
    activeProjects: active,
    totalProjects: projects.length,
    contractValue: total("contractValue"),
    paid: total("paid"),
    outstanding: total("outstanding"),
    overdue: total("overdue"),
  };
}

export async function listClients(ctx: AuthContext, query: ClientListQuery = {}): Promise<ClientRow[]> {
  requirePermission(ctx, "client.view");
  const where: Prisma.ClientWhereInput = { workspaceId: ctx.workspaceId, deletedAt: null };
  if (query.status) where.status = query.status;
  else where.status = { not: "ARCHIVED" };
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: "insensitive" } },
      { company: { contains: query.q, mode: "insensitive" } },
      { email: { contains: query.q, mode: "insensitive" } },
    ];
  }
  const clients = await db.client.findMany({ where, orderBy: { name: "asc" } });
  if (clients.length === 0) return [];
  const ids = clients.map((c) => c.id);

  const [summaries, lastProjectActivity, lastClientActivity] = await Promise.all([
    loadProjectSummaries(ctx, { clientId: { in: ids } }),
    db.activity.groupBy({
      by: ["projectId"],
      where: { workspaceId: ctx.workspaceId, project: { clientId: { in: ids } } },
      _max: { createdAt: true },
    }),
    db.activity.groupBy({
      by: ["entityId"],
      where: { workspaceId: ctx.workspaceId, entityType: "client", entityId: { in: ids } },
      _max: { createdAt: true },
    }),
  ]);

  const projectClient = new Map(summaries.map((s) => [s.id, s.client.id]));
  const lastByClient = new Map<string, Date>();
  const bump = (clientId: string | undefined, d: Date | null) => {
    if (!clientId || !d) return;
    const cur = lastByClient.get(clientId);
    if (!cur || d > cur) lastByClient.set(clientId, d);
  };
  for (const a of lastProjectActivity) bump(a.projectId ? projectClient.get(a.projectId) : undefined, a._max.createdAt);
  for (const a of lastClientActivity) bump(a.entityId, a._max.createdAt);

  const rows: ClientRow[] = clients.map((c) => ({
    id: c.id,
    name: c.name,
    company: c.company,
    email: c.email,
    status: c.status,
    ...aggregate(summaries.filter((s) => s.client.id === c.id)),
    lastActivityAt: lastByClient.get(c.id)?.toISOString() ?? null,
  }));

  const dir = query.dir === "desc" ? -1 : 1;
  const sort = query.sort ?? "name";
  rows.sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name) * dir;
    if (sort === "lastActivity") return ((a.lastActivityAt ?? "") < (b.lastActivityAt ?? "") ? -1 : 1) * dir;
    return ((a[sort] ?? 0) - (b[sort] ?? 0)) * dir;
  });
  return rows;
}

export async function getClient(ctx: AuthContext, id: string) {
  requirePermission(ctx, "client.view");
  const client = await db.client.findFirst({
    where: { id, workspaceId: ctx.workspaceId, deletedAt: null },
    include: { contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] } },
  });
  if (!client) throw notFound("Client");
  const projects = await loadProjectSummaries(ctx, { clientId: id });
  const [pendingApprovals, changeRequests] = await Promise.all([
    db.approval.count({ where: { clientId: id, workspaceId: ctx.workspaceId, status: "PENDING" } }),
    db.changeRequest.count({
      where: { clientId: id, workspaceId: ctx.workspaceId, deletedAt: null, status: { in: ["PENDING_CLIENT_APPROVAL", "PENDING_INTERNAL_REVIEW"] } },
    }),
  ]);
  return {
    client,
    projects,
    summary: { ...aggregate(projects), pendingApprovals, openChangeRequests: changeRequests },
    canEdit: can(ctx, "client.edit"),
  };
}

export async function listClientOptions(ctx: AuthContext): Promise<{ id: string; name: string }[]> {
  if (!can(ctx, "client.view") && !can(ctx, "project.create")) return [];
  return db.client.findMany({
    where: { workspaceId: ctx.workspaceId, deletedAt: null, status: { not: "ARCHIVED" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function createClient(ctx: AuthContext, input: z.input<typeof clientCreateSchema>) {
  requirePermission(ctx, "client.edit");
  const data = clientCreateSchema.parse(input);
  return db.$transaction(async (tx) => {
    const client = await tx.client.create({ data: { ...data, workspaceId: ctx.workspaceId } });
    await recordActivity(ctx, { entityType: "client", entityId: client.id, action: "client.created", summary: `Client ${client.name} created` }, tx);
    return client;
  });
}

export async function updateClient(ctx: AuthContext, id: string, input: z.input<typeof clientUpdateSchema>) {
  requirePermission(ctx, "client.edit");
  const data = clientUpdateSchema.parse(input);
  const existing = await db.client.findFirst({ where: { id, workspaceId: ctx.workspaceId, deletedAt: null } });
  if (!existing) throw notFound("Client");
  return db.$transaction(async (tx) => {
    const client = await tx.client.update({ where: { id }, data });
    const statusChanged = data.status && data.status !== existing.status;
    await recordActivity(
      ctx,
      {
        entityType: "client",
        entityId: id,
        action: statusChanged ? "client.status_changed" : "client.updated",
        summary: statusChanged ? `Client ${client.name} marked ${data.status!.toLowerCase()}` : `Client ${client.name} updated`,
      },
      tx,
    );
    return client;
  });
}

export async function deleteClient(ctx: AuthContext, id: string) {
  requirePermission(ctx, "client.delete");
  const client = await db.client.findFirst({ where: { id, workspaceId: ctx.workspaceId, deletedAt: null } });
  if (!client) throw notFound("Client");
  const live = await db.project.count({ where: { clientId: id, deletedAt: null } });
  if (live > 0) throw ruleViolation("This client still has projects. Archive the client instead, or remove its projects first.");
  await db.$transaction(async (tx) => {
    await tx.client.update({ where: { id }, data: { deletedAt: new Date(), status: "ARCHIVED" } });
    await recordActivity(ctx, { entityType: "client", entityId: id, action: "client.deleted", summary: `Client ${client.name} deleted` }, tx);
  });
}

async function assertClient(ctx: AuthContext, clientId: string) {
  const c = await db.client.findFirst({ where: { id: clientId, workspaceId: ctx.workspaceId, deletedAt: null }, select: { id: true, name: true } });
  if (!c) throw notFound("Client");
  return c;
}

export async function addContact(ctx: AuthContext, clientId: string, input: z.input<typeof contactSchema>) {
  requirePermission(ctx, "client.edit");
  const data = contactSchema.parse(input);
  const client = await assertClient(ctx, clientId);
  return db.$transaction(async (tx) => {
    if (data.isPrimary) await tx.clientContact.updateMany({ where: { clientId }, data: { isPrimary: false } });
    const contact = await tx.clientContact.create({ data: { ...data, clientId, workspaceId: ctx.workspaceId } });
    await recordActivity(ctx, { entityType: "client", entityId: clientId, action: "contact.added", summary: `Contact ${contact.name} added to ${client.name}` }, tx);
    return contact;
  });
}

export async function removeContact(ctx: AuthContext, contactId: string) {
  requirePermission(ctx, "client.edit");
  const contact = await db.clientContact.findFirst({ where: { id: contactId, workspaceId: ctx.workspaceId }, include: { client: true } });
  if (!contact) throw notFound("Contact");
  await db.$transaction(async (tx) => {
    await tx.clientContact.delete({ where: { id: contactId } });
    await recordActivity(ctx, { entityType: "client", entityId: contact.clientId, action: "contact.removed", summary: `Contact ${contact.name} removed from ${contact.client.name}` }, tx);
  });
  return contact.clientId;
}
