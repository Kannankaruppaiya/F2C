import type { Metadata } from "next";
import Link from "next/link";
import { pageContext } from "@/server/page-context";
import { db } from "@/server/db";
import { projectScope } from "@/server/authz/context";
import { PageHeader, Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { ProgressBar } from "@/components/ui/progress";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { PROJECT_STATUS } from "@/lib/status";

export const metadata: Metadata = { title: "Handover" };

export default async function HandoverPage() {
  const ctx = await pageContext();
  const projects = await db.project.findMany({
    where: { AND: [projectScope(ctx), { status: { in: ["ACTIVE", "CLIENT_REVIEW", "COMPLETED", "MAINTENANCE"] } }] },
    select: { id: true, name: true, status: true, client: { select: { name: true } }, handoverItems: { select: { name: true, isRequired: true, status: true } } },
    orderBy: { dueDate: "asc" },
  });
  return (
    <>
      <PageHeader title="Handover" description="A project is only delivered when its required handover items are complete." />
      <Panel>
        {projects.length === 0 ? <EmptyState title="No projects in delivery." /> : (
          <Table>
            <THead><TH>Project</TH><TH className="hidden sm:table-cell">Status</TH><TH>Required items</TH><TH className="hidden lg:table-cell">Still pending</TH></THead>
            <tbody>
              {projects.map((p) => {
                const req = p.handoverItems.filter((h) => h.isRequired);
                const done = req.filter((h) => h.status !== "PENDING").length;
                const pending = req.filter((h) => h.status === "PENDING").map((h) => h.name);
                return (
                  <TR key={p.id}>
                    <TD><Link href={`/projects/${p.id}/handover`} className="font-medium hover:text-accent">{p.name}</Link><div className="text-2xs text-ink-4">{p.client.name}</div></TD>
                    <TD className="hidden sm:table-cell"><StatusBadge defs={PROJECT_STATUS} value={p.status} /></TD>
                    <TD><div className="flex items-center gap-2"><ProgressBar value={req.length ? (done / req.length) * 100 : 0} className="w-20" /><span className="tabular text-xs">{done}/{req.length}</span></div></TD>
                    <TD className="hidden max-w-md truncate text-xs text-ink-3 lg:table-cell">{pending.join(", ") || "Ready to complete"}</TD>
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
