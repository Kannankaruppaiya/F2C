import { pageContext, load, moneyFmt } from "@/server/page-context";
import { can } from "@/server/authz/context";
import { getMaintenance } from "@/server/services/records";
import { DefinitionList, Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Stat, StatGrid } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { formatDate, formatHours } from "@/lib/format";

const SUPPORT: Record<string, { label: string; tone: "amber" | "blue" | "violet" | "green" | "muted" }> = {
  OPEN: { label: "Open", tone: "amber" }, IN_PROGRESS: { label: "In Progress", tone: "blue" }, WAITING_FOR_CLIENT: { label: "Waiting for Client", tone: "violet" }, RESOLVED: { label: "Resolved", tone: "green" }, CLOSED: { label: "Closed", tone: "muted" },
};

export default async function ProjectMaintenancePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ctx = await pageContext();
  const m = await load(() => getMaintenance(ctx, projectId));
  if (!m) return <Panel><EmptyState title="No maintenance plan." description="Completed projects can move into Maintenance with a support plan, included hours and a monthly fee." /></Panel>;
  return (
    <div className="space-y-5">
      <StatGrid className="grid-cols-2 md:grid-cols-4">
        <Stat label="Included hours" value={formatHours(m.includedHours)} sub="per month" />
        <Stat label="Used" value={formatHours(m.usedHours)} />
        <Stat label="Remaining" value={formatHours(m.remainingHours)} tone={m.remainingHours <= 1 ? "warn" : undefined} />
        {can(ctx, "finance.view") ? <Stat label="Monthly fee" value={<Money value={m.monthlyCost} fmt={moneyFmt(ctx)} />} /> : <Stat label="Plan" value={m.plan} />}
      </StatGrid>
      <Panel title={m.plan} bodyClassName="p-4">
        <DefinitionList className="lg:grid-cols-3" items={[{ label: "Coverage", value: `${formatDate(m.startDate, { year: true })} → ${formatDate(m.endDate, { year: true })}` }, { label: "Support level", value: m.supportLevel }]} />
      </Panel>
      <Panel title="Support requests">
        {m.requests.length === 0 ? <EmptyState title="No support requests." /> : (
          <ul className="divide-y divide-line">
            {m.requests.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                <span className="flex-1">{r.title}</span>
                <span className="text-2xs uppercase tracking-wide text-ink-4">{r.kind.replace("_", " ")}</span>
                <span className="tabular text-xs text-ink-3">{formatHours(r.hoursUsed)}</span>
                <Badge tone={SUPPORT[r.status]!.tone}>{SUPPORT[r.status]!.label}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
