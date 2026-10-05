import Link from "@/components/ui/link";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { APPROVAL_STATUS } from "@/lib/status";
import type { ApprovalRow } from "@/server/services/approvals";
import { cn } from "@/lib/cn";

export function ApprovalTable({ rows, today, showProject = true }: { rows: ApprovalRow[]; today: string; showProject?: boolean }) {
  return (
    <Table>
      <THead>
        <TH>Document</TH>
        <TH>Version</TH>
        {showProject && <TH className="hidden md:table-cell">Project</TH>}
        <TH className="hidden lg:table-cell">Requested by</TH>
        <TH className="hidden lg:table-cell">Requested to</TH>
        <TH className="hidden sm:table-cell">Requested</TH>
        <TH className="hidden sm:table-cell">Due</TH>
        <TH>Status</TH>
      </THead>
      <tbody>
        {rows.map((a) => {
          const overdue = a.status === "PENDING" && !!a.dueDate && a.dueDate < today;
          return (
            <TR key={a.id}>
              <TD className="max-w-72">
                <Link href={`/approvals/${a.id}`} className="block truncate font-medium hover:text-accent">{a.document.name}</Link>
                <div className="font-mono text-2xs text-ink-4">{a.key}{a.canDecide && <span className="ml-1 font-sans font-medium text-warn">· awaiting you</span>}</div>
              </TD>
              <TD>
                <Badge tone="neutral">v{a.version.number}</Badge>
                {a.superseded && <span className="ml-1 text-2xs text-ink-4" title="A newer version has been uploaded since">superseded</span>}
              </TD>
              {showProject && <TD className="hidden md:table-cell"><Link href={`/projects/${a.project.id}`} className="text-ink-2 hover:text-accent">{a.project.name}</Link></TD>}
              <TD className="hidden text-ink-2 lg:table-cell">{a.requestedBy ?? "—"}</TD>
              <TD className="hidden text-ink-2 lg:table-cell">{a.approver?.name ?? "—"}</TD>
              <TD className="tabular hidden text-xs sm:table-cell">{formatDate(a.requestedAt.slice(0, 10))}</TD>
              <TD className={cn("tabular hidden text-xs sm:table-cell", overdue && "font-medium text-bad")}>{formatDate(a.dueDate)}</TD>
              <TD><StatusBadge defs={APPROVAL_STATUS} value={a.status} /></TD>
            </TR>
          );
        })}
      </tbody>
    </Table>
  );
}
