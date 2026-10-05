import { pageContext, load } from "@/server/page-context";
import { can } from "@/server/authz/context";
import { listFeatures } from "@/server/services/features";
import { getProject } from "@/server/services/projects";
import { FeatureManager } from "@/features/projects/feature-manager";
import { listApprovedChangeRequests } from "@/server/services/change-requests";

export default async function FeaturesPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ new?: string }> }) {
  const [{ projectId }, sp] = await Promise.all([params, searchParams]);
  const ctx = await pageContext();
  const [{ summary }, features, changeRequests] = await load(() => Promise.all([getProject(ctx, projectId), listFeatures(ctx, projectId), listApprovedChangeRequests(ctx, projectId)]));
  return (
    <FeatureManager
      projectId={projectId}
      features={features}
      phases={summary.phases.map((p) => ({ id: p.id, name: p.name }))}
      canEdit={can(ctx, "feature.edit")}
      canVerify={can(ctx, "task.edit")}
      openNew={sp.new === "1"}
      changeRequests={changeRequests}
    />
  );
}
