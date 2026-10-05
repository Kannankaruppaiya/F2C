import type { Metadata } from "next";
import Link from "@/components/ui/link";
import { ChevronRight, Download, Eye, FileText } from "lucide-react";
import { pageContext, load } from "@/server/page-context";
import { getDocument } from "@/server/services/documents";
import { listActivity } from "@/server/services/activity";
import { maxUploadBytes } from "@/server/storage/config";
import { DefinitionList, Panel } from "@/components/ui/panel";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { ActivityFeed } from "@/features/activity/activity-feed";
import { UploadDialog } from "@/features/documents/upload-dialog";
import { ArchiveButton, RequestApprovalButton, ShareVersionButton } from "@/features/documents/document-actions";
import { downloadHref, formatBytes } from "@/features/documents/document-table";
import { formatDate, formatDateTime } from "@/lib/format";
import { APPROVAL_STATUS, DOCUMENT_CATEGORY, DOCUMENT_STATUS } from "@/lib/status";
import { todayISO } from "@/lib/dates";
import { cn } from "@/lib/cn";

export async function generateMetadata({ params }: { params: Promise<{ documentId: string }> }): Promise<Metadata> {
  const ctx = await pageContext();
  const d = await getDocument(ctx, (await params).documentId).catch(() => null);
  return { title: d?.name ?? "Document" };
}

export default async function DocumentDetailPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const ctx = await pageContext();
  const doc = await load(() => getDocument(ctx, documentId));
  const activity = await listActivity(ctx, { documentId: doc.id, limit: 50 });
  const current = doc.versions.find((v) => v.id === doc.currentVersionId) ?? null;
  const isClient = ctx.role === "CLIENT";
  const maxMb = Math.round(maxUploadBytes() / 1024 / 1024);
  const pendingForMe = doc.approvals.find((a) => a.status === "PENDING");

  return (
    <>
      <nav className="mb-2 flex flex-wrap items-center gap-1 text-xs text-ink-3" aria-label="Breadcrumb">
        <Link href="/documents" className="hover:text-ink">Documents</Link>
        <ChevronRight className="size-3" />
        {doc.project ? (
          <Link href={`/projects/${doc.project.id}/documents`} className="hover:text-ink">{doc.project.name}</Link>
        ) : (
          <span>{doc.client?.name} · client-level</span>
        )}
      </nav>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{doc.name}</h1>
            {current && <Badge tone="neutral">v{current.number}</Badge>}
            <StatusBadge defs={DOCUMENT_STATUS} value={doc.status} />
          </div>
          <p className="mt-1 text-xs text-ink-3">
            {DOCUMENT_CATEGORY[doc.category]}
            {doc.phase && ` · ${doc.phase.name}`}
            {doc.feature && ` · ${doc.feature.name}`}
            {` · ${doc.versions.length} version${doc.versions.length === 1 ? "" : "s"}${isClient ? " shared with you" : ""}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {current && (
            <a href={downloadHref(doc.id, current.id)} className={buttonClass("secondary")}>
              <Download className="size-3.5" /> Download v{current.number}
            </a>
          )}
          {doc.permissions.upload && current && (
            <UploadDialog variant="secondary" mode={{ kind: "version", documentId: doc.id, documentName: doc.name, nextVersion: Math.max(...doc.versions.map((v) => v.number)) + 1, canShare: doc.permissions.manage, shared: current.shared }} maxMb={maxMb} />
          )}
          {doc.permissions.requestApproval && doc.project && current && <RequestApprovalButton documentId={doc.id} projectId={doc.project.id} label={`${doc.name} v${current.number}`} today={todayISO(ctx.timezone)} />}
          {(doc.permissions.archive || doc.permissions.restore) && <ArchiveButton documentId={doc.id} name={doc.name} archived={doc.status === "ARCHIVED"} />}
        </div>
      </div>

      {isClient && pendingForMe && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-warn/30 bg-warn-soft px-4 py-2.5 text-[13px]">
          <span><strong>Approval requested for {pendingForMe.title}.</strong> Review the document, then approve, reject or request changes.</span>
          <Link href={`/approvals/${pendingForMe.id}`} className={buttonClass("primary", "sm")}>Review approval</Link>
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <Panel title="Current version">
            {current ? (
              <div className="flex flex-wrap items-center gap-4 px-4 py-3">
                <FileText className="size-8 shrink-0 text-ink-4" strokeWidth={1.5} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{current.filename}</p>
                  <p className="text-xs text-ink-3">
                    v{current.number} · {formatBytes(current.size)} · uploaded by {current.uploadedBy ?? "—"} on {formatDateTime(current.uploadedAt)}
                  </p>
                  {current.changeSummary && <p className="mt-1 text-xs text-ink-2">“{current.changeSummary}”</p>}
                </div>
                <div className="flex gap-2">
                  {current.previewable && (
                    <a href={downloadHref(doc.id, current.id, true)} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "sm")}>
                      <Eye className="size-3.5" /> View
                    </a>
                  )}
                  <a href={downloadHref(doc.id, current.id)} className={buttonClass("secondary", "sm")}>
                    <Download className="size-3.5" /> Download
                  </a>
                </div>
              </div>
            ) : (
              <EmptyState title="No version available." />
            )}
          </Panel>

          <Panel title="Version history" description="Versions are immutable. A revision is always a new version.">
            <Table>
              <THead>
                <TH>Version</TH>
                <TH className="hidden md:table-cell">Change summary</TH>
                <TH className="hidden sm:table-cell">Uploaded</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </THead>
              <tbody>
                {doc.versions.map((v) => (
                  <TR key={v.id} className={cn(v.id === doc.currentVersionId && "bg-accent-soft/30")}>
                    <TD>
                      <span className="font-medium">v{v.number}</span>
                      {v.id === doc.currentVersionId && <span className="ml-1.5 text-2xs text-accent">current</span>}
                      <div className="max-w-56 truncate text-2xs text-ink-4">{v.filename} · {formatBytes(v.size)}</div>
                    </TD>
                    <TD className="hidden max-w-72 text-ink-2 md:table-cell">{v.changeSummary ?? <span className="text-ink-4">—</span>}</TD>
                    <TD className="hidden text-xs sm:table-cell">
                      {v.uploadedBy ?? "—"}
                      <div className="text-ink-4">{formatDateTime(v.uploadedAt)}</div>
                    </TD>
                    <TD>
                      <div className="flex flex-wrap items-center gap-1">
                        <StatusBadge defs={DOCUMENT_STATUS} value={v.status} />
                        {!isClient && (v.shared ? <Badge tone="violet">Shared</Badge> : <Badge tone="muted">Internal</Badge>)}
                      </div>
                    </TD>
                    <TD className="text-right whitespace-nowrap">
                      {!isClient && doc.permissions.manage && !v.shared && doc.status !== "ARCHIVED" && <ShareVersionButton documentId={doc.id} versionId={v.id} label={`${doc.name} v${v.number}`} />}
                      <a href={downloadHref(doc.id, v.id)} className="inline-flex rounded p-1.5 text-ink-3 hover:bg-black/5 hover:text-ink" aria-label={`Download v${v.number}`} title="Download">
                        <Download className="size-3.5" />
                      </a>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Panel>

          <Panel title="Approvals" description="Each approval is tied to the exact version it was requested for.">
            {doc.approvals.length === 0 ? (
              <EmptyState title="No approvals requested for this document." className="py-8" />
            ) : (
              <ul className="divide-y divide-line">
                {doc.approvals.map((a) => (
                  <li key={a.id}>
                    <Link href={`/approvals/${a.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px] hover:bg-subtle">
                      <span className="font-mono text-2xs text-ink-4">{a.key}</span>
                      <span className="font-medium">Approval requested for {a.title}</span>
                      <StatusBadge defs={APPROVAL_STATUS} value={a.status} />
                      <span className="ml-auto text-xs text-ink-3">
                        {a.approver ? `to ${a.approver}` : ""} · {formatDate(a.requestedAt.slice(0, 10))}
                        {a.respondedAt && ` · answered ${formatDate(a.respondedAt.slice(0, 10))}`}
                      </span>
                      {a.comments && <span className="w-full text-xs text-ink-3">“{a.comments}”</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Overview" bodyClassName="p-4">
            <DefinitionList
              single
              items={[
                { label: "Category", value: DOCUMENT_CATEGORY[doc.category] },
                { label: doc.project ? "Project" : "Client", value: doc.project ? <Link className="hover:text-accent" href={`/projects/${doc.project.id}`}>{doc.project.name}</Link> : doc.client?.name },
                ...(doc.phase ? [{ label: "Phase", value: doc.phase.name }] : []),
                ...(doc.feature ? [{ label: "Feature", value: doc.feature.name }] : []),
                ...(doc.changeRequest ? [{ label: "Change request", value: <Link className="hover:text-accent" href={`/change-requests/${doc.changeRequest.id}`}>CR-{String(doc.changeRequest.number).padStart(3, "0")} {doc.changeRequest.title}</Link> }] : []),
                { label: "Created", value: `${formatDateTime(doc.createdAt)}${doc.createdBy ? ` by ${doc.createdBy}` : ""}` },
                ...(doc.description ? [{ label: "Description", value: <span className="whitespace-pre-line">{doc.description}</span> }] : []),
              ]}
            />
          </Panel>
          <Panel title="Activity">
            <ActivityFeed items={activity} showProject={false} empty="No activity yet." />
          </Panel>
        </div>
      </div>
    </>
  );
}
