import type { Metadata } from "next";
import { pageContext, load } from "@/server/page-context";
import { listDocuments } from "@/server/services/records";
import { PageHeader, Panel } from "@/components/ui/panel";
import { DocumentList } from "@/features/records/tables";
import { ReadOnlyNote } from "@/features/records/read-only-note";

export const metadata: Metadata = { title: "Documents" };

export default async function Page() {
  const ctx = await pageContext();
  const rows = await load(() => listDocuments(ctx));
  return (
    <>
      <PageHeader title="Documents" description="Versioned project documents. Approved versions are never overwritten." actions={<ReadOnlyNote module="Uploads" phase="Phase 3" />} />
      <Panel>
        <DocumentList rows={rows} showProject />
      </Panel>
    </>
  );
}
