import { pageContext, load, moneyFmt } from "@/server/page-context";
import { listChangeRequests } from "@/server/services/records";
import { Panel } from "@/components/ui/panel";
import { ChangeRequestList } from "@/features/records/tables";
import { ReadOnlyNote } from "@/features/records/read-only-note";

export default async function ProjectCRPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ctx = await pageContext();
  const rows = await load(() => listChangeRequests(ctx, { projectId }));
  return <Panel title="Change requests" description="Scope changes, separate from tasks." actions={<ReadOnlyNote module="CR workflow" phase="Phase 3" />}><ChangeRequestList rows={rows} fmt={moneyFmt(ctx)} /></Panel>;
}
