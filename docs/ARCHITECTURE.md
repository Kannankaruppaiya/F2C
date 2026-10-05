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
| Framework | Next.js 15 (App Router), React 19, TypeScript (strict) | Server components by default; client components only for interaction |
| Styling | Tailwind CSS 4 | Design tokens in `src/app/globals.css` |
| Database | PostgreSQL 16 | |
| ORM | Prisma 6 | Migrations in `prisma/migrations` |
| Validation | Zod | Shared schemas in `src/server/validation` used by actions and API |
| Auth | First-party session auth | bcrypt (cost 12) password hashes, opaque session tokens stored as SHA-256 hashes, httpOnly cookie |
| Rate limiting | `RateLimiter` interface | In-memory implementation now; Redis implementation planned (Phase 7) |
| File storage | S3-compatible object storage (Phase 3) | DB stores metadata only (`document_versions.storage_path`) |
| Jobs | BullMQ + Redis (Phase 5+) | Reminders, overdue detection, notification fan-out |
| AI | LLM API with structured outputs + tool calling (Phase 6) | Tools read through the same service layer → same authorization |
| Tests | Vitest | Domain engines (health, progress, finance) are pure and unit-tested |

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
| 6 | Documents are versioned | `document_versions`, unique `(document_id, version)` |
| 7 | Approvals reference the exact version | `approvals.document_version_id` |
| 8 | Change requests are separate from tasks | own table |
| 9 | Approved CRs can generate tasks | `tasks.change_request_id` |
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
| document.approve | | | | | | | | ✓ (+ OWNER on behalf) |
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
/bugs, /calendar, /documents, /approvals, /change-requests, /deployments, /handover,
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
-- planned --
/projects/:id/documents, /invoices, /payments, /change-requests
POST /ai/project-summary, /ai/requirement-analysis, /ai/proposal, /ai/risk-analysis
```

Mutations from the browser are protected against CSRF by `SameSite=Lax` cookies plus an
`Origin`/`Host` check in `middleware.ts` for every non-GET `/api` request. Server actions
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
    domain/                          pure engines: health, progress, finance
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
| 3 Documents & client control | Documents, versioning, approvals, change requests, activity | schema + activity built |
| 4 Finance | Milestones, invoices, payments, expenses, profitability | schema + read models built |
| 5 Delivery | Calendar, deployments, handover, maintenance, notifications | schema + notifications built |
| 6 AI | Assistant, requirement analyzer, proposal, risk | planned |
| 7 Hardening | Redis rate limit, monitoring, backups, CI/CD | partial (CI, rate limit) |
