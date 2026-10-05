import type { Metadata } from "next";
import { pageContext, load, moneyFmt } from "@/server/page-context";
import { listInvoices } from "@/server/services/records";
import { PageHeader, Panel } from "@/components/ui/panel";
import { InvoiceTable } from "@/features/records/tables";
import { ReadOnlyNote } from "@/features/records/read-only-note";

export const metadata: Metadata = { title: "Invoices" };

export default async function Page() {
  const ctx = await pageContext();
  const rows = await load(() => listInvoices(ctx));
  return (
    <>
      <PageHeader title="Invoices" description="Every invoice with live balance and overdue status." actions={<ReadOnlyNote module="Invoicing" phase="Phase 4" />} />
      <Panel>
        <InvoiceTable rows={rows} showProject fmt={moneyFmt(ctx)} />
      </Panel>
    </>
  );
}
