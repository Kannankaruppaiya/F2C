import Link from "@/components/ui/link";
import { ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { Money } from "@/components/ui/money";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatHours, type MoneyFormat } from "@/lib/format";
import { CHANGE_REQUEST_STATUS } from "@/lib/status";
import type { ChangeRequestRow } from "@/server/services/change-requests";

export function ChangeRequestTable({ rows, fmt, showProject = true }: { rows: ChangeRequestRow[]; fmt: MoneyFormat; showProject?: boolean }) {
  return (
    <Table>
      <THead>
        <TH>CR</TH>
        <TH>Title</TH>
        {showProject && <TH className="hidden md:table-cell">Project</TH>}
        <TH className="hidden xl:table-cell">Impact</TH>
        <TH className="hidden text-right sm:table-cell">Hours</TH>
        <TH className="hidden text-right sm:table-cell">Additional cost</TH>
        <TH>Status</TH>
        <TH className="hidden lg:table-cell">Requested</TH>
        <TH className="w-8"><span className="sr-only">Actions</span></TH>
      </THead>
      <tbody>
        {rows.map((c) => (
          <TR key={c.id}>
            <TD className="font-mono text-xs whitespace-nowrap">{c.key}</TD>
            <TD className="max-w-72">
              <Link href={`/change-requests/${c.id}`} className="block truncate font-medium hover:text-accent">{c.title}</Link>
              {c.requestedChange && <div className="truncate text-2xs text-ink-4">{c.originalScope ? `${c.originalScope} → ` : ""}{c.requestedChange}</div>}
            </TD>
            {showProject && <TD className="hidden md:table-cell"><Link href={`/projects/${c.project.id}`} className="text-ink-2 hover:text-accent">{c.project.name}</Link></TD>}
            <TD className="hidden max-w-56 truncate text-xs text-ink-3 xl:table-cell" title={c.impact ?? undefined}>{c.impact ?? "—"}</TD>
            <TD className="tabular hidden text-right sm:table-cell">{c.estimatedHours ? formatHours(c.estimatedHours) : "—"}</TD>
            <TD className="hidden text-right sm:table-cell">{c.additionalCost ? <Money value={c.additionalCost} fmt={fmt} /> : "—"}</TD>
            <TD><StatusBadge defs={CHANGE_REQUEST_STATUS} value={c.status} /></TD>
            <TD className="hidden text-xs lg:table-cell">
              {formatDate(c.requestDate)}
              <div className="text-ink-4">{c.requestedBy ?? "—"}{c.requestedByClient ? " (client)" : ""}</div>
            </TD>
            <TD className="text-right">
              <Link href={`/change-requests/${c.id}`} className="inline-flex rounded p-1 text-ink-4 hover:bg-black/5 hover:text-ink" aria-label={`Open ${c.key}`}><ChevronRight className="size-4" /></Link>
            </TD>
          </TR>
        ))}
      </tbody>
    </Table>
  );
}
