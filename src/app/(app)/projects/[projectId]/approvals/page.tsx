import { pageContext, load } from "@/server/page-context";
import { listApprovals } from "@/server/services/records";
import { Panel } from "@/components/ui/panel";
import { ApprovalTable } from "@/features/records/tables";
import { ReadOnlyNote } from "@/features/records/read-only-note";
import { todayISO } from "@/lib/dates";

export default async function ProjectApprovalsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ctx = await pageContext();
  const rows = await load(() => listApprovals(ctx, { projectId }));
  return <Panel title="Client approvals" description="Each approval references the exact document version." actions={<ReadOnlyNote module="Approval requests" phase="Phase 3" />}><ApprovalTable rows={rows} today={todayISO(ctx.timezone)} /></Panel>;
}
