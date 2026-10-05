import type { Metadata } from "next";
import { pageContext, load } from "@/server/page-context";
import { can, requirePermission } from "@/server/authz/context";
import { getProject, listTeamMembers } from "@/server/services/projects";
import { listClientOptions } from "@/server/services/clients";
import { toISODate } from "@/lib/dates";
import { ProjectForm } from "@/features/projects/project-form";

export const metadata: Metadata = { title: "Edit project" };

export default async function EditProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ctx = await pageContext();
  const { project } = await load(async () => {
    requirePermission(ctx, "project.edit");
    return getProject(ctx, projectId);
  });
  const [clients, team] = await Promise.all([listClientOptions(ctx), listTeamMembers(ctx)]);
  return (
    <div className="max-w-4xl">
      <ProjectForm
        projectId={project.id}
        clients={clients}
        team={team}
        showFinance={can(ctx, "finance.view")}
        initial={{
          name: project.name,
          clientId: project.clientId,
          description: project.description,
          projectType: project.projectType,
          priority: project.priority,
          status: project.status,
          startDate: toISODate(project.startDate),
          dueDate: toISODate(project.dueDate),
          contractValue: project.contractValue,
          paymentTerms: project.paymentTerms,
          repositoryUrl: project.repositoryUrl,
          productionUrl: project.productionUrl,
          stagingUrl: project.stagingUrl,
          hostingProvider: project.hostingProvider,
          scopeSummary: project.scopeSummary,
          outOfScope: project.outOfScope,
          projectManagerId: project.projectManagerId,
          memberIds: project.members.map((m) => m.userId),
        }}
      />
    </div>
  );
}
