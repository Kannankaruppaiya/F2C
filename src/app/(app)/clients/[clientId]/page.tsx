import type { Metadata } from "next";
import { Pencil, Plus } from "lucide-react";
import { pageContext, load, moneyFmt } from "@/server/page-context";
import { can, type AuthContext } from "@/server/authz/context";
import type { MoneyFormat } from "@/lib/format";
import { getClient } from "@/server/services/clients";
import { listActivity } from "@/server/services/activity";
import { listInvoices, listPayments } from "@/server/services/records";
import { listDocuments } from "@/server/services/documents";
import { listApprovals } from "@/server/services/approvals";
import { listChangeRequests } from "@/server/services/change-requests";
import { DefinitionList, PageHeader, Panel } from "@/components/ui/panel";
import { ButtonLink } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, Stat, StatGrid } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { QueryTabs } from "@/components/ui/query-tabs";
import { ProjectTable } from "@/features/projects/project-table";
import { ActivityFeed } from "@/features/activity/activity-feed";
import { Contacts } from "@/features/clients/contacts";
import { InvoiceTable, PaymentTable } from "@/features/records/tables";
import { DocumentTable } from "@/features/documents/document-table";
import { ApprovalTable } from "@/features/approvals/approval-table";
import { ChangeRequestTable } from "@/features/change-requests/cr-table";
import { CLIENT_STATUS } from "@/lib/status";
import { todayISO } from "@/lib/dates";

export async function generateMetadata({ params }: { params: Promise<{ clientId: string }> }): Promise<Metadata> {
  const ctx = await pageContext();
  const { clientId } = await params;
  const data = await getClient(ctx, clientId).catch(() => null);
  return { title: data?.client.name ?? "Client" };
}

export default async function ClientDetailPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ clientId }, { tab = "overview" }] = await Promise.all([params, searchParams]);
  const ctx = await pageContext();
  const { client, projects, summary, canEdit } = await load(() => getClient(ctx, clientId));
  const fmt = moneyFmt(ctx);
  const today = todayISO(ctx.timezone);
  const showFinance = can(ctx, "finance.view");
  const base = `/clients/${client.id}`;

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "projects", label: "Projects", count: projects.length },
    { key: "contacts", label: "Contacts", count: client.contacts.length },
    { key: "documents", label: "Documents" },
    ...(showFinance ? [{ key: "invoices", label: "Invoices" }, { key: "payments", label: "Payments" }] : []),
    { key: "approvals", label: "Approvals", count: summary.pendingApprovals },
    { key: "change-requests", label: "Change Requests", count: summary.openChangeRequests },
    { key: "activity", label: "Activity" },
  ];
  const active = tabs.some((t) => t.key === tab) ? tab : "overview";
  const filter = { clientId: client.id };

  return (
    <>
      <PageHeader
        title={client.name}
        description={[client.company, client.country].filter(Boolean).join(" · ") || undefined}
        meta={<StatusBadge defs={CLIENT_STATUS} value={client.status} />}
        actions={
          <>
            {canEdit && <ButtonLink href={`${base}/edit`}><Pencil className="size-3.5" /> Edit</ButtonLink>}
            {can(ctx, "project.create") && <ButtonLink href={`/projects/new?clientId=${client.id}`} variant="primary"><Plus className="size-3.5" /> New project</ButtonLink>}
          </>
        }
      />

      <StatGrid className={showFinance ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-6" : "grid-cols-3"}>
        <Stat label="Active projects" value={summary.activeProjects} sub={`${summary.totalProjects} total`} />
        <Stat label="Pending approvals" value={summary.pendingApprovals} tone={summary.pendingApprovals ? "warn" : undefined} />
        <Stat label="Open change requests" value={summary.openChangeRequests} />
        {showFinance && (
          <>
            <Stat label="Contract value" value={<Money value={summary.contractValue} fmt={fmt} compact />} sub="Incl. approved CRs" />
            <Stat label="Paid" value={<Money value={summary.paid} fmt={fmt} compact />} tone="ok" />
            <Stat
              label="Outstanding"
              value={<Money value={summary.outstanding} fmt={fmt} compact />}
              tone={summary.overdue ? "bad" : undefined}
              sub={summary.overdue ? <span className="text-bad"><Money value={summary.overdue} fmt={fmt} compact /> overdue</span> : "Nothing overdue"}
            />
          </>
        )}
      </StatGrid>

      <div className="mt-5 border-b border-line">
        <QueryTabs base={base} active={active} items={tabs} />
      </div>

      <div className="mt-5">
        {active === "overview" && (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-5">
              <Panel title="Projects">
                {projects.length ? <ProjectTable projects={projects} today={today} fmt={fmt} showStatus compact /> : <EmptyState title="No projects for this client yet." />}
              </Panel>
              <Panel title="Recent activity">
                <ActivityFeed items={await listActivity(ctx, { clientId: client.id, limit: 10 })} />
              </Panel>
            </div>
            <div className="space-y-5">
              <Panel title="Profile" bodyClassName="p-4">
                <DefinitionList
                  single
                  items={[
                    { label: "Email", value: client.email ? <a className="hover:text-accent" href={`mailto:${client.email}`}>{client.email}</a> : null },
                    { label: "Phone", value: client.phone },
                    { label: "Website", value: client.website ? <a className="hover:text-accent" href={client.website} target="_blank" rel="noreferrer noopener">{client.website.replace(/^https?:\/\//, "")}</a> : null },
                    { label: "Address", value: client.address ? <span className="whitespace-normal">{client.address}</span> : null },
                  ]}
                />
                {client.notes && canEdit && (
                  <div className="mt-4 border-t border-line pt-3">
                    <p className="text-2xs font-medium uppercase tracking-wide text-ink-4">Internal notes</p>
                    <p className="mt-1 whitespace-pre-line text-[13px] text-ink-2">{client.notes}</p>
                  </div>
                )}
              </Panel>
              <Panel title="Contacts">
                <Contacts clientId={client.id} contacts={client.contacts} canEdit={canEdit} />
              </Panel>
            </div>
          </div>
        )}
        {active === "projects" && (
          <Panel>{projects.length ? <ProjectTable projects={projects} today={today} fmt={fmt} showStatus /> : <EmptyState title="No projects for this client yet." />}</Panel>
        )}
        {active === "contacts" && (
          <Panel className="max-w-3xl"><Contacts clientId={client.id} contacts={client.contacts} canEdit={canEdit} /></Panel>
        )}
        {active === "documents" && <Panel><DocumentTable rows={await listDocuments(ctx, filter)} /></Panel>}
        {active === "invoices" && <Panel><InvoiceTable rows={await listInvoices(ctx, filter)} fmt={fmt} showProject /></Panel>}
        {active === "payments" && <Panel><PaymentTable rows={await listPayments(ctx, filter)} fmt={fmt} showProject /></Panel>}
        {active === "approvals" && <ClientApprovals ctx={ctx} clientId={client.id} today={today} />}
        {active === "change-requests" && <ClientChangeRequests ctx={ctx} clientId={client.id} fmt={fmt} />}
        {active === "activity" && <Panel><ActivityFeed items={await listActivity(ctx, { clientId: client.id, limit: 100 })} /></Panel>}
      </div>
    </>
  );
}

async function ClientApprovals({ ctx, clientId, today }: { ctx: AuthContext; clientId: string; today: string }) {
  const rows = await listApprovals(ctx, { clientId });
  return <Panel>{rows.length ? <ApprovalTable rows={rows} today={today} /> : <EmptyState title="No approvals for this client." />}</Panel>;
}

async function ClientChangeRequests({ ctx, clientId, fmt }: { ctx: AuthContext; clientId: string; fmt: MoneyFormat }) {
  const rows = await listChangeRequests(ctx, { clientId });
  return <Panel>{rows.length ? <ChangeRequestTable rows={rows} fmt={fmt} /> : <EmptyState title="No scope changes have been requested." />}</Panel>;
}
