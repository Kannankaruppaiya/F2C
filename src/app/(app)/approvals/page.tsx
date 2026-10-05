import type { Metadata } from "next";
import { pageContext } from "@/server/page-context";
import { listApprovals } from "@/server/services/approvals";
import { PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/misc";
import { Segmented } from "@/components/ui/tabs";
import { ApprovalTable } from "@/features/approvals/approval-table";
import { todayISO } from "@/lib/dates";

export const metadata: Metadata = { title: "Approvals" };

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const ctx = await pageContext();
  const { view } = await searchParams;
  const all = view === "all";
  const isClient = ctx.role === "CLIENT";
  const rows = await listApprovals(ctx, all ? {} : { status: "PENDING", ...(isClient ? { mine: "1" } : {}) });
  return (
    <>
      <PageHeader
        title="Approvals"
        description="Client sign-off, pinned to exact document versions."
        actions={
          <Segmented
            items={[
              { href: "/approvals", label: isClient ? "Awaiting your action" : "Pending", active: !all },
              { href: "/approvals?view=all", label: "All approvals", active: all },
            ]}
          />
        }
      />
      <Panel>
        {rows.length === 0 ? (
          <EmptyState
            title={all ? "No approvals have been requested yet." : "No approvals are waiting for your action."}
            description={isClient ? "When the team needs your sign-off on a document, it appears here." : "Request approval from a document's page to send an exact version to the client."}
          />
        ) : (
          <ApprovalTable rows={rows} today={todayISO(ctx.timezone)} />
        )}
      </Panel>
    </>
  );
}
