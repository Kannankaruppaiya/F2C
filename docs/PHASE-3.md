# Phase 3 — Documents, Versioning, Approvals, Change Requests

Design: [ARCHITECTURE.md §10](ARCHITECTURE.md#10-phase-3--documents-versioning-approvals-change-requests).
Phase 1 behaviour is unchanged; Phase 3 evolves the Phase 1 tables in place.

## Implemented features

### Documents and storage
- **Documents list** (`/documents`, project *Documents* tab, client *Documents* tab). Columns: Name, Category, Version, Status, Updated, Owner, Actions. Filters: search, category, status (archived hidden by default), project, phase, sort.
- **Upload**: a dialog posts a multipart request to the API. The server validates and stores the file and creates v1. A document belongs to a project, or directly to a client (client-level documents; managers only).
- **Document detail** (`/documents/[id]`):
  - Header: name, category, status, current version.
  - Actions: Download, Upload new version, Request approval, Archive/Restore.
  - Sections: Current version, Version history, Approvals, Overview, Activity.
- **Versioning**:
  - Every upload is a new immutable version. The number is allocated on the server, inside the transaction that moves `current_version_id`.
  - Concurrent uploads get distinct numbers (unique index plus retry).
- **Sharing**:
  - Clients see only the versions you share or send for approval.
  - Sharing is per version and notifies the client's users ("New document version available").
- **Storage**:
  - A `StorageProvider` interface with `LocalStorageProvider` (filesystem, HMAC-signed expiring tokens) and `S3StorageProvider` (any S3-compatible service, presigned `GetObject`). Selected by `STORAGE_DRIVER`.
  - Binaries are never stored in PostgreSQL.
  - Downloads are authorised first, then 302-redirect to a short-lived signed URL (default 5 min).
- **Upload validation**:
  - Extension allow-list (PDF, DOCX, XLSX, PPTX, PNG, JPG, TXT).
  - Content sniffing: magic bytes, OOXML part names, and UTF-8/NUL checks for text, which also reject HTML/SVG/XML disguised as text. The stored MIME type is the detected type.
  - A declared MIME type that contradicts the extension is rejected.
  - Filenames are sanitised.
  - Size is capped by `MAX_UPLOAD_MB`, checked via `Content-Length` before the body is read, after reading, and by the middleware body cap.

### Approvals
- **Pinned to exact versions** (`document_id` + `document_version_id`). The title is a snapshot, e.g. "Requirements v2".
- **Uploading v3 never changes an approval of v2.** A superseded approval is labelled as such, and deciding it affects only v2.
- **Request flow** (internal): Request approval → pick a client approver of the project's client → optional due date and message → send. This shares that version and notifies the approver.
- **Client flow**: Approvals → open → View/Download → Approve, Request changes (comment required) or Reject (reason required). Each opens a confirmation dialog.
- **Internal cancel** of pending requests, with confirmation.
- **"Approval viewed"** is recorded the first time the assigned approver opens the request.
- **Immutable history**:
  - The database rejects any update to a decided approval, and any delete.
  - Decisions use a conditional `WHERE status = 'PENDING'` update, so two concurrent decisions can't both succeed.
- **Changes requested** never creates a version automatically. The team uploads v4 when ready.

### Change requests
- A separate entity with its own lifecycle: Draft → Under review → Pending client approval → Approved / Rejected → Implemented; Cancelled from any open state.
- Fields: impact analysis, estimated hours, additional cost, priority, original scope vs requested change, client decision, decided-by, on-behalf flag, submitted / resolved / implemented timestamps, cancellation reason.
- **Rules**:
  - Sending requires the requested change, an impact statement and hours > 0.
  - The estimate is locked while the client reviews it ("Withdraw" returns the CR to review).
- **Client decisions**:
  - Clients approve or reject (a reason is required to reject).
  - Internal managers can only *record* a decision the client made offline. This needs an explicit on-behalf confirmation and a note, and the audit entry says "recorded by …".
- **Client-raised requests**: clients can raise change requests for their own projects. Estimates are internal until the CR is sent to the client.
- **Implementation tasks**:
  - On an **approved** CR, a confirm-first dialog lets the user edit the proposed tasks (title, phase, hours, assignee), optionally create a feature for the change, then create everything in one transaction.
  - Every task (and the feature) references the CR.
  - Any other status is refused.
- **Mark implemented** requires all implementation tasks to be done.
- Rejected and cancelled CRs are kept with their reason. There is no delete path.
- `additional_cost` is the single source of truth for Phase 4 invoicing.

### Scope protection
- Project **Overview** and **Scope** tab show *Original scope* (features with no CR), *Approved changes* (features linked to approved/implemented CRs, plus CR count, hours and cost), and *Current scope* = X + Y, along with pending and rejected CR counts.
- The feature dialog has a *Scope origin* field to attribute a feature to an approved CR.

### Activity and notifications
- Every document, approval and CR action writes an append-only audit event that references the entity (`entityType`/`entityId`) and, in metadata, `documentId`, `versionId`, `versionNumber`, `approvalId` and `changeRequestId`.
  - Examples: "Requirements v3 uploaded", "UI Design v3 sent to Anil Kapoor for approval", "UI Design v2 approved by Anil Kapoor", "CR-014 created", "CR-013 approved by Anil Kapoor", "CR-013 implementation tasks created (2)".
- **Client-visible events** are flagged `clientVisible`. Client users see only those.
- **In-app notifications** (email is not implemented):
  - Internal users: client approved / rejected / requested changes; CR approved / rejected; client raised a CR.
  - Clients: approval requested, new document version available, CR requires review, CR withdrawn or implemented.
- **Global search** now includes documents and change requests. *Quick Add* "Upload Document" and "New Change Request" are enabled.

## Database changes
Migration `20261006090000_phase3_documents_approvals_change_requests` (hand-written; no data loss, verified against seeded data; `prisma migrate diff` reports no drift):

| Table | Change |
|---|---|
| enums | `DocumentCategory`: `CLIENT_APPROVALS→APPROVAL`, `INVOICES→INVOICE`, `+OTHER` · `ApprovalStatus +CANCELLED` · `ChangeRequestStatus PENDING_INTERNAL_REVIEW→UNDER_REVIEW` (all `RENAME VALUE`) |
| `documents` | `project_id` nullable; `+client_id`, `+change_request_id`, `+description`, `+created_by_id`; CHECK `documents_single_owner` (exactly one of project/client) |
| `document_versions` | renamed `version→version_number`, `file_name→original_filename`, `storage_path→storage_key` (now unique), `size_bytes→file_size`, `change_notes→change_summary`; `+shared_at`; trigger `document_versions_immutable` |
| `approvals` | `+document_id` (backfilled, NOT NULL), `document_version_id` NOT NULL, `+requester_id`, `+approver_id`, `+request_message`, `+viewed_at`; renamed `decided_at→responded_at`, `decided_by_name→responded_by_name`; partial unique index (one pending per version); trigger `approvals_immutable` |
| `change_requests` | renamed `additional_hours→estimated_hours`, `decided_at→resolved_at`; `+requested_by_id`, `+client_decision`, `+decided_by_id`, `+decision_on_behalf`, `+cancellation_reason`, `+submitted_at`, `+implemented_at`; non-negative CHECKs |
| `features` | `+change_request_id` (scope provenance) |

## Routes
UI: `/documents`, `/documents/[id]`, `/approvals` (`?view=all`), `/approvals/[id]`, `/change-requests` (`?new=1`), `/change-requests/[id]`. Project tabs: Documents, Approvals, Change Requests, Scope.

API (`/api/v1`, every handler authenticates, checks workspace membership, role permission and entity scope, and validates input with Zod):
```
GET/POST   /documents                       list · create (multipart)
GET/PATCH  /documents/:id                   metadata · edit metadata
POST       /documents/:id/versions          upload version (multipart)
POST       /documents/:id/share | /archive | /restore
GET        /documents/:id/versions/:vid/download[?inline=1]   → 302 signed URL
GET        /files/:token                    local-driver signed download
GET/POST   /approvals                       list · request
GET        /approvals/:id                   detail (records first view)
POST       /approvals/:id/approve | /reject | /request-changes | /cancel
GET/POST   /change-requests                 list · create
GET/PATCH  /change-requests/:id
POST       /change-requests/:id/submit | /send | /withdraw | /approve | /reject | /cancel | /implement
POST       /change-requests/:id/tasks       create implementation tasks
GET        /projects/:id/approvers          eligible client approvers
```

## Permissions
New permissions: `document.manage`, `approval.request`, `changeRequest.request`, `changeRequest.decide`. Owner and Admin no longer hold `document.approve` (approving is the client's act). The full matrix is in ARCHITECTURE.md §4 and §10.7; row scopes are `documentScope`, `versionScope`, `approvalScope` and `changeRequestScope` in `src/server/authz/context.ts`.

Client users:
- **Can** see documents of their own client's projects, but only versions shared with them; download those versions; approve, reject or request changes only on approvals **assigned to them**; raise CRs for their projects and decide CRs sent to them.
- **Cannot** upload, edit metadata, share, archive, delete, cancel approvals, modify approval history, see internal drafts, estimates, task breakdowns or financials, or reach another workspace, client or project. Out-of-scope IDs return 404.

## Business rules (enforced server-side; several also in the database)
1. Version numbers are allocated on the server; versions are immutable (DB trigger); keys never reuse or overwrite.
2. An approval references an exact version; decided approvals are immutable (DB trigger); at most one pending approval per version (DB index).
3. Approvals are requested only for a project document's current version, and only from a client user of that project's client.
4. Only the assigned approver may decide; reject and request-changes require a comment.
5. Archiving is blocked while an approval is pending; archived documents accept no uploads and are hidden from clients.
6. A CR's content is editable only in Draft / Under review; sending requires impact, change and hours.
7. Only approved CRs can generate implementation tasks, and only after explicit confirmation.
8. Rejected and cancelled CRs are kept with their reason.
9. Multi-record operations are single transactions (ARCHITECTURE.md §10.9). Uploads write the blob first, then the transaction; the blob is deleted if the transaction fails.

## Testing
- `src/server/storage/storage.test.ts`: upload validation (types, spoofing, size, names), Content-Disposition encoding, key generation, local provider (no overwrite, root confinement, signed and expiring tamper-proof tokens), and **S3 provider against a live S3-compatible endpoint** (runs when `S3_TEST_ENDPOINT` is set).
- `src/server/domain/workflow.test.ts`: approval and CR state machines, superseded-version effects, task-generation eligibility, send readiness.
- `src/server/services/phase3.integration.test.ts`: **real PostgreSQL** (`<db>_test`, recreated per run) and real local storage:
  - Documents and versions: creation, numbering (including concurrent uploads), immutability, spoofed/oversized rejection, upload permissions, cross-workspace IDOR.
  - Client access: shared-only documents and versions, another client's document, share notifications.
  - Approvals: creation, approve, reject, changes requested, v2 unchanged by v3, decided-approval immutability, one pending per version, approver eligibility, wrong-client and non-assignee refusals, internal cannot approve, client cannot request or cancel, first-view audit, cancel, archive blocking, list scoping, client activity filtering.
  - Change requests: creation, client-raised requests, readiness and freeze, approval, task generation and scope summary, implement, rejection preserved and unable to create tasks, unauthorised client actions, on-behalf recording, cancel.
  - Audit entries cannot be updated or deleted.
- Browser walkthroughs (`npm run e2e`, needs a running app with seeded data):
  - `e2e/walkthrough.mjs`: the Phase 1 flow, unchanged.
  - `e2e/phase3.mjs`: spoofed-upload rejection, upload v1/v2, signed download, approval request, CR draft → estimate → send, client requests changes and approves, client cannot see internal docs or upload (403), client approves the CR, confirm-first implementation tasks, document audit trail.

## Known limitations
- **No client invitation UI yet.** Approvals need a client portal user for the project's client; the demo seed creates them. User management is planned with RBAC hardening (Phase 7).
- **Email is not implemented.** Notifications are in-app only. There are no due-date reminders.
- **Uploads go through the app server**, buffered in memory up to `MAX_UPLOAD_MB`. There are no direct-to-S3 presigned uploads, no resumable uploads, and no antivirus scanning.
- **Previews**: PDF/PNG/JPEG open inline; DOCX/XLSX/PPTX/TXT download only.
- **Orphaned blobs** (if a compensating delete fails) are logged, not swept; there is no cleanup job yet.
- **Sharing a version cannot be revoked** (by design: the client may already have downloaded it).
- **Client-level documents** (no project) cannot be sent for approval, and their activity is not shown to client users.
- **Document metadata editing** is available via `PATCH /api/v1/documents/:id` but has no UI form yet.
- `S3StorageProvider.put` uses `If-None-Match: *` to refuse overwrites. AWS S3 supports this; some S3-compatible stores may ignore it (keys are random UUIDs, so collisions are not expected either way).
- The live S3 test is skipped in CI unless `S3_TEST_ENDPOINT` is provided.
- Invoicing approved CRs is deferred to Phase 4 (`additional_cost` is ready for it).
