import "server-only";
import { Prisma, type ApprovalStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "@/server/db";
import { approvalScope, can, documentScope, projectScope, requirePermission, type AuthContext } from "@/server/authz/context";
import { AppError, forbidden, notFound, ruleViolation } from "@/server/errors";
import { approvalDecisionSchema, approvalListQuery, approvalReasonSchema, approvalRequestSchema } from "@/server/validation/schemas";
import { approvalEffects, canTransitionApproval, type ApprovalAction } from "@/server/domain/approvals";
import { parseISODate, todayISO, toISODate } from "@/lib/dates";
import { nextNumber, recordActivity } from "./activity";
import { notify } from "./notifications";
import { approvalKey, shareVersionInTx } from "./documents";

const include = {
  project: { select: { id: true, name: true, projectManagerId: true } },
  client: { select: { id: true, name: true } },
  document: { select: { id: true, name: true, currentVersionId: true, category: true } },
  documentVersion: { select: { id: true, versionNumber: true, originalFilename: true, mimeType: true, fileSize: true, changeSummary: true, createdAt: true } },
  requester: { select: { id: true, name: true } },
  approver: { select: { id: true, name: true } },
} satisfies Prisma.ApprovalInclude;

type ApprovalWithRefs = Prisma.ApprovalGetPayload<{ include: typeof include }>;

function toRow(a: ApprovalWithRefs, ctx: AuthContext) {
  const superseded = a.document.currentVersionId !== a.documentVersionId;
  return {
    id: a.id,
    key: approvalKey(a.number),
    title: a.title,
    status: a.status,
    document: { id: a.document.id, name: a.document.name, category: a.document.category },
    version: { id: a.documentVersion.id, number: a.documentVersion.versionNumber, filename: a.documentVersion.originalFilename, changeSummary: a.documentVersion.changeSummary },
    superseded,
    project: { id: a.project.id, name: a.project.name },
    client: a.client,
    requestedBy: a.requester?.name ?? null,
    approver: a.approver ? { id: a.approver.id, name: a.approver.name } : null,
    requestMessage: a.requestMessage,
    requestedAt: a.requestedAt.toISOString(),
    dueDate: toISODate(a.dueDate),
    viewedAt: a.viewedAt?.toISOString() ?? null,
    respondedAt: a.respondedAt?.toISOString() ?? null,
    respondedBy: a.respondedByName,
    comments: a.comments,
    /** The caller may decide this approval (assigned client, still pending). */
    canDecide: a.status === "PENDING" && ctx.role === "CLIENT" && can(ctx, "document.approve") && a.approverId === ctx.userId,
    canCancel: a.status === "PENDING" && ctx.role !== "CLIENT" && can(ctx, "approval.request"),
  };
}

export type ApprovalRow = ReturnType<typeof toRow>;

export async function listApprovals(ctx: AuthContext, raw: z.input<typeof approvalListQuery> = {}) {
  requirePermission(ctx, "project.view");
  const q = approvalListQuery.parse(raw);
  const where: Prisma.ApprovalWhereInput = { AND: [approvalScope(ctx)] };
  const and = where.AND as Prisma.ApprovalWhereInput[];
  if (q.status) and.push({ status: q.status });
  if (q.projectId) and.push({ projectId: q.projectId });
  if (q.documentId) and.push({ documentId: q.documentId });
  if (q.clientId) and.push({ clientId: q.clientId });
  if (q.mine === "1") and.push(ctx.role === "CLIENT" ? { approverId: ctx.userId } : { requesterId: ctx.userId });
  // Clients never see approvals on versions that were not shared with them.
  if (ctx.role === "CLIENT") and.push({ documentVersion: { sharedAt: { not: null } } });
  const rows = await db.approval.findMany({ where, include, orderBy: [{ requestedAt: "desc" }], take: 500 });
  // Pending first, then most recent.
  const rank = (s: ApprovalStatus) => (s === "PENDING" ? 0 : 1);
  return rows.map((a) => toRow(a, ctx)).sort((a, b) => rank(a.status) - rank(b.status));
}

async function findApproval(ctx: AuthContext, id: string) {
  const a = await db.approval.findFirst({ where: { AND: [approvalScope(ctx), { id }, ctx.role === "CLIENT" ? { documentVersion: { sharedAt: { not: null } } } : {}] }, include });
  if (!a) throw notFound("Approval");
  return a;
}

/** Returns the approval; the first time the assigned approver opens it, records a "viewed" audit event. */
export async function getApproval(ctx: AuthContext, id: string) {
  requirePermission(ctx, "project.view");
  const a = await findApproval(ctx, id);
  if (a.status === "PENDING" && a.approverId === ctx.userId && !a.viewedAt) {
    await db.$transaction(async (tx) => {
      const n = await tx.approval.updateMany({ where: { id: a.id, status: "PENDING", viewedAt: null }, data: { viewedAt: new Date() } });
      if (n.count === 1) {
        await recordActivity(
          ctx,
          {
            entityType: "approval",
            entityId: a.id,
            projectId: a.projectId,
            action: "approval.viewed",
            summary: `${a.title} viewed by ${ctx.userName}`,
            metadata: { documentId: a.documentId, versionId: a.documentVersionId, versionNumber: a.documentVersion.versionNumber, approvalId: a.id },
            clientVisible: true,
          },
          tx,
        );
      }
    });
    a.viewedAt = new Date();
  }
  return toRow(a, ctx);
}

/** Client users who can be asked to approve documents of this project. */
export async function listApprovers(ctx: AuthContext, projectId: string) {
  requirePermission(ctx, "approval.request");
  const project = await db.project.findFirst({ where: { AND: [projectScope(ctx), { id: projectId }] }, select: { clientId: true } });
  if (!project) throw notFound("Project");
  const rows = await db.workspaceMember.findMany({
    where: { workspaceId: ctx.workspaceId, role: "CLIENT", clientId: project.clientId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return rows.map((r) => r.user);
}

export async function requestApproval(ctx: AuthContext, input: z.input<typeof approvalRequestSchema>) {
  requirePermission(ctx, "approval.request");
  const data = approvalRequestSchema.parse(input);
  const doc = await db.document.findFirst({ where: { AND: [documentScope(ctx), { id: data.documentId }] } });
  if (!doc) throw notFound("Document");
  if (!doc.projectId) throw ruleViolation("Approvals are requested on project documents");
  if (doc.status === "ARCHIVED") throw ruleViolation("Archived documents cannot be sent for approval");
  if (!doc.currentVersionId) throw ruleViolation("Upload a version before requesting approval");
  if (data.dueDate && data.dueDate < todayISO(ctx.timezone)) throw new AppError("VALIDATION", "Due date cannot be in the past", { dueDate: ["Due date cannot be in the past"] });

  const project = await db.project.findUniqueOrThrow({ where: { id: doc.projectId }, select: { id: true, clientId: true } });
  const approver = await db.workspaceMember.findFirst({
    where: { workspaceId: ctx.workspaceId, userId: data.approverId, role: "CLIENT", clientId: project.clientId },
    include: { user: { select: { name: true } } },
  });
  if (!approver) throw ruleViolation("The approver must be a client user of this project's client");

  try {
    return await db.$transaction(async (tx) => {
      const version = await tx.documentVersion.findUniqueOrThrow({ where: { id: doc.currentVersionId! } });
      const number = await nextNumber(tx, ctx.workspaceId, "approval");
      const title = `${doc.name} v${version.versionNumber}`;
      const approval = await tx.approval.create({
        data: {
          workspaceId: ctx.workspaceId,
          projectId: project.id,
          clientId: project.clientId,
          documentId: doc.id,
          documentVersionId: version.id,
          featureId: doc.featureId,
          number,
          title,
          requesterId: ctx.userId,
          approverId: data.approverId,
          requestMessage: data.message ?? null,
          dueDate: data.dueDate ? parseISODate(data.dueDate) : null,
        },
      });
      // Requesting approval shares the exact version with the client.
      await shareVersionInTx(tx, ctx, doc, version.id, { notifyClient: false });
      await tx.documentVersion.update({ where: { id: version.id }, data: { status: "SENT_TO_CLIENT" } });
      await tx.document.update({ where: { id: doc.id }, data: { status: "SENT_TO_CLIENT" } });
      await recordActivity(
        ctx,
        {
          entityType: "approval",
          entityId: approval.id,
          projectId: project.id,
          action: "approval.requested",
          summary: `${title} sent to ${approver.user.name} for approval`,
          metadata: { documentId: doc.id, versionId: version.id, versionNumber: version.versionNumber, approvalId: approval.id },
          clientVisible: true,
        },
        tx,
      );
      await notify(tx, ctx, [data.approverId], {
        kind: "approval.requested",
        title: `Approval requested: ${title}`,
        body: data.message ?? (data.dueDate ? `Due ${data.dueDate}` : null),
        href: `/approvals/${approval.id}`,
      });
      return approval;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError("CONFLICT", "An approval is already pending for this version");
    throw e;
  }
}

const DECISION_COPY: Record<Exclude<ApprovalAction, "cancel">, { verb: string; kind: string; title: (t: string, who: string) => string }> = {
  approve: { verb: "approved", kind: "approval.approved", title: (t, who) => `${who} approved ${t}` },
  reject: { verb: "rejected", kind: "approval.rejected", title: (t, who) => `${who} rejected ${t}` },
  request_changes: { verb: "changes requested", kind: "approval.changes_requested", title: (t, who) => `${who} requested changes to ${t}` },
};

/** Approve / reject / request changes. Only the assigned client approver may decide. */
export async function decideApproval(ctx: AuthContext, id: string, action: Exclude<ApprovalAction, "cancel">, input: { comment?: string | null }) {
  requirePermission(ctx, "document.approve");
  const { comment } = (action === "approve" ? approvalDecisionSchema : approvalReasonSchema).parse(input);
  const a = await findApproval(ctx, id);
  if (a.approverId !== ctx.userId) throw forbidden("This approval is assigned to someone else");
  if (!canTransitionApproval(a.status, action)) throw ruleViolation(`This approval was already ${a.status.toLowerCase().replace("_", " ")}`);

  const to: ApprovalStatus = action === "approve" ? "APPROVED" : action === "reject" ? "REJECTED" : "CHANGES_REQUESTED";
  const copy = DECISION_COPY[action];
  return db.$transaction(async (tx) => {
    // Conditional update: two concurrent decisions cannot both succeed.
    const res = await tx.approval.updateMany({
      where: { id: a.id, status: "PENDING" },
      data: { status: to, respondedAt: new Date(), respondedByName: ctx.userName, comments: comment ?? null },
    });
    if (res.count !== 1) throw new AppError("CONFLICT", "This approval has already been decided");
    const doc = await tx.document.findUniqueOrThrow({ where: { id: a.documentId } });
    const effects = approvalEffects(action, doc.currentVersionId === a.documentVersionId);
    if (effects.version) await tx.documentVersion.update({ where: { id: a.documentVersionId }, data: { status: effects.version } });
    if (effects.document && doc.status !== "ARCHIVED") await tx.document.update({ where: { id: doc.id }, data: { status: effects.document } });
    await recordActivity(
      ctx,
      {
        entityType: "approval",
        entityId: a.id,
        projectId: a.projectId,
        action: `approval.${action === "request_changes" ? "changes_requested" : action === "approve" ? "approved" : "rejected"}`,
        summary: action === "request_changes" ? `${ctx.userName} requested changes to ${a.title}` : `${a.title} ${copy.verb} by ${ctx.userName}`,
        metadata: { documentId: a.documentId, versionId: a.documentVersionId, versionNumber: a.documentVersion.versionNumber, approvalId: a.id, comment: comment ?? null },
        clientVisible: true,
      },
      tx,
    );
    await notify(tx, ctx, [a.requesterId, a.project.projectManagerId], {
      kind: copy.kind,
      title: copy.title(a.title, ctx.userName),
      body: comment ?? null,
      href: `/approvals/${a.id}`,
    });
    return { status: to };
  });
}

export async function cancelApproval(ctx: AuthContext, id: string) {
  requirePermission(ctx, "approval.request");
  if (ctx.role === "CLIENT") throw forbidden();
  const a = await findApproval(ctx, id);
  if (!canTransitionApproval(a.status, "cancel")) throw ruleViolation("Only pending approvals can be cancelled");
  return db.$transaction(async (tx) => {
    const res = await tx.approval.updateMany({ where: { id: a.id, status: "PENDING" }, data: { status: "CANCELLED", respondedAt: new Date(), respondedByName: ctx.userName } });
    if (res.count !== 1) throw new AppError("CONFLICT", "This approval has already been decided");
    const doc = await tx.document.findUniqueOrThrow({ where: { id: a.documentId } });
    const effects = approvalEffects("cancel", doc.currentVersionId === a.documentVersionId);
    if (effects.document && doc.status === "SENT_TO_CLIENT") await tx.document.update({ where: { id: doc.id }, data: { status: effects.document } });
    await recordActivity(
      ctx,
      {
        entityType: "approval",
        entityId: a.id,
        projectId: a.projectId,
        action: "approval.cancelled",
        summary: `Approval request for ${a.title} cancelled`,
        metadata: { documentId: a.documentId, versionId: a.documentVersionId, versionNumber: a.documentVersion.versionNumber, approvalId: a.id },
        clientVisible: true,
      },
      tx,
    );
    await notify(tx, ctx, [a.approverId], { kind: "approval.cancelled", title: `Approval request withdrawn: ${a.title}`, href: `/documents/${a.documentId}` });
  });
}
