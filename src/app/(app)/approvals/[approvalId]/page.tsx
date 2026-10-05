import type { Metadata } from "next";
import Link from "@/components/ui/link";
import { AlertTriangle, ChevronRight, Download, Eye, FileText } from "lucide-react";
import { pageContext, load } from "@/server/page-context";
import { getApproval } from "@/server/services/approvals";
import { listActivity } from "@/server/services/activity";
import { DefinitionList, Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { ActivityFeed } from "@/features/activity/activity-feed";
import { CancelApprovalButton, DecisionPanel } from "@/features/approvals/decision-panel";
import { downloadHref } from "@/features/documents/document-table";
import { formatDate, formatDateTime } from "@/lib/format";
import { APPROVAL_STATUS } from "@/lib/status";
import { todayISO } from "@/lib/dates";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Approval" };

const RESULT_TONE = { APPROVED: "border-ok/30 bg-ok-soft", REJECTED: "border-bad/30 bg-bad-soft", CHANGES_REQUESTED: "border-violet/30 bg-violet-soft", CANCELLED: "border-line bg-subtle" } as const;

export default async function ApprovalDetailPage({ params }: { params: Promise<{ approvalId: string }> }) {
  const { approvalId } = await params;
  const ctx = await pageContext();
  const a = await load(() => getApproval(ctx, approvalId));
  const activity = (await listActivity(ctx, { documentId: a.document.id, limit: 50 })).filter((x) => x.entityId === a.id);
  const overdue = a.status === "PENDING" && !!a.dueDate && a.dueDate < todayISO(ctx.timezone);

  return (
    <>
      <nav className="mb-2 flex flex-wrap items-center gap-1 text-xs text-ink-3" aria-label="Breadcrumb">
        <Link href="/approvals" className="hover:text-ink">Approvals</Link>
        <ChevronRight className="size-3" />
        <Link href={`/projects/${a.project.id}`} className="hover:text-ink">{a.project.name}</Link>
      </nav>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-xs text-ink-4">{a.key}</p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight">Approval requested for {a.title}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-3">
            <StatusBadge defs={APPROVAL_STATUS} value={a.status} />
            <span>Requested by {a.requestedBy ?? "—"} on {formatDate(a.requestedAt.slice(0, 10), { year: true })}</span>
            {a.approver && <span>· Assigned to {a.approver.name}</span>}
            {a.dueDate && <span className={cn(overdue && "font-medium text-bad")}>· Due {formatDate(a.dueDate, { year: true })}{overdue ? " (overdue)" : ""}</span>}
          </div>
        </div>
        {a.canCancel && <CancelApprovalButton approvalId={a.id} title={a.title} />}
      </div>

      {a.superseded && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-warn/30 bg-warn-soft px-4 py-2.5 text-[13px] text-ink-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
          <span>
            A newer version of {a.document.name} has been uploaded since this request. This approval still applies only to <strong>v{a.version.number}</strong>.
          </span>
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <Panel title={`Version under review: ${a.title}`}>
            <div className="flex flex-wrap items-center gap-4 px-4 py-3">
              <FileText className="size-8 shrink-0 text-ink-4" strokeWidth={1.5} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{a.version.filename}</p>
                {a.version.changeSummary && <p className="text-xs text-ink-3">“{a.version.changeSummary}”</p>}
              </div>
              <div className="flex gap-2">
                <a href={downloadHref(a.document.id, a.version.id, true)} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "sm")}><Eye className="size-3.5" /> View</a>
                <a href={downloadHref(a.document.id, a.version.id)} className={buttonClass("secondary", "sm")}><Download className="size-3.5" /> Download</a>
              </div>
            </div>
            {a.requestMessage && (
              <div className="border-t border-line px-4 py-3 text-[13px] text-ink-2">
                <p className="mb-0.5 text-2xs font-medium uppercase tracking-wide text-ink-4">Message from {a.requestedBy ?? "the team"}</p>
                <p className="whitespace-pre-line">{a.requestMessage}</p>
              </div>
            )}
          </Panel>

          {a.status === "PENDING" ? (
            a.canDecide ? (
              <Panel title="Your decision" description="Review the version above, then respond. Decisions are final for this version." bodyClassName="p-4">
                <DecisionPanel approvalId={a.id} title={a.title} />
              </Panel>
            ) : (
              <Panel bodyClassName="px-4 py-3 text-[13px] text-ink-3">
                Waiting for {a.approver?.name ?? "the client"} to respond{a.viewedAt ? ` · opened ${formatDateTime(a.viewedAt)}` : " · not opened yet"}.
              </Panel>
            )
          ) : (
            <div className={cn("rounded-lg border px-4 py-3 text-[13px]", RESULT_TONE[a.status as keyof typeof RESULT_TONE])}>
              <p className="font-semibold">
                {a.status === "APPROVED" && `Approved by ${a.respondedBy ?? "client"}`}
                {a.status === "REJECTED" && `Rejected by ${a.respondedBy ?? "client"}`}
                {a.status === "CHANGES_REQUESTED" && `Changes requested by ${a.respondedBy ?? "client"}`}
                {a.status === "CANCELLED" && `Cancelled by ${a.respondedBy ?? "the team"}`}
                {a.respondedAt && <span className="font-normal text-ink-3"> · {formatDateTime(a.respondedAt)}</span>}
              </p>
              {a.comments && <p className="mt-1 whitespace-pre-line text-ink-2">“{a.comments}”</p>}
              {a.status === "CHANGES_REQUESTED" && ctx.role !== "CLIENT" && (
                <p className="mt-2 text-xs text-ink-3">No new version is created automatically. Upload v{a.version.number + 1} from the <Link href={`/documents/${a.document.id}`} className="text-accent hover:underline">document page</Link> when it is ready, then request approval again.</p>
              )}
            </div>
          )}
        </div>
        <div className="space-y-5">
          <Panel title="Details" bodyClassName="p-4">
            <DefinitionList
              single
              items={[
                { label: "Document", value: <Link className="hover:text-accent" href={`/documents/${a.document.id}`}>{a.document.name}</Link> },
                { label: "Version", value: `v${a.version.number}` },
                { label: "Project", value: a.project.name },
                { label: "Client", value: a.client.name },
                { label: "Opened by approver", value: a.viewedAt ? formatDateTime(a.viewedAt) : "Not yet" },
              ]}
            />
          </Panel>
          <Panel title="Audit trail">
            <ActivityFeed items={activity} showProject={false} empty="No events yet." />
          </Panel>
        </div>
      </div>
    </>
  );
}
