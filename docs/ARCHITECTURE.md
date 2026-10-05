# Project Command Center — Architecture

Project Command Center (PCC) is an operating system for software project delivery:

```
CLIENT → REQUIREMENTS → PROPOSAL → SCOPE → PROJECT → PHASES → FEATURES → TASKS
→ DEVELOPMENT → QA → CLIENT REVIEW → APPROVAL → PAYMENT → DEPLOYMENT → HANDOVER → MAINTENANCE
```

It is a **modular monolith**: one Next.js application, one PostgreSQL database, a strict
service layer that owns authorization and business rules, and thin transport layers
(server actions for the UI, REST route handlers for API consumers) on top.

---

## 1. Stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript (strict) | Server components by default; client components only for interaction |
| Styling | Tailwind CSS 4 | Design tokens in `src/app/globals.css` |
| Database | PostgreSQL 16 | |
| ORM | Prisma 6 | Migrations in `prisma/migrations` |
| Validation | Zod | Shared schemas in `src/server/validation` used by actions and API |
| Auth | First-party session auth | bcrypt (cost 12) password hashes, opaque session tokens stored as SHA-256 hashes, httpOnly cookie |
| Rate limiting | `RateLimiter` interface | In-memory implementation now; Redis implementation planned (Phase 7) |
| File storage | `StorageProvider`: local filesystem or any S3-compatible service | DB stores metadata only (`document_versions.storage_key`); see §10.3 |
| Jobs | BullMQ + Redis (Phase 5+) | Reminders, overdue detection, notification fan-out |
| AI | LLM API with structured outputs + tool calling (Phase 6) | Tools read through the same service layer → same authorization |
| Tests | Vitest + Playwright | Pure domain/storage unit tests; integration tests against a real PostgreSQL `_test` database; browser walkthroughs in `e2e/` |

---

## 2. Multi-tenancy

```
Workspace ─┬─ WorkspaceMember (User + Role [+ Client link for client users])
           ├─ Client ─ ClientContact
           └─ Project ─ Phase ─ Feature ─ Task ─ Subtask
```

* **Every business row carries `workspace_id`.** It is denormalized onto child rows
  (phases, tasks, invoices…) so that every query can be filtered by tenant with a
  single indexed predicate, and so that a bug in a join cannot leak cross-tenant data.
* The active workspace is resolved server-side from the session (`sessions.workspace_id`)
  and validated against `workspace_members` on every request. It is never taken from
  the request body.
* Services receive an `AuthContext` (`userId`, `workspaceId`, `role`, `clientId?`) and
  **all** reads/writes are scoped through it. Route handlers and server actions never
  touch Prisma directly.

---

## 3. Entity relationships

```
users 1─* workspace_members *─1 workspaces
users 1─* sessions

workspaces 1─* clients 1─* client_contacts
clients    1─* projects
projects   1─* project_members *─1 users
projects   1─* phases 1─* features 1─* tasks 1─* subtasks
phases     1─* tasks                      (task may sit directly under a phase)
features   1─* acceptance_criteria
tasks      1─* task_comments, time_entries
tasks      *─* tasks           via task_dependencies
features   *─* features        via feature_dependencies
phases     *─* phases          via phase_dependencies

projects 1─* bugs (→ phase?, feature?, task?)
projects 1─* documents 1─* document_versions
approvals → project, client, document_version (exact version), feature?
projects 1─* change_requests (→ generated tasks via tasks.change_request_id)

projects 1─* milestones (→ phase?)
invoices → client, project, milestone?   invoices 1─* invoice_items
payments → invoice (required)
expenses → project (required)
time_entries → project, phase?, feature?, task?, user

projects 1─* deployments, handover_items
projects 1─1 maintenance_plans

activities → workspace, actor, project?, (entity_type, entity_id)   — append-only
notifications → workspace, user
```

### Business rules enforced in the service layer

| # | Rule | Where |
|---|---|---|
| 1 | Project belongs to a client and a workspace | `projects.client_id`, `projects.workspace_id` NOT NULL; service verifies client is in workspace |
| 2 | Phase belongs to a project | FK |
| 3 | Feature belongs to a phase | FK; `features.project_id` denormalized and verified equal to phase's project |
| 4 | Task belongs to a feature **or** directly to a phase | `phase_id` required, `feature_id` optional; service verifies feature ∈ phase |
| 5 | Bugs link to feature and task | optional FKs, verified ∈ project |
| 6 | Documents are versioned | `document_versions`, unique `(document_id, version_number)`; numbers allocated server-side; file columns immutable (DB trigger) — see §10 |
| 7 | Approvals reference the exact version | `approvals.document_id` + `approvals.document_version_id` NOT NULL; decided approvals immutable (DB trigger) — see §10 |
| 8 | Change requests are separate from tasks | own table |
| 9 | Approved CRs can generate tasks | `tasks.change_request_id`, `features.change_request_id`; only `APPROVED` CRs, only on explicit confirmation — see §10 |
| 10 | Payments are linked to invoices | `payments.invoice_id` NOT NULL |
| 11 | Invoices can link to milestones | `invoices.milestone_id` optional |
| 12 | Expenses belong to a project | `expenses.project_id` NOT NULL |
| 13–14 | Cost/profit from real records | `src/server/domain/finance.ts` — payments, expenses, time × cost rate |
| 15 | Audit log immutable | no update/delete code paths **and** a DB trigger rejecting UPDATE/DELETE on `activities` |
| 16 | Clients cannot see finance | `finance.view` permission not granted to `CLIENT`; DTOs strip financial fields |
| 17 | Delivered only after handover | `projects.status → COMPLETED` blocked while required handover items are pending |
| 18 | Completed → Maintenance | status transition table in `src/lib/status.ts` |

### Conventions

* Primary keys: `cuid()` strings.
* Money: `DECIMAL(14,2)`, currency configured per workspace (default INR). Converted to
  `number` at the service boundary; DTOs never leak Prisma `Decimal`.
* `created_at` / `updated_at` on every mutable table.
* Soft delete (`deleted_at`) on clients, projects, phases, features, tasks, bugs,
  documents, invoices, expenses, change requests. All service queries filter `deleted_at IS NULL`.
* Human-readable sequential keys per workspace where users quote them: `INV-024`, `CR-014`,
  `BUG-031`, `APR-007` (`workspace_counters` table, incremented transactionally).

---

## 4. Permission model

Roles: `OWNER, ADMIN, PROJECT_MANAGER, DEVELOPER, DESIGNER, QA, FINANCE, CLIENT`.

Permissions are code-defined (`src/server/authz/permissions.ts`) and mapped to roles in a
single table. UI hides controls using the same map, but **the server always re-checks**.

| Permission | OWNER | ADMIN | PM | DEV | DESIGN | QA | FINANCE | CLIENT |
|---|---|---|---|---|---|---|---|---|
| project.view | ✓ | ✓ | ✓ | ✓ (member) | ✓ (member) | ✓ (member) | ✓ | ✓ (own client) |
| project.edit / create | ✓ | ✓ | ✓ | | | | | |
| project.delete | ✓ | ✓ | | | | | | |
| client.view | ✓ | ✓ | ✓ | | | | ✓ | |
| client.edit | ✓ | ✓ | ✓ | | | | | |
| phase/feature.edit | ✓ | ✓ | ✓ | | | | | |
| task.create / edit | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | |
| task.assign | ✓ | ✓ | ✓ | | | | | |
| bug.create | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ |
| document.upload | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | |
| document.manage (share, archive, edit) | ✓ | ✓ | ✓ | | | | | |
| approval.request | ✓ | ✓ | ✓ | | | | | |
| document.approve | | | | | | | | ✓ (assigned approvals only) |
| changeRequest.request | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ (own project) |
| changeRequest.manage | ✓ | ✓ | ✓ | | | | | |
| changeRequest.decide | | | | | | | | ✓ (internal can only *record* on behalf) |
| finance.view | ✓ | ✓ | ✓ | | | | ✓ | |
| invoice.create / payment.record | ✓ | ✓ | | | | | ✓ | |
| time.log | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | |
| users.manage | ✓ | ✓ | | | | | | |
| audit.view | ✓ | ✓ | | | | | | |

**Row scoping** (`projectScope(ctx)`):

* OWNER, ADMIN, PROJECT_MANAGER, FINANCE → all workspace projects.
* DEVELOPER, DESIGNER, QA → projects where they are a `project_member`.
* CLIENT → projects whose `client_id` equals the member's linked `client_id`.

---

## 5. Application routes

```
/login, /register                         public
/dashboard                                command center
/projects?view=table|grid|kanban|timeline&status=&client=&priority=&health=&q=&sort=&page=
/projects/new
/projects/[id]                            overview
/projects/[id]/{scope,phases,features,tasks,bugs,documents,approvals,change-requests,
               payments,time,expenses,deployment,handover,maintenance,activity}
/projects/[id]/edit
/clients?q=&status=&sort=&page=
/clients/new
/clients/[id]                             overview (+ ?tab=projects|contacts|…)
/clients/[id]/edit
/tasks?view=list|board&project=&status=&priority=&assignee=&q=
/tasks/[id]
/documents?q=&category=&status=&projectId=&phaseId=&sort=   /documents/[id]
/approvals?view=all   /approvals/[id]
/change-requests?q=&status=&projectId=&new=1   /change-requests/[id]
/bugs, /calendar, /deployments, /handover,
/invoices, /payments, /expenses, /profitability, /reports, /assistant, /settings
```

---

## 6. API structure (`/api/v1`)

All handlers are wrapped by `apiHandler()` (`src/server/api/handler.ts`), which provides:
authentication (session cookie or `Authorization: Bearer` session token), workspace
resolution, Zod validation, typed error mapping (`AppError` → HTTP status + JSON
`{ error: { code, message, details } }`), rate limiting and structured logging.

```
GET    /api/v1/clients                    POST /api/v1/clients
GET    /api/v1/clients/:id                PATCH/DELETE /api/v1/clients/:id
GET    /api/v1/projects                   POST /api/v1/projects
GET    /api/v1/projects/:id               PATCH/DELETE /api/v1/projects/:id
GET    /api/v1/projects/:id/phases        POST /api/v1/projects/:id/phases
GET    /api/v1/projects/:id/features      POST /api/v1/projects/:id/features
GET    /api/v1/projects/:id/tasks         POST /api/v1/projects/:id/tasks
GET    /api/v1/tasks/:id                  PATCH/DELETE /api/v1/tasks/:id
GET    /api/v1/dashboard
GET    /api/v1/search?q=
GET    /api/v1/notifications              POST /api/v1/notifications/read
Phase 3 document, approval and change-request endpoints: see §10.8.
-- planned --
/invoices, /payments
POST /ai/project-summary, /ai/requirement-analysis, /ai/proposal, /ai/risk-analysis
```

Mutations from the browser are protected against CSRF by `SameSite=Lax` cookies plus an
`Origin`/`Host` check in `proxy.ts` (Next.js 16's name for middleware) for every non-GET `/api` request. Server actions
get Next.js' built-in origin check.

---

## 7. Code layout

```
prisma/
  schema.prisma, migrations/, seed.ts
src/
  app/
    (auth)/login, (auth)/register
    (app)/layout.tsx                 shell: sidebar + topbar (auth required)
    (app)/dashboard, projects, clients, tasks, …
    api/v1/**                        thin REST handlers → services
  components/
    ui/                              primitives: Button, Badge, Field, Table, Tabs, Dialog…
    shell/                           Sidebar, Topbar, CommandPalette, QuickAdd, Notifications
  features/<module>/                 module UI + server actions (clients, projects, phases,
                                     features, tasks, dashboard)
  server/
    db.ts
    auth/                            password, session, rate limit
    authz/                           permissions, context, scoping
    api/                             handler, errors, logging
    services/                        one file per aggregate; owns authz + rules + activity log
    storage/                         StorageProvider interface, local + S3 drivers, upload validation
    domain/                          pure engines: health, progress, finance, approval & CR state machines
    validation/                      zod schemas
  lib/                               formatting, status definitions, dates (client-safe)
```

Rules of thumb:

* **Services own the rules.** Transport layers parse input, call one service function, render.
* **Domain engines are pure** (no Prisma) so they are unit-testable and reusable by AI tools.
* **Status definitions live once** in `src/lib/status.ts` (label, tone, order, transitions).
* **No fake data in components.** Every number on screen comes from a query; seed data is
  only loaded by `npm run db:seed`.

---

## 8. Project health engine

`src/server/domain/health.ts` scores a project from real signals:

| Signal | At risk | Critical |
|---|---|---|
| Deadline vs progress | time elapsed exceeds progress by >15 pts, or <7 days left with <85% | past deadline and not delivered |
| Overdue tasks | ≥1 high/critical or ≥3 any | ≥3 high/critical |
| Blocked tasks | ≥1 | ≥3 |
| Effort variance (actual vs estimated hours on completed work) | >10% over | >25% over |
| Pending approvals past due | ≥1 | — |
| Unapproved scope changes (CRs pending client) | ≥1 | — |
| Overdue invoices | ≥1 | overdue > 30 days |

Output: `HEALTHY | AT_RISK | CRITICAL` plus human-readable reasons, e.g.
*"3 high-priority tasks are overdue · Client approval pending for UI Design v3"*.

---

## 9. Delivery plan

| Phase | Scope | State |
|---|---|---|
| 1 Foundation | Auth, workspace, users, clients, projects, dashboard, shell | **built** |
| 2 Execution | Phases, features, tasks, subtasks, progress, time tracking (timer + manual) | **built** (bugs UI next) |
| 3 Documents & client control | Documents, storage, versioning, approvals, change requests, scope protection | **built** — see §10 and `docs/PHASE-3.md` |
| 4 Finance | Milestones, invoices, payments, expenses, profitability | schema + read models built |
| 5 Delivery | Calendar, deployments, handover, maintenance, notifications | schema + notifications built |
| 6 AI | Assistant, requirement analyzer, proposal, risk | planned |
| 7 Hardening | Redis rate limit, monitoring, backups, CI/CD | partial (CI, rate limit) |

---

## 10. Phase 3 — Documents, versioning, approvals, change requests

Phase 1 already created `documents`, `document_versions`, `approvals` and `change_requests`.
Phase 3 **evolves those tables in place** (column/enum renames via `RENAME`, additive columns,
constraints and triggers) — no table is replaced and no data is dropped.

### 10.1 Document model

```
Document (logical entity)                       DocumentVersion (immutable file revision)
  id, workspace_id                                id, workspace_id, document_id
  project_id  ─┐ exactly one owner                version_number   ← allocated server-side
  client_id   ─┘ (CHECK constraint)               storage_key      ← generated, never user input
  phase_id?, feature_id?, change_request_id?      original_filename (sanitised), mime_type (sniffed)
  name, description, category, status             file_size, checksum (SHA-256), change_summary
  current_version_id → DocumentVersion            uploaded_by_id, created_at (= uploaded at)
  created_by_id, created/updated/deleted_at       status (review state), shared_at (client visibility)
```

* **Ownership is stored once.** A project document stores `project_id` (its client is derived
  through the project). A client-level document (e.g. an NDA before any project exists) stores
  `client_id` and no project. `CHECK ((project_id IS NULL) <> (client_id IS NULL))`.
* Phase / feature / change request links are optional and verified to belong to the same project.
* Categories: Requirements, Proposal, Scope, UI/UX, Technical, API, Database, QA, Approval,
  Invoice, Deployment, Handover, Other. Statuses: Draft, Internal Review, Sent to Client,
  Approved, Rejected, Archived.
* Documents are **archived, never deleted**. Archiving is blocked while an approval is pending.

### 10.2 Versioning model

```
Requirements
  ├── v1  (approved by Anil, 12 Aug)
  ├── v2  (changes requested)
  └── v3  ← current_version_id
```

* Every upload creates a new `document_versions` row. `version_number = max + 1` is computed inside
  the transaction that inserts the row and moves `current_version_id`; the unique index
  `(document_id, version_number)` makes concurrent uploads fail safely instead of colliding.
  A client-supplied version number is never read.
* **Immutability is enforced by the database**: a trigger rejects any `UPDATE` that changes
  `document_id, version_number, storage_key, original_filename, mime_type, file_size, checksum,
  change_summary, uploaded_by_id, created_at`. Only the review state (`status`) and the
  client-visibility timestamp (`shared_at`) can change. Storage keys are unique per version, so a
  new upload can never overwrite an old file.

### 10.3 Storage architecture

```
UI / API ──multipart──▶ documents service ──▶ validateUpload() ──▶ StorageProvider.put(key, bytes)
                              │                                        ├─ LocalStorageProvider (dev/CI)
                              └── prisma.$transaction(version + doc)   └─ S3StorageProvider (S3, R2, MinIO…)
download: GET /api/v1/documents/:id/versions/:vid/download ─▶ authorize ─▶ 302 to short-lived signed URL
```

* `src/server/storage` exposes a `StorageProvider` interface (`put`, `getSignedUrl`, `delete`,
  `exists`). `STORAGE_DRIVER=local|s3` selects the implementation; nothing else in the app knows
  which provider is active.
* Binaries never touch PostgreSQL; the DB holds metadata only.
* **Keys are generated**: `w/<workspaceId>/d/<documentId>/<uuid>` — no user-controlled path
  segment ever reaches the provider. The local provider additionally resolves every key inside its
  root directory and rejects anything that escapes it.
* **Signed URLs only.** S3 uses presigned `GetObject` URLs (default 5 min) with
  `response-content-disposition`. The local provider issues HMAC-SHA256-signed, expiring tokens
  served by `GET /api/v1/files/:token` with `nosniff`, a sandboxing CSP and `private` caching.
  Permanent private URLs are never rendered.
* **Upload validation** (`src/server/storage/validate.ts`, pure and unit-tested): extension
  allow-list (pdf, docx, xlsx, pptx, png, jpg/jpeg, txt); **content sniffing** (magic bytes, OOXML
  part names, UTF-8/NUL checks for text) — the detected type must match the extension and the
  stored MIME type is the detected one, not the browser's; a declared MIME type that contradicts
  the extension is rejected; filename sanitised (path segments, control and reserved characters
  stripped, length capped); empty files rejected; size capped by `MAX_UPLOAD_MB` (default 25),
  checked against `Content-Length` before the body is read and again after.
* **Write ordering / compensation**: the object is written first, then the DB transaction runs; if
  the transaction fails the object is deleted. A failed delete is logged (orphan blobs are harmless
  and invisible because no row references them).

### 10.4 Approval state machine

```
                ┌──────────── approve (assigned client) ──▶ APPROVED
PENDING ────────┼──────────── reject + reason ───────────▶ REJECTED
                ├──────────── request changes + comment ─▶ CHANGES_REQUESTED
                └──────────── cancel (internal) ─────────▶ CANCELLED
```

* An approval references `document_id` **and** `document_version_id` (both NOT NULL) plus
  requester, approver (a `CLIENT` member of the project's client), due date, request message,
  response comment, `viewed_at` and `responded_at`. Its title is a snapshot ("Requirements v2").
* **Tied to the exact version**: uploading v3 never touches an approval of v2. A pending approval
  of an older version can still be answered and is shown as "superseded by v3"; the document's
  status only follows decisions on its *current* version.
* Requests are only made for the current version; at most one pending approval per version
  (partial unique index).
* **History is immutable**: a trigger rejects any `UPDATE` of an approval whose status is no longer
  `PENDING`, and any `DELETE`. Decisions are therefore final; a new review round is a new approval.
* Effects: approve → version `APPROVED` (+ document if current); reject → version `REJECTED`,
  reason stored; changes requested → comment stored, document back to `Internal Review`. No new
  version is created automatically — the team decides whether to upload v4.
* The first time the assigned approver opens the approval, `viewed_at` is set and an
  `approval.viewed` audit event is written.

### 10.5 Change request state machine

```
DRAFT ──submit──▶ UNDER_REVIEW ──send to client──▶ PENDING_CLIENT_APPROVAL ──approve──▶ APPROVED ──▶ IMPLEMENTED
  │                    │   ▲                              │      │                          │
  │                    │   └──────── withdraw ────────────┘      └──reject + reason──▶ REJECTED
  └──── cancel ────────┴────────────── cancel ─────────────┘                           (kept forever)
```

* Fields: number (`CR-014`), requester (user and/or name), title, description, original scope,
  requested change, impact, `estimated_hours`, `additional_cost`, priority, status,
  `client_decision` (approval note / rejection reason), decided-by, on-behalf flag,
  `submitted_at`, `resolved_at`, `implemented_at`, `cancellation_reason`.
* Content is editable only in `DRAFT` / `UNDER_REVIEW`. Once sent to the client, the estimate is
  frozen — what the client approves is exactly what they saw. "Withdraw" returns it to review.
* Sending requires an impact statement and estimated hours > 0.
* The client decides in `PENDING_CLIENT_APPROVAL`. An internal manager may **record** a decision
  the client gave offline; it is stored with `decision_on_behalf = true` and the audit entry says so.
* Rejected and cancelled CRs are never deleted (no delete path exists).
* `additional_cost` is the single source of truth for the extra fee: Phase 4 will create the
  milestone/invoice from it rather than copying the value.

### 10.6 Scope protection

```
Original scope   = features with change_request_id IS NULL           (X features, H₀ hours)
Approved changes = features linked to APPROVED/IMPLEMENTED CRs        (Y features)
                 + CR totals: count, estimated hours, additional cost
Current scope    = X + Y
```

Computed by `getScopeSummary()` from live rows (never stored) and shown on the project Overview and
Scope tabs, so increased effort is always explainable.

**CR → tasks**: on an `APPROVED` CR, "Create implementation tasks" opens a confirmation dialog
where the user edits the proposed task list (and may create a feature for the CR). Nothing is
generated automatically. Every created task stores `change_request_id`; the optional feature
stores it too and therefore counts as an approved change. The service refuses for any other status.

### 10.7 Permission rules (server-enforced)

| Permission | Roles | Notes |
|---|---|---|
| `document.upload` | Owner, Admin, PM, Dev, Designer, QA | upload new documents / versions to visible projects |
| `document.manage` | Owner, Admin, PM | edit metadata, share/unshare, archive/restore |
| `approval.request` | Owner, Admin, PM | request / cancel approvals |
| `document.approve` | Client | **and** the approval must be assigned to the caller |
| `changeRequest.request` | all except Finance | create a draft CR (clients: for their own project) |
| `changeRequest.manage` | Owner, Admin, PM | edit, submit, send, withdraw, cancel, record decision, create tasks, mark implemented |
| `changeRequest.decide` | Client | approve / reject CRs of their client's projects while pending |

Row scoping (`documentScope`, `approvalScope`, `changeRequestScope` in `src/server/authz`):

* Workspace-wide roles see all documents; Dev/Designer/QA see documents of projects they belong to.
* **Clients** see a document only if it belongs to their client (directly or via its project),
  is not archived, **and at least one version has been shared** with them; they see only shared
  versions and can download only those. A document becomes shared when an approval is requested for
  a version or a manager explicitly shares a version.
* Clients see CRs they requested plus CRs that have been sent to them (`submitted_at` set);
  internal drafts and estimates are invisible until sent.
* Clients see only client-visible audit events (`metadata.clientVisible = true`).
* Every lookup is `findFirst({ id, ...scope })`, so an ID from another workspace, project or client
  returns **404** (no existence leak), never 403.

### 10.8 API design

All JSON endpoints use `apiHandler` (auth, rate limit, Zod, error envelope, logging); uploads use
`multipart/form-data` with the same wrapper.

```
GET    /api/v1/documents?q&category&status&projectId&phaseId&sort      list
POST   /api/v1/documents                    multipart: file + metadata  create (v1)
GET    /api/v1/documents/:id                                            metadata + visible versions
PATCH  /api/v1/documents/:id                                            edit metadata
POST   /api/v1/documents/:id/versions       multipart: file + summary   upload new version
POST   /api/v1/documents/:id/share          { versionId }               share version with client
POST   /api/v1/documents/:id/archive | /restore
GET    /api/v1/documents/:id/versions/:vid/download?inline=1            302 → signed URL
GET    /api/v1/files/:token                                             local-driver signed download

GET    /api/v1/approvals?status&projectId&mine                         list
POST   /api/v1/approvals                    { documentId, approverId, dueDate?, message? }
GET    /api/v1/approvals/:id                                            (records first view)
POST   /api/v1/approvals/:id/approve | /reject | /request-changes | /cancel

GET    /api/v1/change-requests?status&projectId                        list
POST   /api/v1/change-requests                                          create (draft)
GET    /api/v1/change-requests/:id   PATCH /api/v1/change-requests/:id
POST   /api/v1/change-requests/:id/submit | /send | /withdraw | /approve | /reject | /cancel | /implement
POST   /api/v1/change-requests/:id/tasks    { tasks[], feature? }       create implementation tasks
```

### 10.9 Transaction boundaries

| Operation | Single transaction |
|---|---|
| Create document | document + version 1 + `current_version_id` + activity (after blob write) |
| Upload version | version (number allocated in-tx) + `current_version_id` + document status + activity + client notifications |
| Request approval | approval (number allocated) + version/document status + `shared_at` + activity + notification |
| Decide approval | conditional update `WHERE status = 'PENDING'` (race-safe) + version/document status + activity + notifications |
| CR transitions | conditional status update `WHERE status = <expected>` + activity + notifications |
| CR → tasks | optional feature + all tasks (numbers allocated) + activity — all or nothing |

### 10.10 Security considerations

* **IDOR / cross-tenant**: every query includes the workspace and the role scope; tested with
  cross-workspace and cross-client fixtures.
* **Path manipulation**: storage keys are server-generated; local provider confines keys to its root.
* **Unsafe filenames**: sanitised before storage and before use in `Content-Disposition`
  (RFC 5987 `filename*` encoding).
* **MIME spoofing**: content sniffing decides the type; HTML/SVG/scripts are not accepted; downloads
  are `attachment` except PDF/PNG/JPEG previews, always with `nosniff` and a sandbox CSP.
* **Oversized uploads**: `Content-Length` pre-check, post-read check, middleware body cap aligned
  with `MAX_UPLOAD_MB`.
* **Signed URL leakage**: 5-minute expiry; local tokens are HMAC-signed with `STORAGE_SIGNING_SECRET`
  (required in production).
* **Audit**: approval/CR/document events are append-only `activities` rows (existing trigger).

