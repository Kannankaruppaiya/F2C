import Link from "next/link";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyState, AvatarName } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatDateTime, type MoneyFormat } from "@/lib/format";
import { toISODate } from "@/lib/dates";
import { APPROVAL_STATUS, BUG_SEVERITY, BUG_STATUS, CHANGE_REQUEST_STATUS, DEPLOYMENT_STATUS, DOCUMENT_STATUS, INVOICE_STATUS, PRIORITY } from "@/lib/status";
import type { listApprovals, listBugs, listChangeRequests, listDeployments, listDocuments, listExpenses, listInvoices, listPayments } from "@/server/services/records";

type R<F extends (...a: never[]) => Promise<unknown[]>> = Awaited<ReturnType<F>>;

const ProjectLink = ({ p }: { p: { id: string; name: string } }) => (
  <Link href={`/projects/${p.id}`} className="text-ink-2 hover:text-accent">{p.name}</Link>
);

export function InvoiceTable({ rows, fmt, showProject }: { rows: R<typeof listInvoices>; fmt: MoneyFormat; showProject?: boolean }) {
  if (!rows.length) return <EmptyState title="No invoices yet." description="Invoices raised against milestones will appear here." />;
  return (
    <Table>
      <THead>
        <TH>Invoice</TH>
        {showProject && <TH className="hidden md:table-cell">Project</TH>}
        <TH className="hidden lg:table-cell">Milestone</TH>
        <TH className="text-right">Total</TH>
        <TH className="hidden text-right sm:table-cell">Paid</TH>
        <TH className="text-right">Balance</TH>
        <TH className="hidden sm:table-cell">Due</TH>
        <TH>Status</TH>
      </THead>
      <tbody>
        {rows.map((i) => (
          <TR key={i.id}>
            <TD className="font-mono text-xs font-medium">{i.number}</TD>
            {showProject && <TD className="hidden md:table-cell"><ProjectLink p={i.project} /></TD>}
            <TD className="hidden text-ink-2 lg:table-cell">{i.milestone ?? "—"}</TD>
            <TD className="text-right"><Money value={i.total} fmt={fmt} /></TD>
            <TD className="hidden text-right text-ink-2 sm:table-cell"><Money value={i.paid} fmt={fmt} /></TD>
            <TD className="text-right font-medium"><Money value={i.balance} fmt={fmt} /></TD>
            <TD className="tabular hidden sm:table-cell">{formatDate(i.dueDate)}</TD>
            <TD><StatusBadge defs={INVOICE_STATUS} value={i.status} /></TD>
          </TR>
        ))}
      </tbody>
    </Table>
  );
}

const METHOD: Record<string, string> = { BANK_TRANSFER: "Bank transfer", UPI: "UPI", CARD: "Card", CASH: "Cash", CHEQUE: "Cheque", PAYPAL: "PayPal", STRIPE: "Stripe", OTHER: "Other" };

export function PaymentTable({ rows, fmt, showProject }: { rows: R<typeof listPayments>; fmt: MoneyFormat; showProject?: boolean }) {
  if (!rows.length) return <EmptyState title="No payments recorded." />;
  return (
    <Table>
      <THead>
        <TH>Date</TH>
        <TH>Invoice</TH>
        {showProject && <TH className="hidden md:table-cell">Project</TH>}
        <TH className="hidden sm:table-cell">Method</TH>
        <TH className="hidden lg:table-cell">Transaction</TH>
        <TH className="text-right">Amount</TH>
      </THead>
      <tbody>
        {rows.map((p) => (
          <TR key={p.id}>
            <TD className="tabular">{formatDate(p.paidAt, { year: true })}</TD>
            <TD className="font-mono text-xs">{p.invoice.number}</TD>
            {showProject && <TD className="hidden md:table-cell"><ProjectLink p={p.project} /></TD>}
            <TD className="hidden text-ink-2 sm:table-cell">{METHOD[p.method]}</TD>
            <TD className="hidden font-mono text-xs text-ink-3 lg:table-cell">{p.transactionId ?? "—"}</TD>
            <TD className="text-right font-medium text-ok"><Money value={p.amount} fmt={fmt} /></TD>
          </TR>
        ))}
      </tbody>
    </Table>
  );
}

const CATEGORY: Record<string, string> = { HOSTING: "Hosting", DOMAIN: "Domain", API: "API", SOFTWARE: "Software", FREELANCER: "Freelancer", INFRASTRUCTURE: "Infrastructure", OTHER: "Other" };

export function ExpenseTable({ rows, fmt, showProject }: { rows: R<typeof listExpenses>; fmt: MoneyFormat; showProject?: boolean }) {
  if (!rows.length) return <EmptyState title="No expenses logged." description="Hosting, API, software and freelancer costs reduce project profit." />;
  return (
    <Table>
      <THead>
        <TH>Date</TH>
        <TH>Description</TH>
        <TH className="hidden sm:table-cell">Category</TH>
        {showProject && <TH className="hidden md:table-cell">Project</TH>}
        <TH className="hidden lg:table-cell">Vendor</TH>
        <TH className="text-right">Amount</TH>
      </THead>
      <tbody>
        {rows.map((e) => (
          <TR key={e.id}>
            <TD className="tabular">{formatDate(e.date)}</TD>
            <TD>{e.description}</TD>
            <TD className="hidden sm:table-cell"><Badge tone="neutral">{CATEGORY[e.category]}</Badge></TD>
            {showProject && <TD className="hidden md:table-cell"><ProjectLink p={e.project} /></TD>}
            <TD className="hidden text-ink-2 lg:table-cell">{e.vendor ?? "—"}</TD>
            <TD className="text-right"><Money value={e.amount} fmt={fmt} /></TD>
          </TR>
        ))}
      </tbody>
    </Table>
  );
}

export function ApprovalTable({ rows, today, showProject }: { rows: R<typeof listApprovals>; today: string; showProject?: boolean }) {
  if (!rows.length) return <EmptyState title="No approvals requested." description="Each approval is pinned to the exact document version the client signed off." />;
  return (
    <Table>
      <THead>
        <TH>Approval</TH>
        {showProject && <TH className="hidden md:table-cell">Project</TH>}
        <TH className="hidden lg:table-cell">Version</TH>
        <TH className="hidden sm:table-cell">Requested</TH>
        <TH className="hidden sm:table-cell">Due</TH>
        <TH>Status</TH>
        <TH className="hidden lg:table-cell">Decision</TH>
      </THead>
      <tbody>
        {rows.map((a) => {
          const overdue = a.status === "PENDING" && a.dueDate !== null && a.dueDate < today;
          return (
            <TR key={a.id}>
              <TD>
                <div className="font-medium">{a.title}</div>
                <div className="font-mono text-2xs text-ink-4">{a.key}</div>
              </TD>
              {showProject && <TD className="hidden md:table-cell"><ProjectLink p={a.project} /></TD>}
              <TD className="hidden text-ink-2 lg:table-cell">{a.document ?? a.feature ?? "—"}</TD>
              <TD className="tabular hidden sm:table-cell">{formatDate(toISODate(new Date(a.requestedAt)))}</TD>
              <TD className={`tabular hidden sm:table-cell ${overdue ? "font-medium text-bad" : ""}`}>{formatDate(a.dueDate)}</TD>
              <TD><StatusBadge defs={APPROVAL_STATUS} value={a.status} /></TD>
              <TD className="hidden text-xs text-ink-3 lg:table-cell">{a.decidedBy ? `${a.decidedBy} · ${formatDateTime(a.decidedAt!)}` : "—"}</TD>
            </TR>
          );
        })}
      </tbody>
    </Table>
  );
}

export function ChangeRequestList({ rows, fmt, showProject }: { rows: R<typeof listChangeRequests>; fmt: MoneyFormat; showProject?: boolean }) {
  if (!rows.length) return <EmptyState title="No change requests." description="Scope changes are tracked separately from tasks, with their own hours, cost and client approval." />;
  return (
    <ul className="divide-y divide-line">
      {rows.map((c) => (
        <li key={c.id} className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-ink-3">{c.key}</span>
            <span className="text-[13px] font-medium">{c.title}</span>
            <StatusBadge defs={CHANGE_REQUEST_STATUS} value={c.status} />
            <Badge tone={PRIORITY[c.priority].tone}>{PRIORITY[c.priority].label}</Badge>
            {showProject && <span className="text-xs"><ProjectLink p={c.project} /></span>}
          </div>
          <div className="mt-2 grid gap-3 text-xs sm:grid-cols-4">
            <div><p className="text-ink-4">Original</p><p className="text-ink-2">{c.originalScope ?? "—"}</p></div>
            <div><p className="text-ink-4">Requested</p><p className="text-ink">{c.requestedChange ?? "—"}</p></div>
            <div><p className="text-ink-4">Additional effort</p><p className="tabular text-ink">{c.additionalHours}h</p></div>
            <div><p className="text-ink-4">Additional cost</p><p className="text-ink"><Money value={c.additionalCost} fmt={fmt} /></p></div>
          </div>
          {c.impact && <p className="mt-2 text-xs text-ink-3"><span className="text-ink-4">Impact: </span>{c.impact}</p>}
          <p className="mt-1 text-2xs text-ink-4">Requested by {c.requestedBy ?? "client"} on {formatDate(c.requestDate, { year: true })}{c.taskCount ? ` · ${c.taskCount} task(s) generated` : ""}</p>
        </li>
      ))}
    </ul>
  );
}

const DOC_CATEGORY: Record<string, string> = {
  REQUIREMENTS: "01 Requirements", PROPOSAL: "02 Proposal", SCOPE: "03 Scope", UI_UX: "04 UI/UX", TECHNICAL: "05 Technical", API: "06 API",
  DATABASE: "07 Database", QA: "08 QA", CLIENT_APPROVALS: "09 Client Approvals", INVOICES: "10 Invoices", DEPLOYMENT: "11 Deployment", HANDOVER: "12 Handover",
};

export function DocumentList({ rows, showProject }: { rows: R<typeof listDocuments>; showProject?: boolean }) {
  if (!rows.length) return <EmptyState title="No documents yet." description="Requirements, designs and technical docs are versioned — approved versions are never overwritten." />;
  return (
    <ul className="divide-y divide-line">
      {rows.map((d) => (
        <li key={d.id} className="px-4 py-3">
          <details>
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
              <span className="text-2xs font-medium uppercase tracking-wide text-ink-4">{DOC_CATEGORY[d.category]}</span>
              <span className="text-[13px] font-medium">{d.name}</span>
              {d.currentVersion && <Badge tone="neutral">v{d.currentVersion}</Badge>}
              <StatusBadge defs={DOCUMENT_STATUS} value={d.status} />
              {showProject && <span className="text-xs"><ProjectLink p={d.project} /></span>}
              <span className="ml-auto text-xs text-ink-4">{d.versions.length} version{d.versions.length === 1 ? "" : "s"} · updated {formatDateTime(d.updatedAt)}</span>
            </summary>
            <ol className="mt-2 space-y-1 border-l border-line pl-3">
              {d.versions.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono text-ink-2">v{v.version}</span>
                  <span className="text-ink-3">{v.fileName}</span>
                  <StatusBadge defs={DOCUMENT_STATUS} value={v.status} />
                  <span className="text-ink-4">{v.uploadedBy ?? "—"} · {formatDateTime(v.createdAt)} · {Math.round(v.sizeBytes / 1024)} KB</span>
                </li>
              ))}
            </ol>
          </details>
        </li>
      ))}
    </ul>
  );
}

export function BugTable({ rows, showProject }: { rows: R<typeof listBugs>; showProject?: boolean }) {
  if (!rows.length) return <EmptyState title="No bugs reported." />;
  return (
    <ul className="divide-y divide-line">
      {rows.map((b) => (
        <li key={b.id} className="px-4 py-3">
          <details>
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-ink-3">{b.key}</span>
              <span className="text-[13px] font-medium">{b.title}</span>
              <StatusBadge defs={BUG_SEVERITY} value={b.severity} />
              <StatusBadge defs={BUG_STATUS} value={b.status} />
              {showProject && <span className="text-xs"><ProjectLink p={b.project} /></span>}
              <span className="ml-auto flex items-center gap-3 text-xs text-ink-3">
                {b.task && <Link href={`/tasks/${b.task.id}`} className="font-mono hover:text-accent">{b.task.key}</Link>}
                <AvatarName name={b.assignee?.name} color={b.assignee?.avatarColor} />
              </span>
            </summary>
            <div className="mt-3 grid gap-3 text-xs md:grid-cols-3">
              <div className="rounded-md border border-line bg-subtle p-3">
                <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-ink-3">Reproduction steps</p>
                <p className="whitespace-pre-line text-ink-2">{b.stepsToReproduce ?? "—"}</p>
              </div>
              <div className="rounded-md border border-ok/20 bg-ok-soft p-3">
                <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-ok">Expected</p>
                <p className="text-ink-2">{b.expectedResult ?? "—"}</p>
              </div>
              <div className="rounded-md border border-bad/20 bg-bad-soft p-3">
                <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-bad">Actual</p>
                <p className="text-ink-2">{b.actualResult ?? "—"}</p>
              </div>
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

export function DeploymentTable({ rows, showProject }: { rows: R<typeof listDeployments>; showProject?: boolean }) {
  if (!rows.length) return <EmptyState title="No deployments yet." />;
  return (
    <Table>
      <THead>
        <TH>Version</TH>
        {showProject && <TH className="hidden md:table-cell">Project</TH>}
        <TH>Environment</TH>
        <TH className="hidden sm:table-cell">Date</TH>
        <TH className="hidden lg:table-cell">Commit</TH>
        <TH className="hidden lg:table-cell">Release notes</TH>
        <TH>Status</TH>
      </THead>
      <tbody>
        {rows.map((d) => (
          <TR key={d.id}>
            <TD className="font-mono text-xs font-medium">{d.version}</TD>
            {showProject && <TD className="hidden md:table-cell"><ProjectLink p={d.project} /></TD>}
            <TD><Badge tone={d.environment === "PRODUCTION" ? "violet" : "neutral"}>{d.environment === "PRODUCTION" ? "Production" : d.environment === "STAGING" ? "Staging" : "Development"}</Badge></TD>
            <TD className="tabular hidden text-ink-2 sm:table-cell">{formatDateTime(d.date)}</TD>
            <TD className="hidden font-mono text-xs text-ink-3 lg:table-cell">{d.commitSha ?? "—"}</TD>
            <TD className="hidden max-w-72 truncate text-ink-2 lg:table-cell">{d.releaseNotes ?? "—"}</TD>
            <TD><StatusBadge defs={DEPLOYMENT_STATUS} value={d.status} /></TD>
          </TR>
        ))}
      </tbody>
    </Table>
  );
}
