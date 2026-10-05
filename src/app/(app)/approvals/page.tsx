import type { Metadata } from "next";
import { pageContext, load } from "@/server/page-context";
import { listApprovals } from "@/server/services/records";
import { PageHeader, Panel } from "@/components/ui/panel";
import { ApprovalTable } from "@/features/records/tables";
import { ReadOnlyNote } from "@/features/records/read-only-note";
import { todayISO } from "@/lib/dates";

export const metadata: Metadata = { title: "Approvals" };

export default async function Page() {
  const ctx = await pageContext();
  const rows = await load(() => listApprovals(ctx));
  return (
    <>
      <PageHeader title="Approvals" description="What clients still need to sign off, pinned to exact versions." actions={<ReadOnlyNote module="Approval requests" phase="Phase 3" />} />
      <Panel>
        <ApprovalTable rows={rows} showProject today={todayISO(ctx.timezone)} />
      </Panel>
    </>
  );
}
