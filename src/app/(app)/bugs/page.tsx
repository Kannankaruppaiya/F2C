import type { Metadata } from "next";
import { pageContext, load } from "@/server/page-context";
import { listBugs } from "@/server/services/records";
import { PageHeader, Panel } from "@/components/ui/panel";
import { BugTable } from "@/features/records/tables";
import { ReadOnlyNote } from "@/features/records/read-only-note";

export const metadata: Metadata = { title: "Bugs" };

export default async function Page() {
  const ctx = await pageContext();
  const rows = await load(() => listBugs(ctx));
  return (
    <>
      <PageHeader title="Bugs" description="Defects across all projects, by status and severity." actions={<ReadOnlyNote module="Bug tracking" phase="Phase 2" />} />
      <Panel>
        <BugTable rows={rows} showProject />
      </Panel>
    </>
  );
}
