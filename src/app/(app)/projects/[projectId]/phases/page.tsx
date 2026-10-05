import { pageContext, load, moneyFmt } from "@/server/page-context";
import { can } from "@/server/authz/context";
import { listPhases } from "@/server/services/phases";
import { PhaseManager } from "@/features/projects/phase-manager";
import { todayISO } from "@/lib/dates";

export default async function PhasesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ctx = await pageContext();
  const phases = await load(() => listPhases(ctx, projectId));
  return <PhaseManager projectId={projectId} phases={phases} canEdit={can(ctx, "phase.edit")} fmt={moneyFmt(ctx)} today={todayISO(ctx.timezone)} />;
}
