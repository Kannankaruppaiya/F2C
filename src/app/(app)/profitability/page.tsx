import type { Metadata } from "next";
import Link from "next/link";
import { pageContext, load, moneyFmt } from "@/server/page-context";
import { requirePermission } from "@/server/authz/context";
import { listProjects } from "@/server/services/projects";
import { PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState, Stat, StatGrid } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { formatHours, formatPercent } from "@/lib/format";

export const metadata: Metadata = { title: "Profitability" };

export default async function ProfitabilityPage() {
  const ctx = await pageContext();
  await load(async () => requirePermission(ctx, "finance.view"));
  const projects = (await listProjects(ctx, { scope: "all", sort: "contractValue", dir: "desc" })).filter((p) => p.financials && p.status !== "LEAD");
  const fmt = moneyFmt(ctx);
  const sum = (k: "contractValue" | "paid" | "laborCost" | "expensesTotal" | "actualCost" | "actualProfit" | "expectedProfit") => projects.reduce((s, p) => s + p.financials![k], 0);
  const paid = sum("paid");
  const profit = sum("actualProfit");

  return (
    <>
      <PageHeader title="Profitability" description="Revenue received minus labour (tracked hours × cost rate) and expenses. Computed live from records." />
      <StatGrid className="grid-cols-2 md:grid-cols-4">
        <Stat label="Revenue received" value={<Money value={paid} fmt={fmt} compact />} />
        <Stat label="Actual cost" value={<Money value={sum("actualCost")} fmt={fmt} compact />} sub={<>Labour <Money value={sum("laborCost")} fmt={fmt} compact /> · Expenses <Money value={sum("expensesTotal")} fmt={fmt} compact /></>} />
        <Stat label="Actual profit" value={<Money value={profit} fmt={fmt} compact />} tone={profit < 0 ? "bad" : "ok"} sub={paid > 0 ? `${formatPercent((profit / paid) * 100)} margin` : undefined} />
        <Stat label="Expected profit" value={<Money value={sum("expectedProfit")} fmt={fmt} compact />} sub="Contract − projected cost" />
      </StatGrid>
      <Panel className="mt-5" title="By project">
        {projects.length === 0 ? <EmptyState title="No projects with financial data yet." /> : (
          <Table>
            <THead>
              <TH>Project</TH>
              <TH className="hidden text-right md:table-cell">Contract</TH>
              <TH className="text-right">Received</TH>
              <TH className="hidden text-right lg:table-cell">Hours</TH>
              <TH className="hidden text-right lg:table-cell">Labour</TH>
              <TH className="hidden text-right lg:table-cell">Expenses</TH>
              <TH className="text-right">Actual profit</TH>
              <TH className="hidden text-right sm:table-cell">Margin</TH>
              <TH className="hidden text-right xl:table-cell">Expected profit</TH>
            </THead>
            <tbody>
              {projects.map((p) => {
                const f = p.financials!;
                return (
                  <TR key={p.id}>
                    <TD><Link href={`/projects/${p.id}`} className="font-medium hover:text-accent">{p.name}</Link><div className="text-2xs text-ink-4">{p.client.name}</div></TD>
                    <TD className="hidden text-right md:table-cell"><Money value={f.contractValue} fmt={fmt} /></TD>
                    <TD className="text-right"><Money value={f.paid} fmt={fmt} /></TD>
                    <TD className={cn("tabular hidden text-right lg:table-cell", p.actualHours > p.estimatedHours && p.estimatedHours > 0 && "text-bad")}>{formatHours(p.actualHours)} / {formatHours(p.estimatedHours)}</TD>
                    <TD className="hidden text-right text-ink-2 lg:table-cell"><Money value={f.laborCost} fmt={fmt} /></TD>
                    <TD className="hidden text-right text-ink-2 lg:table-cell"><Money value={f.expensesTotal} fmt={fmt} /></TD>
                    <TD className={cn("text-right font-medium", f.actualProfit < 0 ? "text-bad" : "text-ok")}><Money value={f.actualProfit} fmt={fmt} /></TD>
                    <TD className="tabular hidden text-right sm:table-cell">{f.marginPct === null ? "—" : formatPercent(f.marginPct)}</TD>
                    <TD className={cn("hidden text-right xl:table-cell", f.expectedProfit < 0 && "text-bad")}><Money value={f.expectedProfit} fmt={fmt} /></TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
