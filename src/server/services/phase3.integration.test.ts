// Integration tests for Phase 3 against a real PostgreSQL database and the local storage provider.
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { ZodError } from "zod";
import { AppError } from "@/server/errors";
import { getStorage } from "@/server/storage";
import { makeWorkspace, pdfFile, type Fixture } from "../../../test/fixtures";
import { archiveDocument, createDocument, getDocument, getDownloadUrl, listDocuments, shareVersion, uploadVersion } from "./documents";
import { cancelApproval, decideApproval, getApproval, listApprovals, requestApproval } from "./approvals";
import {
  cancelChangeRequest,
  createChangeRequest,
  createImplementationTasks,
  decideChangeRequest,
  getChangeRequest,
  listChangeRequests,
  transitionChangeRequest,
  updateChangeRequest,
} from "./change-requests";
import { getScopeSummary } from "./scope";
import { listActivity } from "./activity";

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    // ZodErrors are reported as VALIDATION (422) by both the API handler and server actions.
    if (e instanceof ZodError) return "VALIDATION";
    return e instanceof AppError ? e.code : `UNEXPECTED: ${(e as Error).message}`;
  }
};

let f: Fixture;
let other: Fixture; // a second workspace for cross-tenant checks

beforeAll(async () => {
  f = await makeWorkspace("main");
  other = await makeWorkspace("other");
});

async function newDoc(name = "Requirements", opts: { share?: boolean } = {}) {
  return createDocument(f.ctx.pm, { projectId: f.pA.id, name, category: "REQUIREMENTS", share: opts.share ?? false }, pdfFile(`${name}.pdf`));
}

describe("documents & versioning", () => {
  it("creates a document with v1 stored outside the database", async () => {
    const doc = await newDoc();
    const v = await db.documentVersion.findFirstOrThrow({ where: { documentId: doc.id } });
    expect(v.versionNumber).toBe(1);
    expect(doc.currentVersionId).toBe(v.id);
    expect(v.storageKey).toMatch(/^w\/[a-z0-9]+\/d\/[a-z0-9]+\/[0-9a-f-]{36}$/);
    expect(v.storageKey).not.toContain("Requirements"); // never derived from user input
    expect(v.mimeType).toBe("application/pdf");
    expect(v.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(await getStorage().exists(v.storageKey)).toBe(true);
    const cols = await db.$queryRaw<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_name = 'document_versions' AND data_type = 'bytea'`;
    expect(cols).toHaveLength(0); // no binary columns at all
  });

  it("numbers versions server-side and moves the current version", async () => {
    const doc = await newDoc("Scope");
    const v2 = await uploadVersion(f.ctx.pm, doc.id, { changeSummary: "Added SSO", versionNumber: 99 } as never, pdfFile("scope-v2.pdf"));
    const v3 = await uploadVersion(f.ctx.pm, doc.id, { changeSummary: "Pricing" }, pdfFile("scope-v3.pdf"));
    expect(v2.versionNumber).toBe(2);
    expect(v3.versionNumber).toBe(3);
    const d = await db.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(d.currentVersionId).toBe(v3.id);
  });

  it("allocates unique numbers under concurrent uploads", async () => {
    const doc = await newDoc("Concurrent");
    const results = await Promise.all([1, 2, 3].map((i) => uploadVersion(f.ctx.pm, doc.id, {}, pdfFile(`c${i}.pdf`))));
    expect(results.map((r) => r.versionNumber).sort()).toEqual([2, 3, 4]);
  });

  it("keeps versions immutable (database-enforced)", async () => {
    const doc = await newDoc("Immutable");
    const v = await db.documentVersion.findFirstOrThrow({ where: { documentId: doc.id } });
    await expect(db.documentVersion.update({ where: { id: v.id }, data: { storageKey: "w/abcdefgh/d/abcdefgh/00000000-0000-0000-0000-000000000000" } })).rejects.toThrow(/immutable/);
    await expect(db.documentVersion.update({ where: { id: v.id }, data: { originalFilename: "evil.pdf" } })).rejects.toThrow(/immutable/);
    // A new upload never overwrites: old file and row are untouched.
    await uploadVersion(f.ctx.pm, doc.id, {}, pdfFile("v2.pdf"));
    const again = await db.documentVersion.findUniqueOrThrow({ where: { id: v.id } });
    expect(again.storageKey).toBe(v.storageKey);
    expect(await getStorage().exists(v.storageKey)).toBe(true);
  });

  it("rejects spoofed and oversized uploads without storing anything", async () => {
    const before = await db.documentVersion.count();
    expect(await code(createDocument(f.ctx.pm, { projectId: f.pA.id, name: "x", category: "OTHER" }, { name: "x.pdf", type: "application/pdf", bytes: Buffer.from("MZ not a pdf") }))).toBe("VALIDATION");
    expect(await code(createDocument(f.ctx.pm, { projectId: f.pA.id, name: "x", category: "OTHER" }, { name: "x.html", type: "text/html", bytes: Buffer.from("<html>") }))).toBe("VALIDATION");
    const big = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(3 * 1024 * 1024)]); // limit is 2 MB in tests
    expect(await code(createDocument(f.ctx.pm, { projectId: f.pA.id, name: "x", category: "OTHER" }, { name: "x.pdf", type: "application/pdf", bytes: big }))).toBe("VALIDATION");
    expect(await db.documentVersion.count()).toBe(before);
  });

  it("enforces upload permissions and project membership", async () => {
    expect(await code(createDocument(f.ctx.anil, { projectId: f.pA.id, name: "client upload", category: "OTHER" }, pdfFile()))).toBe("FORBIDDEN");
    // Developer is not a member of Project A → project not visible.
    expect(await code(createDocument(f.ctx.dev, { projectId: f.pA.id, name: "x", category: "OTHER" }, pdfFile()))).toBe("NOT_FOUND");
    const doc = await newDoc("No client upload");
    expect(await code(uploadVersion(f.ctx.anil, doc.id, {}, pdfFile()))).toBe("FORBIDDEN");
  });

  it("rejects cross-workspace access to documents (IDOR)", async () => {
    const doc = await newDoc("Tenant A secret", { share: true });
    expect(await code(getDocument(other.ctx.owner, doc.id))).toBe("NOT_FOUND");
    const v = await db.documentVersion.findFirstOrThrow({ where: { documentId: doc.id } });
    expect(await code(getDownloadUrl(other.ctx.owner, doc.id, v.id))).toBe("NOT_FOUND");
    expect(await code(uploadVersion(other.ctx.owner, doc.id, {}, pdfFile()))).toBe("NOT_FOUND");
    expect((await listDocuments(other.ctx.owner)).some((d) => d.id === doc.id)).toBe(false);
  });

  it("archives documents and blocks uploads to archived ones", async () => {
    const doc = await newDoc("To archive");
    await archiveDocument(f.ctx.pm, doc.id);
    expect((await db.document.findUniqueOrThrow({ where: { id: doc.id } })).status).toBe("ARCHIVED");
    expect(await code(uploadVersion(f.ctx.pm, doc.id, {}, pdfFile()))).toBe("RULE_VIOLATION");
    expect(await code(archiveDocument(f.ctx.dev, doc.id))).toBe("FORBIDDEN");
  });
});

describe("client document access", () => {
  it("clients see only shared documents of their own client, and only shared versions", async () => {
    const internalOnly = await newDoc("Internal estimate");
    const shared = await newDoc("Shared spec", { share: true });
    await uploadVersion(f.ctx.pm, shared.id, { changeSummary: "internal draft" }, pdfFile("draft.pdf")); // v2 not shared

    const anilDocs = await listDocuments(f.ctx.anil);
    expect(anilDocs.some((d) => d.id === internalOnly.id)).toBe(false);
    const row = anilDocs.find((d) => d.id === shared.id)!;
    expect(row.currentVersion?.number).toBe(1); // latest *shared* version, not v2
    expect(row.versionCount).toBe(1);

    const detail = await getDocument(f.ctx.anil, shared.id);
    expect(detail.versions.map((v) => v.number)).toEqual([1]);
    expect(detail.permissions.upload).toBe(false);

    const v2 = await db.documentVersion.findFirstOrThrow({ where: { documentId: shared.id, versionNumber: 2 } });
    expect(await code(getDownloadUrl(f.ctx.anil, shared.id, v2.id))).toBe("NOT_FOUND");
    const v1 = await db.documentVersion.findFirstOrThrow({ where: { documentId: shared.id, versionNumber: 1 } });
    expect(await getDownloadUrl(f.ctx.anil, shared.id, v1.id)).toMatch(/^\/api\/v1\/files\/[\w-]+\.[\w-]+$/);
  });

  it("client cannot see another client's document", async () => {
    const doc = await newDoc("A only", { share: true });
    expect(await code(getDocument(f.ctx.bina, doc.id))).toBe("NOT_FOUND");
    expect((await listDocuments(f.ctx.bina)).some((d) => d.id === doc.id)).toBe(false);
  });

  it("sharing a later version makes it visible and notifies the client", async () => {
    const doc = await newDoc("Share later");
    const v2 = await uploadVersion(f.ctx.pm, doc.id, {}, pdfFile());
    expect(await code(getDocument(f.ctx.anil, doc.id))).toBe("NOT_FOUND");
    await shareVersion(f.ctx.pm, doc.id, v2.id);
    expect((await getDocument(f.ctx.anil, doc.id)).versions.map((v) => v.number)).toEqual([2]);
    const n = await db.notification.findFirst({ where: { userId: f.users.anil.id, kind: "document.version_available", href: `/documents/${doc.id}` } });
    expect(n).not.toBeNull();
  });
});

describe("approvals", () => {
  async function docWithApproval(name: string) {
    const doc = await newDoc(name);
    const approval = await requestApproval(f.ctx.pm, { documentId: doc.id, approverId: f.users.anil.id, message: "Please review" });
    return { doc, approval };
  }

  it("creates an approval pinned to the exact current version, shares it, notifies and audits", async () => {
    const doc = await newDoc("Requirements spec");
    await uploadVersion(f.ctx.pm, doc.id, { changeSummary: "v2" }, pdfFile());
    const a = await requestApproval(f.ctx.pm, { documentId: doc.id, approverId: f.users.anil.id });
    const v2 = await db.documentVersion.findFirstOrThrow({ where: { documentId: doc.id, versionNumber: 2 } });
    expect(a.documentVersionId).toBe(v2.id);
    expect(a.title).toBe("Requirements spec v2");
    expect(v2.sharedAt).not.toBeNull();
    expect(await db.notification.count({ where: { userId: f.users.anil.id, kind: "approval.requested", href: `/approvals/${a.id}` } })).toBe(1);
    const act = await db.activity.findFirst({ where: { entityType: "approval", entityId: a.id, action: "approval.requested" } });
    expect(act?.summary).toBe("Requirements spec v2 sent to Anil Client for approval");
  });

  it("approval for v2 does not change when v3 is uploaded", async () => {
    const doc = await newDoc("Pinned");
    await uploadVersion(f.ctx.pm, doc.id, {}, pdfFile());
    const a = await requestApproval(f.ctx.pm, { documentId: doc.id, approverId: f.users.anil.id });
    const snapshot = await db.approval.findUniqueOrThrow({ where: { id: a.id } });
    await uploadVersion(f.ctx.pm, doc.id, { changeSummary: "v3" }, pdfFile());
    const after = await db.approval.findUniqueOrThrow({ where: { id: a.id } });
    expect(after.documentVersionId).toBe(snapshot.documentVersionId);
    expect(after.title).toBe("Pinned v2");
    expect(after.status).toBe("PENDING");
    // Approving the superseded v2 approves v2 only — the document (now at v3) is unaffected.
    await decideApproval(f.ctx.anil, a.id, "approve", {});
    const v2 = await db.documentVersion.findUniqueOrThrow({ where: { id: a.documentVersionId } });
    expect(v2.status).toBe("APPROVED");
    const d = await db.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(d.status).toBe("DRAFT");
    expect((await getApproval(f.ctx.pm, a.id)).superseded).toBe(true);
  });

  it("approve marks the version and document approved, notifies the requester and audits", async () => {
    const { doc, approval } = await docWithApproval("Approve me");
    await decideApproval(f.ctx.anil, approval.id, "approve", { comment: "Looks good" });
    const a = await db.approval.findUniqueOrThrow({ where: { id: approval.id } });
    expect(a.status).toBe("APPROVED");
    expect(a.respondedByName).toBe("Anil Client");
    expect(a.respondedAt).not.toBeNull();
    expect((await db.documentVersion.findUniqueOrThrow({ where: { id: a.documentVersionId } })).status).toBe("APPROVED");
    expect((await db.document.findUniqueOrThrow({ where: { id: doc.id } })).status).toBe("APPROVED");
    expect(await db.notification.count({ where: { userId: f.users.pm.id, kind: "approval.approved" } })).toBeGreaterThan(0);
    expect(await db.activity.count({ where: { entityId: approval.id, action: "approval.approved" } })).toBe(1);
  });

  it("reject requires and stores a reason", async () => {
    const { doc, approval } = await docWithApproval("Reject me");
    expect(await code(decideApproval(f.ctx.anil, approval.id, "reject", {}))).toBe("VALIDATION");
    await decideApproval(f.ctx.anil, approval.id, "reject", { comment: "Wrong pricing" });
    const a = await db.approval.findUniqueOrThrow({ where: { id: approval.id } });
    expect(a.status).toBe("REJECTED");
    expect(a.comments).toBe("Wrong pricing");
    expect((await db.document.findUniqueOrThrow({ where: { id: doc.id } })).status).toBe("REJECTED");
  });

  it("changes requested stores comments and does not create a new version", async () => {
    const { doc, approval } = await docWithApproval("Change me");
    const versionsBefore = await db.documentVersion.count({ where: { documentId: doc.id } });
    await decideApproval(f.ctx.anil, approval.id, "request_changes", { comment: "Add Microsoft login" });
    const a = await db.approval.findUniqueOrThrow({ where: { id: approval.id } });
    expect(a.status).toBe("CHANGES_REQUESTED");
    expect(a.comments).toBe("Add Microsoft login");
    expect(await db.documentVersion.count({ where: { documentId: doc.id } })).toBe(versionsBefore);
    expect((await db.document.findUniqueOrThrow({ where: { id: doc.id } })).status).toBe("INTERNAL_REVIEW");
  });

  it("decided approvals are immutable (service and database)", async () => {
    const { approval } = await docWithApproval("Final");
    await decideApproval(f.ctx.anil, approval.id, "approve", {});
    expect(await code(decideApproval(f.ctx.anil, approval.id, "reject", { comment: "changed my mind" }))).toBe("RULE_VIOLATION");
    expect(await code(cancelApproval(f.ctx.pm, approval.id))).toBe("RULE_VIOLATION");
    await expect(db.approval.update({ where: { id: approval.id }, data: { status: "REJECTED" } })).rejects.toThrow(/immutable/);
    await expect(db.approval.delete({ where: { id: approval.id } })).rejects.toThrow(/immutable/);
  });

  it("only one pending approval per version", async () => {
    const { doc } = await docWithApproval("Once");
    expect(await code(requestApproval(f.ctx.pm, { documentId: doc.id, approverId: f.users.anil.id }))).toBe("CONFLICT");
  });

  it("approver must be a client user of the project's client", async () => {
    const doc = await newDoc("Wrong approver");
    expect(await code(requestApproval(f.ctx.pm, { documentId: doc.id, approverId: f.users.bina.id }))).toBe("RULE_VIOLATION");
    expect(await code(requestApproval(f.ctx.pm, { documentId: doc.id, approverId: f.users.dev.id }))).toBe("RULE_VIOLATION");
  });

  it("client cannot approve another project's document or an approval not assigned to them", async () => {
    const { approval } = await docWithApproval("Not yours");
    expect(await code(decideApproval(f.ctx.bina, approval.id, "approve", {}))).toBe("NOT_FOUND");
    expect(await code(decideApproval(other.ctx.anil, approval.id, "approve", {}))).toBe("NOT_FOUND");
    // A second user of the same client, not the assignee:
    const colleague = await db.user.create({ data: { email: `colleague.${Date.now()}@test.dev`, name: "Colleague", passwordHash: "x" } });
    await db.workspaceMember.create({ data: { workspaceId: f.ws.id, userId: colleague.id, role: "CLIENT", clientId: f.clientA.id } });
    const colleagueCtx = { ...f.ctx.anil, userId: colleague.id, userName: "Colleague" };
    expect(await code(decideApproval(colleagueCtx, approval.id, "approve", {}))).toBe("FORBIDDEN");
    // Internal users cannot approve on the client's behalf.
    expect(await code(decideApproval(f.ctx.owner, approval.id, "approve", {}))).toBe("FORBIDDEN");
    expect((await db.approval.findUniqueOrThrow({ where: { id: approval.id } })).status).toBe("PENDING");
  });

  it("client cannot request or cancel approvals", async () => {
    const { doc, approval } = await docWithApproval("Client limits");
    expect(await code(requestApproval(f.ctx.anil, { documentId: doc.id, approverId: f.users.anil.id }))).toBe("FORBIDDEN");
    expect(await code(cancelApproval(f.ctx.anil, approval.id))).toBe("FORBIDDEN");
  });

  it("records the first view by the approver once", async () => {
    const { approval } = await docWithApproval("Viewed");
    await getApproval(f.ctx.pm, approval.id); // internal view: not recorded
    await getApproval(f.ctx.anil, approval.id);
    await getApproval(f.ctx.anil, approval.id);
    expect(await db.activity.count({ where: { entityId: approval.id, action: "approval.viewed" } })).toBe(1);
    expect((await db.approval.findUniqueOrThrow({ where: { id: approval.id } })).viewedAt).not.toBeNull();
  });

  it("cancel withdraws a pending approval", async () => {
    const { approval } = await docWithApproval("Cancel me");
    await cancelApproval(f.ctx.pm, approval.id);
    expect((await db.approval.findUniqueOrThrow({ where: { id: approval.id } })).status).toBe("CANCELLED");
  });

  it("archiving is blocked while an approval is pending", async () => {
    const { doc } = await docWithApproval("Archive blocked");
    expect(await code(archiveDocument(f.ctx.pm, doc.id))).toBe("RULE_VIOLATION");
  });

  it("lists only in-scope approvals; clients see approvals assigned on their projects", async () => {
    const { approval } = await docWithApproval("Listing");
    expect((await listApprovals(f.ctx.anil, { mine: "1" })).some((a) => a.id === approval.id && a.canDecide)).toBe(true);
    expect((await listApprovals(f.ctx.bina)).some((a) => a.id === approval.id)).toBe(false);
    expect((await listApprovals(other.ctx.owner)).some((a) => a.id === approval.id)).toBe(false);
  });

  it("client activity shows only client-visible events", async () => {
    const items = await listActivity(f.ctx.anil, { limit: 200 });
    expect(items.length).toBeGreaterThan(0);
    const raw = await db.activity.findMany({ where: { id: { in: items.map((i) => i.id) } } });
    expect(raw.every((r) => (r.metadata as { clientVisible?: boolean } | null)?.clientVisible === true)).toBe(true);
  });
});

describe("change requests", () => {
  const base = { title: "Google + Microsoft login", originalScope: "Email login", requestedChange: "Google + Microsoft login", impact: "Adds 2 days", estimatedHours: 12, additionalCost: 8000 };

  async function pendingCR() {
    const cr = await createChangeRequest(f.ctx.pm, { projectId: f.pA.id, ...base });
    await transitionChangeRequest(f.ctx.pm, cr.id, "send");
    return cr;
  }

  it("creates a draft with impact, hours and cost", async () => {
    const cr = await createChangeRequest(f.ctx.pm, { projectId: f.pA.id, ...base });
    expect(cr.status).toBe("DRAFT");
    expect(Number(cr.estimatedHours)).toBe(12);
    expect(Number(cr.additionalCost)).toBe(8000);
    expect(cr.number).toBeGreaterThan(0);
  });

  it("client-raised requests ignore internal estimates; clients can't see internal drafts", async () => {
    const mine = await createChangeRequest(f.ctx.anil, { projectId: f.pA.id, title: "Dark mode", requestedChange: "Dark theme", estimatedHours: 1, additionalCost: 1 });
    expect(Number(mine.additionalCost)).toBe(0);
    expect(mine.requestedById).toBe(f.users.anil.id);
    const internal = await createChangeRequest(f.ctx.pm, { projectId: f.pA.id, ...base, title: "Internal idea" });
    const visible = await listChangeRequests(f.ctx.anil);
    expect(visible.some((c) => c.id === mine.id)).toBe(true);
    expect(visible.some((c) => c.id === internal.id)).toBe(false);
    expect(await code(getChangeRequest(f.ctx.anil, internal.id))).toBe("NOT_FOUND");
    expect(await code(createChangeRequest(f.ctx.bina, { projectId: f.pA.id, title: "Not my project" }))).toBe("NOT_FOUND");
  });

  it("requires impact and hours before sending, and freezes content once sent", async () => {
    const cr = await createChangeRequest(f.ctx.pm, { projectId: f.pA.id, title: "Incomplete" });
    expect(await code(transitionChangeRequest(f.ctx.pm, cr.id, "send"))).toBe("RULE_VIOLATION");
    await updateChangeRequest(f.ctx.pm, cr.id, { requestedChange: "X", impact: "Y", estimatedHours: 4, additionalCost: 2000 });
    await transitionChangeRequest(f.ctx.pm, cr.id, "send");
    expect(await code(updateChangeRequest(f.ctx.pm, cr.id, { additionalCost: 1 }))).toBe("RULE_VIOLATION");
    expect((await db.changeRequest.findUniqueOrThrow({ where: { id: cr.id } })).submittedAt).not.toBeNull();
    expect(await db.notification.count({ where: { userId: f.users.anil.id, kind: "change_request.send", href: `/change-requests/${cr.id}` } })).toBe(1);
  });

  it("client approves; tasks can then be created on confirmation and reference the CR", async () => {
    const cr = await pendingCR();
    expect(await code(createImplementationTasks(f.ctx.pm, cr.id, { tasks: [{ title: "Too early", phaseId: f.pA.phases[0]!.id, estimatedHours: 1 }] }))).toBe("RULE_VIOLATION");
    await decideChangeRequest(f.ctx.anil, cr.id, "approve", { note: "Go ahead" });
    const approved = await db.changeRequest.findUniqueOrThrow({ where: { id: cr.id } });
    expect(approved.status).toBe("APPROVED");
    expect(approved.decidedById).toBe(f.users.anil.id);
    expect(approved.decisionOnBehalf).toBe(false);
    expect(approved.resolvedAt).not.toBeNull();
    expect(await db.task.count({ where: { changeRequestId: cr.id } })).toBe(0); // nothing automatic

    const res = await createImplementationTasks(f.ctx.pm, cr.id, {
      feature: { name: "SSO login", phaseId: f.pA.phases[0]!.id },
      tasks: [
        { title: "Google OAuth", phaseId: f.pA.phases[0]!.id, estimatedHours: 4 },
        { title: "Microsoft OAuth", phaseId: f.pA.phases[0]!.id, estimatedHours: 4 },
        { title: "Callback handling", phaseId: f.pA.phases[0]!.id, estimatedHours: 2 },
        { title: "QA", phaseId: f.pA.phases[1]!.id, estimatedHours: 2 },
      ],
    });
    expect(res.tasks).toHaveLength(4);
    const tasks = await db.task.findMany({ where: { changeRequestId: cr.id } });
    expect(tasks).toHaveLength(4);
    expect(tasks.every((t) => t.featureId === res.featureId)).toBe(true);
    expect(await db.activity.count({ where: { entityId: cr.id, action: "change_request.tasks_created" } })).toBe(1);

    const scope = await getScopeSummary(f.ctx.pm, f.pA.id);
    expect(scope.approvedChanges.features).toBe(1);
    expect(scope.current.features).toBe(scope.original.features + scope.approvedChanges.features);
    expect(scope.approvedChanges.cost).toBeGreaterThanOrEqual(8000);

    expect(await code(transitionChangeRequest(f.ctx.pm, cr.id, "implement"))).toBe("RULE_VIOLATION"); // tasks open
    await db.task.updateMany({ where: { changeRequestId: cr.id }, data: { status: "DONE" } });
    await transitionChangeRequest(f.ctx.pm, cr.id, "implement");
    expect((await db.changeRequest.findUniqueOrThrow({ where: { id: cr.id } })).status).toBe("IMPLEMENTED");
    expect(await code(createImplementationTasks(f.ctx.pm, cr.id, { tasks: [{ title: "Late", phaseId: f.pA.phases[0]!.id, estimatedHours: 1 }] }))).toBe("RULE_VIOLATION");
  });

  it("rejection is preserved with its reason and cannot create tasks", async () => {
    const cr = await pendingCR();
    expect(await code(decideChangeRequest(f.ctx.anil, cr.id, "reject", {}))).toBe("VALIDATION");
    await decideChangeRequest(f.ctx.anil, cr.id, "reject", { note: "Out of budget" });
    const r = await db.changeRequest.findUniqueOrThrow({ where: { id: cr.id } });
    expect(r.status).toBe("REJECTED");
    expect(r.clientDecision).toBe("Out of budget");
    expect(r.deletedAt).toBeNull();
    expect(await code(createImplementationTasks(f.ctx.pm, cr.id, { tasks: [{ title: "No", phaseId: f.pA.phases[0]!.id, estimatedHours: 1 }] }))).toBe("RULE_VIOLATION");
    expect(await code(decideChangeRequest(f.ctx.anil, cr.id, "approve", {}))).toBe("RULE_VIOLATION");
    expect(await db.notification.count({ where: { userId: f.users.pm.id, kind: "change_request.rejected" } })).toBeGreaterThan(0);
  });

  it("unauthorized client actions are refused", async () => {
    const cr = await pendingCR();
    expect(await code(decideChangeRequest(f.ctx.bina, cr.id, "approve", {}))).toBe("NOT_FOUND");
    expect(await code(cancelChangeRequest(f.ctx.anil, cr.id, { reason: "x" }))).toBe("FORBIDDEN");
    expect(await code(updateChangeRequest(f.ctx.anil, cr.id, { additionalCost: 0 }))).toBe("FORBIDDEN");
    expect(await code(transitionChangeRequest(f.ctx.anil, cr.id, "withdraw"))).toBe("FORBIDDEN");
    expect(await code(decideChangeRequest(other.ctx.owner, cr.id, "approve", { onBehalf: true, note: "x" }))).toBe("NOT_FOUND");
  });

  it("internal users can only record a client decision explicitly on their behalf", async () => {
    const cr = await pendingCR();
    expect(await code(decideChangeRequest(f.ctx.pm, cr.id, "approve", {}))).toBe("RULE_VIOLATION");
    expect(await code(decideChangeRequest(f.ctx.pm, cr.id, "approve", { onBehalf: true }))).toBe("VALIDATION");
    await decideChangeRequest(f.ctx.pm, cr.id, "approve", { onBehalf: true, note: "Approved by email on 3 Oct" });
    const r = await db.changeRequest.findUniqueOrThrow({ where: { id: cr.id } });
    expect(r.decisionOnBehalf).toBe(true);
    const act = await db.activity.findFirstOrThrow({ where: { entityId: cr.id, action: "change_request.approved" } });
    expect(act.summary).toMatch(/recorded by Pat Manager/);
  });

  it("cancel requires a reason; cancelled CRs are kept", async () => {
    const cr = await createChangeRequest(f.ctx.pm, { projectId: f.pA.id, title: "Drop me" });
    expect(await code(cancelChangeRequest(f.ctx.pm, cr.id, { reason: "" }))).toBe("VALIDATION");
    await cancelChangeRequest(f.ctx.pm, cr.id, { reason: "Duplicate" });
    const c = await db.changeRequest.findUniqueOrThrow({ where: { id: cr.id } });
    expect(c.status).toBe("CANCELLED");
    expect(c.cancellationReason).toBe("Duplicate");
  });
});

describe("audit", () => {
  it("audit entries cannot be updated or deleted", async () => {
    const a = await db.activity.findFirstOrThrow({ where: { workspaceId: f.ws.id } });
    await expect(db.activity.update({ where: { id: a.id }, data: { summary: "tampered" } })).rejects.toThrow(/append-only/);
    await expect(db.activity.delete({ where: { id: a.id } })).rejects.toThrow(/append-only/);
  });
});
