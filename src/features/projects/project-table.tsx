import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { ProgressCell } from "@/components/ui/progress";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import type { MoneyFormat } from "@/lib/format";
import { PROJECT_STATUS } from "@/lib/status";
import type { ProjectSummary } from "@/server/services/metrics";
import { DeadlineCell, HealthCell, PaymentCell } from "./project-cells";

export const PROJECT_COLUMNS = [
  { key: "client", label: "Client" },
  { key: "status", label: "Status" },
  { key: "phase", label: "Current phase" },
  { key: "progress", label: "Progress" },
  { key: "deadline", label: "Deadline" },
  { key: "payment", label: "Payment" },
  { key: "health", label: "Health" },
];

export function ProjectTable({
  projects,
  today,
  fmt,
  id,
  showStatus = false,
  compact = false,
  header,
}: {
  /** Fold the client column into the project cell (dense dashboard layout). */
  compact?: boolean;
  projects: ProjectSummary[];
  today: string;
  fmt: MoneyFormat;
  id?: string;
  showStatus?: boolean;
  header?: React.ReactNode;
}) {
  const showPayment = projects.some((p) => p.financials !== null);
  return (
    <Table id={id}>
      {header ?? (
        <THead>
          <TH>Project</TH>
          {!compact && <TH data-col="client" className="hidden md:table-cell">Client</TH>}
          {showStatus && <TH data-col="status" className="hidden lg:table-cell">Status</TH>}
          <TH data-col="phase" className="hidden lg:table-cell">Current phase</TH>
          <TH data-col="progress">Progress</TH>
          <TH data-col="deadline" className="hidden sm:table-cell">Deadline</TH>
          {showPayment && <TH data-col="payment" className="hidden md:table-cell">Payment</TH>}
          <TH data-col="health">Health</TH>
          <TH className="w-8"><span className="sr-only">Open</span></TH>
        </THead>
      )}
      <tbody>
        {projects.map((p) => (
          <TR key={p.id} className="group">
            <TD className="max-w-64">
              <Link href={`/projects/${p.id}`} className="block truncate font-medium text-ink hover:text-accent">
                {p.name}
              </Link>
              <div className={compact ? "truncate text-2xs text-ink-3" : "truncate text-2xs text-ink-4 md:hidden"}>{p.client.name}</div>
              {!compact && <div className="hidden font-mono text-2xs text-ink-4 md:block">{p.code}</div>}
            </TD>
            {!compact && (
              <TD data-col="client" className="hidden max-w-44 truncate text-ink-2 md:table-cell">
                <Link href={`/clients/${p.client.id}`} className="hover:text-accent">{p.client.name}</Link>
              </TD>
            )}
            {showStatus && (
              <TD data-col="status" className="hidden lg:table-cell">
                <StatusBadge defs={PROJECT_STATUS} value={p.status} />
              </TD>
            )}
            <TD data-col="phase" className="hidden max-w-40 truncate text-ink-2 lg:table-cell">
              {p.currentPhase?.name ?? <span className="text-ink-4">{p.phases.length ? "All phases done" : "No phases"}</span>}
            </TD>
            <TD data-col="progress">
              <ProgressCell value={p.progress} />
            </TD>
            <TD data-col="deadline" className="hidden sm:table-cell">
              <DeadlineCell due={p.dueDate} today={today} done={p.status === "COMPLETED" || p.status === "MAINTENANCE"} />
            </TD>
            {showPayment && (
              <TD data-col="payment" className="hidden md:table-cell">
                <PaymentCell p={p} fmt={fmt} />
              </TD>
            )}
            <TD data-col="health">
              <HealthCell p={p} />
            </TD>
            <TD className="text-right">
              <Link href={`/projects/${p.id}`} className="inline-flex rounded p-1 text-ink-4 hover:bg-black/5 hover:text-ink" aria-label={`Open ${p.name}`}>
                <ChevronRight className="size-4" />
              </Link>
            </TD>
          </TR>
        ))}
      </tbody>
    </Table>
  );
}
