import { pageContext, load } from "@/server/page-context";
import { assertProjectAccess } from "@/server/services/projects";
import { listApprovals } from "@/server/services/approvals";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/misc";
import { ApprovalTable } from "@/features/approvals/approval-table";
import { todayISO } from "@/lib/dates";

export default async function ProjectApprovalsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ctx = await pageContext();
  await load(() => assertProjectAccess(ctx, projectId));
  const rows = await listApprovals(ctx, { projectId });
  return (
    <Panel title="Client approvals" description="Each approval is pinned to the exact document version.">
      {rows.length === 0 ? (
        <EmptyState title="No approvals requested for this project." description="Open a document and choose “Request approval” to send its current version to the client." />
      ) : (
        <ApprovalTable rows={rows} today={todayISO(ctx.timezone)} showProject={false} />
      )}
    </Panel>
  );
}
