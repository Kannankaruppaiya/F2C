import { pageContext, load, moneyFmt } from "@/server/page-context";
import { can } from "@/server/authz/context";
import { assertProjectAccess } from "@/server/services/projects";
import { listChangeRequests } from "@/server/services/change-requests";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/misc";
import { ChangeRequestTable } from "@/features/change-requests/cr-table";
import { NewChangeRequestButton } from "@/features/change-requests/cr-form";

export default async function ProjectCRPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ctx = await pageContext();
  const project = await load(() => assertProjectAccess(ctx, projectId));
  const rows = await listChangeRequests(ctx, { projectId });
  return (
    <Panel
      title="Change requests"
      description="Scope changes, separate from tasks."
      actions={can(ctx, "changeRequest.request") && <NewChangeRequestButton projects={[{ id: project.id, name: project.name }]} defaultProjectId={project.id} internal={ctx.role !== "CLIENT"} />}
    >
      {rows.length === 0 ? <EmptyState title="No scope changes have been requested." /> : <ChangeRequestTable rows={rows} fmt={moneyFmt(ctx)} showProject={false} />}
    </Panel>
  );
}
