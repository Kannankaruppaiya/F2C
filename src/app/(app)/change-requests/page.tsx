import type { Metadata } from "next";
import { pageContext, load, moneyFmt } from "@/server/page-context";
import { listChangeRequests } from "@/server/services/records";
import { PageHeader, Panel } from "@/components/ui/panel";
import { ChangeRequestList } from "@/features/records/tables";
import { ReadOnlyNote } from "@/features/records/read-only-note";

export const metadata: Metadata = { title: "Change Requests" };

export default async function Page() {
  const ctx = await pageContext();
  const rows = await load(() => listChangeRequests(ctx));
  return (
    <>
      <PageHeader title="Change Requests" description="Scope changes with effort, cost and client decision." actions={<ReadOnlyNote module="CR workflow" phase="Phase 3" />} />
      <Panel>
        <ChangeRequestList rows={rows} showProject fmt={moneyFmt(ctx)} />
      </Panel>
    </>
  );
}
