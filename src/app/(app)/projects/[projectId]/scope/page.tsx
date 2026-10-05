import { pageContext, load } from "@/server/page-context";
import { getProject } from "@/server/services/projects";
import { listChangeRequests } from "@/server/services/records";
import { listFeatures } from "@/server/services/features";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { FEATURE_STATUS } from "@/lib/status";

export default async function ScopePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ctx = await pageContext();
  const [{ project }, crs, features] = await load(() => Promise.all([getProject(ctx, projectId), listChangeRequests(ctx, { projectId }), listFeatures(ctx, projectId)]));
  const approvedChanges = crs.filter((c) => c.status === "APPROVED" || c.status === "IMPLEMENTED");
  const pendingChanges = crs.filter((c) => c.status === "PENDING_CLIENT_APPROVAL" || c.status === "PENDING_INTERNAL_REVIEW");
  const text = (s: string | null, empty: string) => (s ? <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink-2">{s}</p> : <p className="text-[13px] text-ink-4">{empty}</p>);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="In scope" bodyClassName="px-4 py-3">{text(project.scopeSummary, "Scope not documented yet. Edit the project to add it.")}</Panel>
      <Panel title="Out of scope" bodyClassName="px-4 py-3">{text(project.outOfScope, "Nothing explicitly excluded.")}</Panel>
      <Panel title="Scope changes" description={`${approvedChanges.length} approved · ${pendingChanges.length} pending`} className="lg:col-span-2">
        {crs.length === 0 ? (
          <EmptyState title="Scope unchanged since kickoff." />
        ) : (
          <ul className="divide-y divide-line text-[13px]">
            {[...approvedChanges, ...pendingChanges].map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <span className="font-mono text-xs text-ink-4">{c.key}</span>
                <span className="text-ink-3 line-through decoration-ink-4">{c.originalScope ?? "—"}</span>
                <span className="text-ink-4">→</span>
                <span className="font-medium">{c.requestedChange ?? c.title}</span>
                <Badge tone={c.status === "APPROVED" || c.status === "IMPLEMENTED" ? "green" : "amber"}>{c.status === "APPROVED" || c.status === "IMPLEMENTED" ? "In scope" : "Awaiting approval"}</Badge>
                <span className="tabular ml-auto text-xs text-ink-3">+{c.additionalHours}h</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Feature inventory" description={`${features.length} features`} className="lg:col-span-2">
        {features.length === 0 ? (
          <EmptyState title="No features defined." />
        ) : (
          <ul className="grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0">
            {features.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 border-line px-4 py-2 text-[13px] sm:border-b">
                <span className="truncate">{f.name} <span className="text-2xs text-ink-4">· {f.phase.name}</span></span>
                <Badge tone={FEATURE_STATUS[f.status].tone}>{FEATURE_STATUS[f.status].label}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
