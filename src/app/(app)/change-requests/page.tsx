import type { Metadata } from "next";
import Link from "@/components/ui/link";
import { pageContext, moneyFmt } from "@/server/page-context";
import { can } from "@/server/authz/context";
import { listChangeRequests } from "@/server/services/change-requests";
import { listProjectOptions } from "@/server/services/projects";
import { changeRequestListQuery } from "@/server/validation/schemas";
import { PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/misc";
import { FilterBar, FilterSelect, SearchInput } from "@/components/ui/filter-bar";
import { ChangeRequestTable } from "@/features/change-requests/cr-table";
import { NewChangeRequestButton } from "@/features/change-requests/cr-form";
import { CHANGE_REQUEST_STATUS, options } from "@/lib/status";
import { flatParams, type SearchParams } from "@/lib/url";

export const metadata: Metadata = { title: "Change Requests" };

export default async function ChangeRequestsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await pageContext();
  const params = flatParams(await searchParams);
  const parsed = changeRequestListQuery.safeParse(params);
  const [rows, projects] = await Promise.all([listChangeRequests(ctx, parsed.success ? parsed.data : {}), listProjectOptions(ctx)]);
  const filtered = !!(params.q || params.status || params.projectId);
  const internal = ctx.role !== "CLIENT";

  return (
    <>
      <PageHeader
        title="Change Requests"
        description="Scope changes with impact, hours, cost and the client's decision. Separate from tasks."
        actions={can(ctx, "changeRequest.request") && <NewChangeRequestButton projects={projects} internal={internal} openInitially={params.new === "1"} />}
      />
      <Panel
        title={
          <FilterBar action="/change-requests">
            <SearchInput defaultValue={params.q} placeholder="Search title or CR-014" />
            <FilterSelect name="status" label="Any status" defaultValue={params.status} options={options(CHANGE_REQUEST_STATUS)} />
            {projects.length > 1 && <FilterSelect name="projectId" label="All projects" defaultValue={params.projectId} options={projects.map((p) => ({ value: p.id, label: p.name }))} />}
            {filtered && <Link href="/change-requests" className="text-xs text-ink-3 hover:text-ink">Clear</Link>}
          </FilterBar>
        }
      >
        {rows.length === 0 ? (
          <EmptyState title={filtered ? "No change requests match these filters." : "No scope changes have been requested."} description={filtered ? undefined : "When a client asks for something outside the agreed scope, record it here with its impact, hours and cost."} />
        ) : (
          <ChangeRequestTable rows={rows} fmt={moneyFmt(ctx)} />
        )}
      </Panel>
    </>
  );
}
