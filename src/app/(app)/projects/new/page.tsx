import type { Metadata } from "next";
import { pageContext, load } from "@/server/page-context";
import { can, requirePermission } from "@/server/authz/context";
import { listClientOptions } from "@/server/services/clients";
import { listTeamMembers } from "@/server/services/projects";
import { PageHeader } from "@/components/ui/panel";
import { ProjectForm } from "@/features/projects/project-form";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  const ctx = await pageContext();
  await load(async () => requirePermission(ctx, "project.create"));
  const [{ clientId }, clients, team] = await Promise.all([searchParams, listClientOptions(ctx), listTeamMembers(ctx)]);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="New project" description="Projects carry phases, features, tasks, approvals, payments and handover." />
      <ProjectForm projectId={null} clients={clients} team={team} showFinance={can(ctx, "finance.view")} defaultClientId={clientId} initial={{ memberIds: [ctx.userId] } as never} />
    </div>
  );
}
