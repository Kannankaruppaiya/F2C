import { pageContext, load } from "@/server/page-context";
import { getProject } from "@/server/services/projects";
import { listDeployments } from "@/server/services/records";
import { DefinitionList, Panel } from "@/components/ui/panel";
import { DeploymentTable } from "@/features/records/tables";
import { ReadOnlyNote } from "@/features/records/read-only-note";

const link = (u: string | null) => (u ? <a href={u} target="_blank" rel="noreferrer noopener" className="hover:text-accent">{u.replace(/^https?:\/\//, "")}</a> : null);

export default async function ProjectDeploymentPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ctx = await pageContext();
  const [{ project }, rows] = await load(() => Promise.all([getProject(ctx, projectId), listDeployments(ctx, { projectId })]));
  const latestProd = rows.find((r) => r.environment === "PRODUCTION" && r.status === "SUCCESSFUL");
  return (
    <div className="space-y-5">
      <Panel title="Environments" bodyClassName="p-4">
        <DefinitionList
          className="lg:grid-cols-4"
          items={[
            { label: "Repository", value: link(project.repositoryUrl) },
            { label: "Staging", value: link(project.stagingUrl) },
            { label: "Production", value: link(project.productionUrl) },
            { label: "Hosting", value: project.hostingProvider },
            { label: "Live version", value: latestProd?.version ?? "Not deployed" },
          ]}
        />
      </Panel>
      <Panel title="Deployment history" actions={<ReadOnlyNote module="Deployment logging" phase="Phase 5" />}><DeploymentTable rows={rows} /></Panel>
    </div>
  );
}
