import type { Metadata } from "next";
import { pageContext, load, moneyFmt } from "@/server/page-context";
import { listExpenses } from "@/server/services/records";
import { PageHeader, Panel } from "@/components/ui/panel";
import { ExpenseTable } from "@/features/records/tables";
import { ReadOnlyNote } from "@/features/records/read-only-note";

export const metadata: Metadata = { title: "Expenses" };

export default async function Page() {
  const ctx = await pageContext();
  const rows = await load(() => listExpenses(ctx));
  return (
    <>
      <PageHeader title="Expenses" description="Project costs that reduce profit." actions={<ReadOnlyNote module="Expense logging" phase="Phase 4" />} />
      <Panel>
        <ExpenseTable rows={rows} showProject fmt={moneyFmt(ctx)} />
      </Panel>
    </>
  );
}
