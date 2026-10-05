import type { Metadata } from "next";
import { pageContext, load, moneyFmt } from "@/server/page-context";
import { listPayments } from "@/server/services/records";
import { PageHeader, Panel } from "@/components/ui/panel";
import { PaymentTable } from "@/features/records/tables";
import { ReadOnlyNote } from "@/features/records/read-only-note";

export const metadata: Metadata = { title: "Payments" };

export default async function Page() {
  const ctx = await pageContext();
  const rows = await load(() => listPayments(ctx));
  return (
    <>
      <PageHeader title="Payments" description="Payments received, always linked to an invoice." actions={<ReadOnlyNote module="Payment recording" phase="Phase 4" />} />
      <Panel>
        <PaymentTable rows={rows} showProject fmt={moneyFmt(ctx)} />
      </Panel>
    </>
  );
}
