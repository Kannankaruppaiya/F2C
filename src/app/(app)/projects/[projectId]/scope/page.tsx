import Link from "@/components/ui/link";
import { pageContext, load, moneyFmt } from "@/server/page-context";
import { can } from "@/server/authz/context";
import { getProject } from "@/server/services/projects";
import { listFeatures } from "@/server/services/features";
import { listChangeRequests } from "@/server/services/change-requests";
import { getScopeSummary } from "@/server/services/scope";
import { Panel } from "@/components/ui/panel";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { ScopeStrip } from "@/features/change-requests/scope-strip";
import { CHANGE_REQUEST_STATUS, FEATURE_STATUS } from "@/lib/status";
import { formatHours } from "@/lib/format";

export default async function ScopePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ctx = await pageContext();
  const [{ project }, features, crs, scope] = await load(() => Promise.all([getProject(ctx, projectId), listFeatures(ctx, projectId), listChangeRequests(ctx, { projectId }), getScopeSummary(ctx, projectId)]));
  const fmt = moneyFmt(ctx);
  const showCost = can(ctx, "finance.view") || ctx.role === "CLIENT";
  const text = (s: string | null, empty: string) => (s ? <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink-2">{s}</p> : <p className="text-[13px] text-ink-4">{empty}</p>);
  const original = features.filter((f) => !f.changeRequest);
  const added = features.filter((f) => f.changeRequest);

  return (
    <div className="space-y-5">
      <Panel title="Scope at a glance" description="Original agreement, plus changes the client approved, equals what we are now delivering.">
        <ScopeStrip scope={scope} fmt={fmt} showCost={showCost} />
      </Panel>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Original scope — in" bodyClassName="px-4 py-3">{text(project.scopeSummary, "Scope not documented yet. Edit the project to add it.")}</Panel>
        <Panel title="Original scope — out" bodyClassName="px-4 py-3">{text(project.outOfScope, "Nothing explicitly excluded.")}</Panel>
      </div>
      <Panel title="Change requests" description={`${scope.approvedChanges.changeRequests} approved · ${scope.pendingChanges.changeRequests} pending client approval · ${scope.rejectedChanges} rejected`}>
        {crs.length === 0 ? (
          <EmptyState title="No scope changes have been requested." />
        ) : (
          <ul className="divide-y divide-line text-[13px]">
            {crs.map((c) => (
              <li key={c.id}>
                <Link href={`/change-requests/${c.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 hover:bg-subtle">
                  <span className="font-mono text-xs text-ink-4">{c.key}</span>
                  {c.originalScope && <span className="text-ink-3 line-through decoration-ink-4">{c.originalScope}</span>}
                  {c.originalScope && <span className="text-ink-4">→</span>}
                  <span className="font-medium">{c.requestedChange ?? c.title}</span>
                  <StatusBadge defs={CHANGE_REQUEST_STATUS} value={c.status} />
                  <span className="tabular ml-auto text-xs text-ink-3">+{formatHours(c.estimatedHours)}{showCost && c.additionalCost > 0 && <> · <Money value={c.additionalCost} fmt={fmt} /></>}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Original features" description={`${original.length} features`}>
          {original.length === 0 ? <EmptyState title="No features defined." className="py-8" /> : (
            <ul className="divide-y divide-line">
              {original.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 px-4 py-2 text-[13px]">
                  <span className="truncate">{f.name} <span className="text-2xs text-ink-4">· {f.phase.name}</span></span>
                  <Badge tone={FEATURE_STATUS[f.status].tone}>{FEATURE_STATUS[f.status].label}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Added by approved changes" description={`${added.length} features`}>
          {added.length === 0 ? <EmptyState title="No features added by change requests." className="py-8" /> : (
            <ul className="divide-y divide-line">
              {added.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 px-4 py-2 text-[13px]">
                  <span className="truncate">{f.name} <Link href={`/change-requests/${f.changeRequest!.id}`} className="font-mono text-2xs text-accent hover:underline">{f.changeRequest!.key}</Link></span>
                  <Badge tone={FEATURE_STATUS[f.status].tone}>{FEATURE_STATUS[f.status].label}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
