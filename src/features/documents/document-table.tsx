import Link from "@/components/ui/link";
import { Download, Eye } from "lucide-react";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { DOCUMENT_CATEGORY, DOCUMENT_STATUS } from "@/lib/status";
import type { DocumentRow } from "@/server/services/documents";

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function downloadHref(documentId: string, versionId: string, inline = false) {
  return `/api/v1/documents/${documentId}/versions/${versionId}/download${inline ? "?inline=1" : ""}`;
}

export function DocumentTable({ rows, showProject = true, empty }: { rows: DocumentRow[]; showProject?: boolean; empty?: React.ReactNode }) {
  if (rows.length === 0) return <>{empty ?? <EmptyState title="No project documents yet." />}</>;
  return (
    <Table>
      <THead>
        <TH>Name</TH>
        <TH className="hidden md:table-cell">Category</TH>
        <TH>Version</TH>
        <TH>Status</TH>
        <TH className="hidden lg:table-cell">Updated</TH>
        <TH className="hidden xl:table-cell">Owner</TH>
        <TH className="text-right">Actions</TH>
      </THead>
      <tbody>
        {rows.map((d) => (
          <TR key={d.id}>
            <TD className="max-w-80">
              <Link href={`/documents/${d.id}`} className="block truncate font-medium hover:text-accent">{d.name}</Link>
              <div className="truncate text-2xs text-ink-4">
                {showProject && (d.project?.name ?? (d.client ? `${d.client.name} · client-level` : ""))}
                {showProject && d.phase ? " · " : ""}
                {d.phase?.name}
                {d.pendingApprovals > 0 && <span className="text-warn"> · approval pending</span>}
              </div>
            </TD>
            <TD className="hidden text-ink-2 md:table-cell">{DOCUMENT_CATEGORY[d.category]}</TD>
            <TD>
              {d.currentVersion ? (
                <span className="inline-flex items-center gap-1.5">
                  <Badge tone="neutral">v{d.currentVersion.number}</Badge>
                  {d.versionCount > 1 && <span className="text-2xs text-ink-4">{d.versionCount} versions</span>}
                </span>
              ) : (
                "—"
              )}
            </TD>
            <TD><StatusBadge defs={DOCUMENT_STATUS} value={d.status} /></TD>
            <TD className="hidden text-xs text-ink-3 lg:table-cell">{formatDateTime(d.updatedAt)}</TD>
            <TD className="hidden text-ink-2 xl:table-cell">{d.owner ?? "—"}</TD>
            <TD className="text-right whitespace-nowrap">
              <Link href={`/documents/${d.id}`} className="inline-flex rounded p-1.5 text-ink-3 hover:bg-black/5 hover:text-ink" aria-label={`View ${d.name}`} title="View">
                <Eye className="size-3.5" />
              </Link>
              {d.currentVersion && (
                <a href={downloadHref(d.id, d.currentVersion.id)} className="inline-flex rounded p-1.5 text-ink-3 hover:bg-black/5 hover:text-ink" aria-label={`Download ${d.name} v${d.currentVersion.number}`} title={`Download v${d.currentVersion.number} (${formatBytes(d.currentVersion.size)})`}>
                  <Download className="size-3.5" />
                </a>
              )}
            </TD>
          </TR>
        ))}
      </tbody>
    </Table>
  );
}
