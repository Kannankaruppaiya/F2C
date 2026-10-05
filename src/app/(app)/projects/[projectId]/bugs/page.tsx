import { pageContext, load } from "@/server/page-context";
import { listBugs } from "@/server/services/records";
import { Panel } from "@/components/ui/panel";
import { BugTable } from "@/features/records/tables";
import { ReadOnlyNote } from "@/features/records/read-only-note";

export default async function ProjectBugsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ctx = await pageContext();
  const rows = await load(() => listBugs(ctx, { projectId }));
  return <Panel title="Bugs" description={`${rows.filter((b) => b.status !== "CLOSED").length} open`} actions={<ReadOnlyNote module="Bug tracking" phase="Phase 2" />}><BugTable rows={rows} /></Panel>;
}
