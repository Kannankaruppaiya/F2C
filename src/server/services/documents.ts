import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma, type DocumentCategory, type DocumentStatus } from "@prisma/client";
import { z } from "zod";
import { db, type Tx } from "@/server/db";
import { can, documentScope, projectScope, requirePermission, versionScope, type AuthContext } from "@/server/authz/context";
import { WORKSPACE_WIDE_ROLES } from "@/server/authz/permissions";
import { AppError, forbidden, notFound, ruleViolation } from "@/server/errors";
import { documentCreateSchema, documentListQuery, documentUpdateSchema, versionUploadSchema } from "@/server/validation/schemas";
import { getStorage, sha256 } from "@/server/storage";
import { documentVersionKey } from "@/server/storage/keys";
import { maxUploadBytes, signedUrlTtl } from "@/server/storage/config";
import { ALLOWED_TYPES, validateUpload } from "@/server/storage/validate";
import { logger } from "@/server/logger";
import { DOCUMENT_CATEGORY } from "@/lib/status";
import { recordActivity } from "./activity";
import { notify } from "./notifications";

export interface UploadedFile {
  name: string;
  type: string;
  bytes: Buffer;
}

const label = (name: string, v: number) => `${name} v${v}`;

/** Generated id usable inside a storage key before the row exists (lowercase alphanumeric). */
function newDocumentId(): string {
  return `d${randomUUID().replace(/-/g, "")}`;
}

function checkFile(file: UploadedFile) {
  const result = validateUpload({ filename: file.name, declaredMime: file.type, bytes: file.bytes, maxBytes: maxUploadBytes() });
  if (!result.ok) throw new AppError("VALIDATION", result.error.message, { file: [result.error.message] });
  return result;
}

/** Writes the blob first; if the DB work fails the blob is removed (compensation). */
async function withStoredBlob<T>(key: string, file: UploadedFile, mimeType: string, work: () => Promise<T>): Promise<T> {
  const storage = getStorage();
  await storage.put(key, file.bytes, mimeType);
  try {
    return await work();
  } catch (e) {
    await storage.delete(key).catch((err) => logger.error("storage.orphan", { key, error: String(err) }));
    throw e;
  }
}

/** Client users of the client that owns a project or a client-level document. */
export async function clientUserIds(tx: Tx, workspaceId: string, clientId: string): Promise<string[]> {
  const rows = await tx.workspaceMember.findMany({ where: { workspaceId, clientId, role: "CLIENT" }, select: { userId: true } });
  return rows.map((r) => r.userId);
}

async function ownerClientId(tx: Tx, doc: { projectId: string | null; clientId: string | null }): Promise<string | null> {
  if (doc.clientId) return doc.clientId;
  if (!doc.projectId) return null;
  const p = await tx.project.findUnique({ where: { id: doc.projectId }, select: { clientId: true } });
  return p?.clientId ?? null;
}

// ─── Queries ───

export type DocumentListQuery = z.input<typeof documentListQuery>;

export async function listDocuments(ctx: AuthContext, raw: DocumentListQuery = {}) {
  requirePermission(ctx, "project.view");
  const q = documentListQuery.parse(raw);
  const where: Prisma.DocumentWhereInput = { AND: [documentScope(ctx)] };
  const and = where.AND as Prisma.DocumentWhereInput[];
  if (q.status) and.push({ status: q.status });
  else and.push({ status: { not: "ARCHIVED" } });
  if (q.category) and.push({ category: q.category });
  if (q.projectId) and.push({ projectId: q.projectId });
  if (q.phaseId) and.push({ phaseId: q.phaseId });
  if (q.clientId) and.push({ OR: [{ clientId: q.clientId }, { project: { clientId: q.clientId } }] });
  if (q.q) and.push({ OR: [{ name: { contains: q.q, mode: "insensitive" } }, { description: { contains: q.q, mode: "insensitive" } }] });

  const dir = q.dir ?? (q.sort === "updated" ? "desc" : "asc");
  const orderBy: Prisma.DocumentOrderByWithRelationInput = q.sort === "name" ? { name: dir } : q.sort === "category" ? { category: dir } : { updatedAt: dir };

  const rows = await db.document.findMany({
    where,
    orderBy,
    take: 500,
    include: {
      project: { select: { id: true, name: true } },
      client: { select: { id: true, name: true } },
      phase: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      versions: { where: versionScope(ctx), orderBy: { versionNumber: "desc" }, take: 1, select: { id: true, versionNumber: true, createdAt: true, originalFilename: true, mimeType: true, fileSize: true, uploadedBy: { select: { name: true } } } },
      _count: { select: { versions: { where: versionScope(ctx) }, approvals: { where: { status: "PENDING" } } } },
    },
  });
  return rows.map((d) => {
    const latest = d.versions[0] ?? null;
    return {
      id: d.id,
      name: d.name,
      category: d.category,
      status: d.status,
      project: d.project,
      client: d.client,
      phase: d.phase,
      owner: d.createdBy?.name ?? latest?.uploadedBy?.name ?? null,
      currentVersion: latest ? { id: latest.id, number: latest.versionNumber, filename: latest.originalFilename, mimeType: latest.mimeType, size: latest.fileSize } : null,
      versionCount: d._count.versions,
      pendingApprovals: d._count.approvals,
      updatedAt: (latest && latest.createdAt > d.updatedAt ? latest.createdAt : d.updatedAt).toISOString(),
    };
  });
}

export type DocumentRow = Awaited<ReturnType<typeof listDocuments>>[number];

async function findDocument(ctx: AuthContext, id: string) {
  const doc = await db.document.findFirst({ where: { AND: [documentScope(ctx), { id }] } });
  if (!doc) throw notFound("Document");
  return doc;
}

export async function getDocument(ctx: AuthContext, id: string) {
  requirePermission(ctx, "project.view");
  const doc = await db.document.findFirst({
    where: { AND: [documentScope(ctx), { id }] },
    include: {
      project: { select: { id: true, name: true, clientId: true } },
      client: { select: { id: true, name: true } },
      phase: { select: { id: true, name: true } },
      feature: { select: { id: true, name: true } },
      changeRequest: { select: { id: true, number: true, title: true } },
      createdBy: { select: { name: true } },
      versions: { where: versionScope(ctx), orderBy: { versionNumber: "desc" }, include: { uploadedBy: { select: { name: true } } } },
    },
  });
  if (!doc) throw notFound("Document");
  const approvals = await db.approval.findMany({
    where: { documentId: doc.id, workspaceId: ctx.workspaceId, ...(ctx.role === "CLIENT" ? { documentVersion: { sharedAt: { not: null } } } : {}) },
    orderBy: { requestedAt: "desc" },
    include: { documentVersion: { select: { versionNumber: true } }, requester: { select: { name: true } }, approver: { select: { name: true } } },
  });
  const current = ctx.role === "CLIENT" ? (doc.versions[0] ?? null) : (doc.versions.find((v) => v.id === doc.currentVersionId) ?? doc.versions[0] ?? null);
  const pending = approvals.some((a) => a.status === "PENDING" && a.documentVersionId === current?.id);
  const internal = ctx.role !== "CLIENT";
  return {
    id: doc.id,
    name: doc.name,
    description: doc.description,
    category: doc.category,
    status: doc.status,
    project: doc.project ? { id: doc.project.id, name: doc.project.name } : null,
    client: doc.client,
    clientId: doc.client?.id ?? doc.project?.clientId ?? null,
    phase: doc.phase,
    feature: doc.feature,
    changeRequest: doc.changeRequest,
    createdBy: doc.createdBy?.name ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    currentVersionId: current?.id ?? null,
    versions: doc.versions.map((v) => ({
      id: v.id,
      number: v.versionNumber,
      filename: v.originalFilename,
      mimeType: v.mimeType,
      size: v.fileSize,
      checksum: v.checksum,
      changeSummary: v.changeSummary,
      status: v.status,
      shared: v.sharedAt !== null,
      uploadedBy: v.uploadedBy?.name ?? null,
      uploadedAt: v.createdAt.toISOString(),
      previewable: Object.values(ALLOWED_TYPES).some((t) => t.mime === v.mimeType && t.inline),
    })),
    approvals: approvals.map((a) => ({
      id: a.id,
      key: approvalKey(a.number),
      title: a.title,
      versionNumber: a.documentVersion.versionNumber,
      status: a.status,
      requestedBy: a.requester?.name ?? null,
      approver: a.approver?.name ?? null,
      requestedAt: a.requestedAt.toISOString(),
      dueDate: a.dueDate?.toISOString().slice(0, 10) ?? null,
      respondedAt: a.respondedAt?.toISOString() ?? null,
      comments: a.comments,
    })),
    permissions: {
      upload: internal && can(ctx, "document.upload") && doc.status !== "ARCHIVED",
      manage: internal && can(ctx, "document.manage"),
      requestApproval: internal && can(ctx, "approval.request") && !!doc.projectId && doc.status !== "ARCHIVED" && !!current && !pending,
      archive: internal && can(ctx, "document.manage") && doc.status !== "ARCHIVED",
      restore: internal && can(ctx, "document.manage") && doc.status === "ARCHIVED",
    },
  };
}

export type DocumentDetail = Awaited<ReturnType<typeof getDocument>>;

export const approvalKey = (n: number) => `APR-${String(n).padStart(3, "0")}`;

// ─── Commands ───

async function assertLinks(tx: Tx, ctx: AuthContext, projectId: string, links: { phaseId?: string | null; featureId?: string | null; changeRequestId?: string | null }) {
  if (links.phaseId && !(await tx.phase.findFirst({ where: { id: links.phaseId, projectId, deletedAt: null }, select: { id: true } }))) {
    throw ruleViolation("Phase does not belong to this project");
  }
  if (links.featureId && !(await tx.feature.findFirst({ where: { id: links.featureId, projectId, deletedAt: null }, select: { id: true } }))) {
    throw ruleViolation("Feature does not belong to this project");
  }
  if (links.changeRequestId && !(await tx.changeRequest.findFirst({ where: { id: links.changeRequestId, projectId, workspaceId: ctx.workspaceId }, select: { id: true } }))) {
    throw ruleViolation("Change request does not belong to this project");
  }
}

export async function createDocument(ctx: AuthContext, input: z.input<typeof documentCreateSchema>, file: UploadedFile) {
  requirePermission(ctx, "document.upload");
  if (ctx.role === "CLIENT") throw forbidden();
  const data = documentCreateSchema.parse(input);
  if (data.share && !can(ctx, "document.manage")) throw forbidden("Only managers can share documents with the client");

  let clientIdForNotify: string | null = null;
  if (data.projectId) {
    const project = await db.project.findFirst({ where: { AND: [projectScope(ctx), { id: data.projectId }] }, select: { id: true, clientId: true } });
    if (!project) throw notFound("Project");
    clientIdForNotify = project.clientId;
  } else {
    // Client-level documents are only visible to workspace-wide roles, so only they may create them.
    if (!WORKSPACE_WIDE_ROLES.includes(ctx.role)) throw forbidden("Only managers can add client-level documents");
    if (data.phaseId || data.featureId || data.changeRequestId) throw ruleViolation("Client-level documents cannot link to a phase, feature or change request");
    const client = await db.client.findFirst({ where: { id: data.clientId!, workspaceId: ctx.workspaceId, deletedAt: null }, select: { id: true } });
    if (!client) throw notFound("Client");
    clientIdForNotify = client.id;
  }

  const checked = checkFile(file);
  const documentId = newDocumentId();
  const key = documentVersionKey(ctx.workspaceId, documentId);

  return withStoredBlob(key, file, checked.mimeType, () =>
    db.$transaction(async (tx) => {
      if (data.projectId) await assertLinks(tx, ctx, data.projectId, data);
      const now = new Date();
      await tx.document.create({
        data: {
          id: documentId,
          workspaceId: ctx.workspaceId,
          projectId: data.projectId ?? null,
          clientId: data.projectId ? null : data.clientId!,
          phaseId: data.phaseId ?? null,
          featureId: data.featureId ?? null,
          changeRequestId: data.changeRequestId ?? null,
          name: data.name,
          description: data.description ?? null,
          category: data.category,
          status: data.share ? "SENT_TO_CLIENT" : "DRAFT",
          createdById: ctx.userId,
        },
      });
      const version = await tx.documentVersion.create({
        data: {
          workspaceId: ctx.workspaceId,
          documentId,
          versionNumber: 1,
          storageKey: key,
          originalFilename: checked.filename,
          mimeType: checked.mimeType,
          fileSize: file.bytes.length,
          checksum: sha256(file.bytes),
          changeSummary: data.changeSummary ?? "Initial version",
          uploadedById: ctx.userId,
          status: data.share ? "SENT_TO_CLIENT" : "DRAFT",
          sharedAt: data.share ? now : null,
        },
      });
      const doc = await tx.document.update({ where: { id: documentId }, data: { currentVersionId: version.id } });
      await recordActivity(
        ctx,
        {
          entityType: "document",
          entityId: documentId,
          projectId: data.projectId ?? null,
          action: "document.created",
          summary: `${label(data.name, 1)} uploaded (${DOCUMENT_CATEGORY[data.category]})`,
          metadata: { documentId, versionId: version.id, versionNumber: 1 },
          clientVisible: data.share,
        },
        tx,
      );
      if (data.share && clientIdForNotify) {
        await notify(tx, ctx, await clientUserIds(tx, ctx.workspaceId, clientIdForNotify), {
          kind: "document.shared",
          title: `New document: ${label(data.name, 1)}`,
          href: `/documents/${documentId}`,
        });
      }
      return doc;
    }),
  );
}

export async function uploadVersion(ctx: AuthContext, documentId: string, input: z.input<typeof versionUploadSchema>, file: UploadedFile) {
  requirePermission(ctx, "document.upload");
  if (ctx.role === "CLIENT") throw forbidden();
  const data = versionUploadSchema.parse(input);
  if (data.share && !can(ctx, "document.manage")) throw forbidden("Only managers can share documents with the client");
  const doc = await findDocument(ctx, documentId);
  if (doc.status === "ARCHIVED") throw ruleViolation("Restore this document before uploading a new version");
  const checked = checkFile(file);
  const key = documentVersionKey(ctx.workspaceId, doc.id);

  return withStoredBlob(key, file, checked.mimeType, async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await db.$transaction(async (tx) => {
          // Version numbers are allocated here, never accepted from the client. The unique index
          // (document_id, version_number) turns a concurrent upload into a retryable conflict.
          const last = await tx.documentVersion.aggregate({ where: { documentId: doc.id }, _max: { versionNumber: true } });
          const versionNumber = (last._max.versionNumber ?? 0) + 1;
          const now = new Date();
          const version = await tx.documentVersion.create({
            data: {
              workspaceId: ctx.workspaceId,
              documentId: doc.id,
              versionNumber,
              storageKey: key,
              originalFilename: checked.filename,
              mimeType: checked.mimeType,
              fileSize: file.bytes.length,
              checksum: sha256(file.bytes),
              changeSummary: data.changeSummary ?? null,
              uploadedById: ctx.userId,
              status: data.share ? "SENT_TO_CLIENT" : "DRAFT",
              sharedAt: data.share ? now : null,
            },
          });
          await tx.document.update({ where: { id: doc.id }, data: { currentVersionId: version.id, status: data.share ? "SENT_TO_CLIENT" : "DRAFT" } });
          await recordActivity(
            ctx,
            {
              entityType: "document",
              entityId: doc.id,
              projectId: doc.projectId,
              action: "document.version_uploaded",
              summary: `${label(doc.name, versionNumber)} uploaded${data.changeSummary ? ` — ${data.changeSummary}` : ""}`,
              metadata: { documentId: doc.id, versionId: version.id, versionNumber },
              clientVisible: data.share,
            },
            tx,
          );
          if (data.share) {
            const clientId = await ownerClientId(tx, doc);
            if (clientId) {
              await notify(tx, ctx, await clientUserIds(tx, ctx.workspaceId, clientId), {
                kind: "document.version_available",
                title: `New version available: ${label(doc.name, versionNumber)}`,
                body: data.changeSummary,
                href: `/documents/${doc.id}`,
              });
            }
          }
          return version;
        });
      } catch (e) {
        if (attempt < 2 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
        throw e;
      }
    }
  });
}

export async function updateDocument(ctx: AuthContext, documentId: string, input: z.input<typeof documentUpdateSchema>) {
  requirePermission(ctx, "document.manage");
  const data = documentUpdateSchema.parse(input);
  const doc = await findDocument(ctx, documentId);
  return db.$transaction(async (tx) => {
    if (doc.projectId) await assertLinks(tx, ctx, doc.projectId, data);
    else if (data.phaseId || data.featureId || data.changeRequestId) throw ruleViolation("Client-level documents cannot link to a phase, feature or change request");
    const updated = await tx.document.update({ where: { id: doc.id }, data });
    await recordActivity(ctx, { entityType: "document", entityId: doc.id, projectId: doc.projectId, action: "document.updated", summary: `${updated.name} details updated`, metadata: { documentId: doc.id } }, tx);
    return updated;
  });
}

/** Makes a version visible to the client (and the document "Sent to Client" if it is current). */
export async function shareVersion(ctx: AuthContext, documentId: string, versionId: string) {
  requirePermission(ctx, "document.manage");
  const doc = await findDocument(ctx, documentId);
  if (doc.status === "ARCHIVED") throw ruleViolation("Archived documents cannot be shared");
  return db.$transaction(async (tx) => {
    await shareVersionInTx(tx, ctx, doc, versionId, { notifyClient: true });
  });
}

export async function shareVersionInTx(
  tx: Tx,
  ctx: AuthContext,
  doc: { id: string; name: string; projectId: string | null; clientId: string | null; currentVersionId: string | null; status: DocumentStatus },
  versionId: string,
  opts: { notifyClient: boolean },
) {
  const version = await tx.documentVersion.findFirst({ where: { id: versionId, documentId: doc.id } });
  if (!version) throw notFound("Version");
  if (version.sharedAt) return version;
  const updated = await tx.documentVersion.update({
    where: { id: version.id },
    data: { sharedAt: new Date(), status: version.status === "DRAFT" ? "SENT_TO_CLIENT" : version.status },
  });
  if (doc.currentVersionId === version.id && (doc.status === "DRAFT" || doc.status === "INTERNAL_REVIEW")) {
    await tx.document.update({ where: { id: doc.id }, data: { status: "SENT_TO_CLIENT" } });
  }
  if (opts.notifyClient) {
    await recordActivity(
      ctx,
      {
        entityType: "document",
        entityId: doc.id,
        projectId: doc.projectId,
        action: "document.shared",
        summary: `${label(doc.name, version.versionNumber)} shared with the client`,
        metadata: { documentId: doc.id, versionId: version.id, versionNumber: version.versionNumber },
        clientVisible: true,
      },
      tx,
    );
    const clientId = await ownerClientId(tx, doc);
    if (clientId) {
      await notify(tx, ctx, await clientUserIds(tx, ctx.workspaceId, clientId), {
        kind: "document.version_available",
        title: `New document version available: ${label(doc.name, version.versionNumber)}`,
        href: `/documents/${doc.id}`,
      });
    }
  }
  return updated;
}

export async function archiveDocument(ctx: AuthContext, documentId: string) {
  requirePermission(ctx, "document.manage");
  const doc = await findDocument(ctx, documentId);
  if (doc.status === "ARCHIVED") return;
  const pending = await db.approval.count({ where: { documentId: doc.id, status: "PENDING" } });
  if (pending > 0) throw ruleViolation("Cancel the pending approval before archiving this document");
  await db.$transaction(async (tx) => {
    await tx.document.update({ where: { id: doc.id }, data: { status: "ARCHIVED" } });
    await recordActivity(ctx, { entityType: "document", entityId: doc.id, projectId: doc.projectId, action: "document.archived", summary: `${doc.name} archived`, metadata: { documentId: doc.id } }, tx);
  });
}

export async function restoreDocument(ctx: AuthContext, documentId: string) {
  requirePermission(ctx, "document.manage");
  const doc = await findDocument(ctx, documentId);
  if (doc.status !== "ARCHIVED") return;
  // Restore to the review state of the current version.
  const current = doc.currentVersionId ? await db.documentVersion.findUnique({ where: { id: doc.currentVersionId }, select: { status: true } }) : null;
  const status: DocumentStatus = current && current.status !== "ARCHIVED" ? current.status : "DRAFT";
  await db.$transaction(async (tx) => {
    await tx.document.update({ where: { id: doc.id }, data: { status } });
    await recordActivity(ctx, { entityType: "document", entityId: doc.id, projectId: doc.projectId, action: "document.restored", summary: `${doc.name} restored`, metadata: { documentId: doc.id } }, tx);
  });
}

/** Authorizes a download and returns a short-lived signed URL (never a permanent URL). */
export async function getDownloadUrl(ctx: AuthContext, documentId: string, versionId: string, opts: { inline?: boolean } = {}) {
  requirePermission(ctx, "project.view");
  const doc = await findDocument(ctx, documentId);
  const version = await db.documentVersion.findFirst({ where: { id: versionId, documentId: doc.id, ...versionScope(ctx) } });
  if (!version) throw notFound("Version");
  const inlineOk = Object.values(ALLOWED_TYPES).some((t) => t.mime === version.mimeType && t.inline);
  const url = await getStorage().getSignedUrl(version.storageKey, {
    expiresIn: signedUrlTtl(),
    filename: version.originalFilename,
    contentType: version.mimeType,
    disposition: opts.inline && inlineOk ? "inline" : "attachment",
  });
  if (ctx.role === "CLIENT") {
    await recordActivity(ctx, {
      entityType: "document",
      entityId: doc.id,
      projectId: doc.projectId,
      action: "document.downloaded",
      summary: `${ctx.userName} opened ${label(doc.name, version.versionNumber)}`,
      metadata: { documentId: doc.id, versionId: version.id, versionNumber: version.versionNumber },
    });
  }
  return url;
}

export const DOCUMENT_CATEGORIES = Object.keys(DOCUMENT_CATEGORY) as DocumentCategory[];
