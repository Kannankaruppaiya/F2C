import { pageContext, load, moneyFmt } from "@/server/page-context";
import { getProject } from "@/server/services/projects";
import { listInvoices, listMilestones, listPayments } from "@/server/services/records";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { InvoiceTable, PaymentTable } from "@/features/records/tables";
import { ReadOnlyNote } from "@/features/records/read-only-note";
import { formatDate } from "@/lib/format";

const MS = { PENDING: { label: "Pending", tone: "amber" }, INVOICED: { label: "Invoiced", tone: "blue" }, PAID: { label: "Paid", tone: "green" } } as const;

export default async function ProjectPaymentsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ctx = await pageContext();
  const [{ project }, milestones, invoices, payments] = await load(() => Promise.all([getProject(ctx, projectId), listMilestones(ctx, projectId), listInvoices(ctx, { projectId }), listPayments(ctx, { projectId })]));
  const fmt = moneyFmt(ctx);
  return (
    <div className="space-y-5">
      <Panel title="Payment milestones" description={project.paymentTerms ?? undefined} actions={<ReadOnlyNote module="Invoicing & payments" phase="Phase 4" />}>
        {milestones.length === 0 ? (
          <EmptyState title="No milestones defined." />
        ) : (
          <ol className="divide-y divide-line">
            {milestones.map((m, i) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px]">
                <span className="tabular text-xs text-ink-4">{i + 1}</span>
                <span className="min-w-0 flex-1 font-medium">{m.name}{m.phase && <span className="ml-1 text-xs font-normal text-ink-4">· {m.phase}</span>}</span>
                <span className="text-xs text-ink-3">{m.invoices.join(", ")}</span>
                <span className="tabular text-xs text-ink-3">{formatDate(m.dueDate)}</span>
                <Money value={m.amount} fmt={fmt} />
                <StatusBadge defs={MS} value={m.status} />
              </li>
            ))}
          </ol>
        )}
      </Panel>
      <Panel title="Invoices"><InvoiceTable rows={invoices} fmt={fmt} /></Panel>
      <Panel title="Payments received"><PaymentTable rows={payments} fmt={fmt} /></Panel>
    </div>
  );
}
