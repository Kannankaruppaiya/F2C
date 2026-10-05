import { pageContext, load, moneyFmt } from "@/server/page-context";
import { listExpenses } from "@/server/services/records";
import { Panel } from "@/components/ui/panel";
import { Money } from "@/components/ui/money";
import { ExpenseTable } from "@/features/records/tables";
import { ReadOnlyNote } from "@/features/records/read-only-note";

export default async function ProjectExpensesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ctx = await pageContext();
  const rows = await load(() => listExpenses(ctx, { projectId }));
  const fmt = moneyFmt(ctx);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return <Panel title="Expenses" description={<>Total <Money value={total} fmt={fmt} /></>} actions={<ReadOnlyNote module="Expense logging" phase="Phase 4" />}><ExpenseTable rows={rows} fmt={fmt} /></Panel>;
}
