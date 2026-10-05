import type { Metadata } from "next";
import Link from "@/components/ui/link";
import { Plus } from "lucide-react";
import { pageContext, load, moneyFmt } from "@/server/page-context";
import { can, requirePermission } from "@/server/authz/context";
import { listClients, type ClientListQuery } from "@/server/services/clients";
import { PageHeader, Panel } from "@/components/ui/panel";
import { ButtonLink } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { SortTH, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterBar, FilterSelect, SearchInput } from "@/components/ui/filter-bar";
import { ColumnToggle } from "@/components/ui/column-toggle";
import { CLIENT_STATUS, options } from "@/lib/status";
import { timeAgo } from "@/lib/format";
import { flatParams, hrefWith, type SearchParams } from "@/lib/url";

export const metadata: Metadata = { title: "Clients" };

const COLUMNS = [
  { key: "company", label: "Company" },
  { key: "active", label: "Active projects" },
  { key: "value", label: "Contract value" },
  { key: "paid", label: "Paid" },
  { key: "outstanding", label: "Outstanding" },
  { key: "activity", label: "Last activity" },
  { key: "status", label: "Status" },
];

export default async function ClientsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await pageContext();
  await load(async () => requirePermission(ctx, "client.view"));
  const params = flatParams(await searchParams);
  const sort = (["name", "contractValue", "outstanding", "lastActivity"].includes(params.sort ?? "") ? params.sort : "name") as NonNullable<ClientListQuery["sort"]>;
  const dir = params.dir === "desc" ? "desc" : "asc";
  const status = params.status && params.status in CLIENT_STATUS ? (params.status as ClientListQuery["status"]) : undefined;
  const clients = await listClients(ctx, { q: params.q, status, sort, dir });
  const fmt = moneyFmt(ctx);
  const showFinance = can(ctx, "finance.view");
  const hrefFor = (field: string, d: "asc" | "desc") => hrefWith("/clients", params, { sort: field, dir: d });
  const filtered = !!(params.q || params.status);

  return (
    <>
      <PageHeader
        title="Clients"
        description={`${clients.length} client${clients.length === 1 ? "" : "s"}${status ? "" : " (archived hidden)"}`}
        actions={can(ctx, "client.edit") && <ButtonLink href="/clients/new" variant="primary"><Plus className="size-3.5" /> New client</ButtonLink>}
      />
      <Panel
        title={
          <FilterBar action="/clients" hidden={{ sort: params.sort, dir: params.dir }}>
            <SearchInput defaultValue={params.q} placeholder="Search name, company, email" />
            <FilterSelect name="status" label="All statuses" defaultValue={params.status} options={options(CLIENT_STATUS)} />
            {filtered && <Link href="/clients" className="text-xs text-ink-3 hover:text-ink">Clear</Link>}
          </FilterBar>
        }
        actions={<ColumnToggle tableId="clients-table" columns={showFinance ? COLUMNS : COLUMNS.filter((c) => !["value", "paid", "outstanding"].includes(c.key))} />}
      >
        {clients.length === 0 ? (
          filtered ? (
            <EmptyState title="No clients match these filters." action={<ButtonLink href="/clients">Clear filters</ButtonLink>} />
          ) : (
            <EmptyState title="No clients yet." description="Every project belongs to a client. Add one to get started." action={can(ctx, "client.edit") && <ButtonLink href="/clients/new" variant="primary">Add your first client</ButtonLink>} />
          )
        ) : (
          <Table id="clients-table">
            <THead>
              <SortTH label="Client" field="name" current={sort} dir={dir} hrefFor={hrefFor} />
              <TH data-col="company" className="hidden lg:table-cell">Company</TH>
              <TH data-col="active" className="hidden text-right sm:table-cell">Active</TH>
              {showFinance && <SortTH col="value" label="Contract value" field="contractValue" current={sort} dir={dir} hrefFor={hrefFor} className="hidden text-right md:table-cell" />}
              {showFinance && <TH data-col="paid" className="hidden text-right lg:table-cell">Paid</TH>}
              {showFinance && <SortTH col="outstanding" label="Outstanding" field="outstanding" current={sort} dir={dir} hrefFor={hrefFor} className="text-right" />}
              <SortTH col="activity" label="Last activity" field="lastActivity" current={sort} dir={dir} hrefFor={hrefFor} className="hidden xl:table-cell" />
              <TH data-col="status">Status</TH>
            </THead>
            <tbody>
              {clients.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <Link href={`/clients/${c.id}`} className="font-medium hover:text-accent">{c.name}</Link>
                    {c.email && <div className="truncate text-2xs text-ink-4">{c.email}</div>}
                  </TD>
                  <TD data-col="company" className="hidden text-ink-2 lg:table-cell">{c.company ?? "—"}</TD>
                  <TD data-col="active" className="tabular hidden text-right sm:table-cell">
                    {c.activeProjects}
                    <span className="text-ink-4"> / {c.totalProjects}</span>
                  </TD>
                  {showFinance && <TD data-col="value" className="hidden text-right md:table-cell"><Money value={c.contractValue} fmt={fmt} /></TD>}
                  {showFinance && <TD data-col="paid" className="hidden text-right text-ink-2 lg:table-cell"><Money value={c.paid} fmt={fmt} /></TD>}
                  {showFinance && (
                    <TD data-col="outstanding" className={`text-right ${c.overdue ? "font-medium text-bad" : ""}`}>
                      <Money value={c.outstanding} fmt={fmt} />
                      {!!c.overdue && <div className="text-2xs">incl. <Money value={c.overdue} fmt={fmt} compact /> overdue</div>}
                    </TD>
                  )}
                  <TD data-col="activity" className="hidden text-ink-3 xl:table-cell">{c.lastActivityAt ? timeAgo(c.lastActivityAt) : "—"}</TD>
                  <TD data-col="status"><StatusBadge defs={CLIENT_STATUS} value={c.status} /></TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
