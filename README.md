# Project Command Center

An operating system for software project delivery, built for freelancers and small agencies.
It's not a generic task board: it follows the full delivery lifecycle.

```
Client → Requirements → Proposal → Scope → Project → Phases → Features → Tasks
→ QA → Client review → Approval → Payment → Deployment → Handover → Maintenance
```

Open a project and you can see what's being built, what's happening now, what's blocked,
what the client approved, what changed, how many hours went in, how much money came in
and is still due, whether you're profitable, and what to do next.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · PostgreSQL 16 · Prisma 6 · Zod · Vitest

It's built as a modular monolith. Read **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the schema,
entity relationships, routes, permission model, API structure and delivery phases.

## Getting started

```bash
cp .env.example .env              # set DATABASE_URL
docker compose up -d              # or use any PostgreSQL 16
npm install
npx prisma migrate deploy
npm run db:seed                   # demo data (dev only; truncates all tables)
npm run dev
```

Sign in at http://localhost:3000 with `demo@pcc.dev` / `demo-password-2026` (Owner).
Other demo users share the same password: `priya@pcc.dev` (Developer), `vikram@pcc.dev` (QA),
`meera@pcc.dev` (Finance). Client users (each sees only their own project, shared documents and no financials):
`anil@apexretail.example` (Apex Retail, has a pending approval), `suresh@kumarclinic.example`, `fatima@bloomorganics.example` (has a change request to review).

| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` · `typecheck` · `test` | ESLint (zero warnings) · `tsc` · Vitest (unit + integration against `<db>_test`, created automatically) |
| `npm run e2e` | Browser walkthroughs (Phase 1 + Phase 3) against a running, seeded app |
| `npm run db:migrate` | Create/apply a migration in development |
| `npm run db:deploy` | Apply migrations (CI / production) |
| `npm run db:seed` | Load demo data, dates relative to today |

## What's built (first build)

**Foundation and execution:** these modules are fully working.

- **Auth and tenancy:** registration creates a workspace (Owner). Sessions use bcrypt hashes and SHA-256-hashed opaque tokens in an httpOnly SameSite cookie, with a 30-day rolling expiry. Login is rate-limited.
- **App shell:** collapsible sidebar with tooltips, mobile bottom nav, global search (**⌘/Ctrl+K**, grouped results), Quick Add (**N**), notifications (read / unread / mark all), workspace and project switcher, and a running-timer chip.
- **Dashboard:** KPIs, active projects ranked by health, *Needs attention*, upcoming deadlines (overdue / today / tomorrow / this week / next week), and recent activity. Every number comes from the database.
- **Clients:** list with search, filter, sort and column visibility, plus financial roll-ups. Detail page has tabs for projects, contacts, documents, invoices, payments, approvals, change requests and activity. Full create, edit and delete, and contact management.
- **Projects:** table, grid, kanban and timeline views, with filters for client, status, priority, health and payment. Create from standard phases. Status changes follow the allowed transitions, and a project **cannot be completed until its required handover items are done**.
- **Project detail:** a header with progress, current phase, deadline and contract value, plus 16 tabs. The Overview tab shows health with reasons, phases, blocked/overdue work, next up, effort variance, money (received, outstanding, overdue, labour, expenses, actual vs expected profit and margin), approvals and scope changes.
- **Phases:** create, edit, reorder, change status, set dependencies and delete. Progress and hours are rolled up from tasks.
- **Features:** grouped by phase, with priority, status, estimate vs actual, dependencies and an acceptance-criteria checklist QA can verify.
- **Tasks:** list and board views across projects or within one. The detail page has quick actions (start/stop timer, mark complete, move to review, assign, change priority), subtasks, comments, time tracking with variance warnings, dependencies, and an activity log. A task **can't be completed while its dependencies are open**.
- **Activity / audit log:** every mutation is recorded. A database trigger rejects `UPDATE`/`DELETE` on `activities`.

**Phase 3: documents and client control** (see [docs/PHASE-3.md](docs/PHASE-3.md)):

- **Documents:** upload to S3-compatible or local storage (never PostgreSQL). Uploads are content-sniffed, size-capped and get generated storage keys. Every revision is an immutable version, numbered server-side. Downloads go through short-lived signed URLs. Clients see only the versions you share.
- **Approvals:** pinned to the exact version ("Approval requested for Requirements v2"). The assigned client approves, rejects (with a reason) or requests changes (with a comment). Decided approvals are frozen by a database trigger.
- **Change requests:** a separate workflow from draft through impact, hours and cost to client approval, then implementation. Rejections are kept. Confirm-first implementation tasks are linked to the CR.
- **Scope protection:** original scope + approved changes = current scope, on the project Overview and Scope tabs.
- **Audit and notifications:** every action is audited (clients see only client-visible events), with in-app notifications for both sides.

**Live data, view-only for now.** These records are in the schema and seeded, and their editing workflows ship in later phases (each view is labelled):
bugs (with expected / actual / reproduction steps), milestones / invoices / payments / expenses, profitability, calendar (month view aggregating every dated obligation), deployments, handover and maintenance.

**Planned** (see roadmap pages in the app): reports and export, and the AI assistant / requirement analyzer / proposal generator.

## File storage

Set `STORAGE_DRIVER=local` (default; files go in `./storage`) or `STORAGE_DRIVER=s3` with `S3_BUCKET`, `S3_REGION`,
`S3_ENDPOINT` (for R2 / MinIO etc.), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` and `S3_FORCE_PATH_STYLE`. In production with the
local driver, `STORAGE_SIGNING_SECRET` (32+ characters) is required. Other settings: `MAX_UPLOAD_MB` (default 25) and `SIGNED_URL_TTL_SECONDS`
(default 300). See `.env.example`.

## Key design decisions

- **Services own the rules.** Pages, server actions and `/api/v1` route handlers only parse input and call
  services in `src/server/services`. Services authorize, validate with Zod, enforce business rules, and write the audit log.
- **Tenant isolation is server-side.** Every row has `workspace_id`. All project-scoped queries go through
  `projectScope(ctx)`: Developer, Designer and QA see only projects they belong to, and Client sees only their client's projects.
  Financial fields are stripped from responses for roles without `finance.view`.
- **Derived, not stored.** Progress, health, outstanding amounts and profit are computed from tasks, time entries,
  invoices, payments and expenses by pure, unit-tested engines in `src/server/domain`, so they can't drift.
- **Health engine.** It scores deadline risk, schedule slip, overdue and blocked tasks, effort overrun against earned value,
  critical bugs, overdue or pending approvals, unapproved scope changes and overdue invoices. It returns
  `HEALTHY / AT_RISK / CRITICAL` with human-readable reasons.
- **CSRF:** SameSite=Lax cookies, an Origin check on mutating `/api` requests in middleware, and Next.js's built-in origin check for server actions.

## Project layout

```
prisma/            schema.prisma, migrations (audit/version/approval immutability triggers, CHECKs), seed.ts
e2e/               browser walkthroughs (playwright-core)
test/              integration-test setup and fixtures
src/app/           (auth) and (app) route groups, api/v1 REST handlers
src/components/    ui/ primitives, shell/ (sidebar, topbar, command palette)
src/features/      module UI + server actions
src/server/        auth, authz, api handler, services, domain engines, validation
src/lib/           client-safe status definitions, dates, formatting
```
