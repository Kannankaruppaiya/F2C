import type { Metadata } from "next";
import { Check } from "lucide-react";
import { pageContext } from "@/server/page-context";
import { db } from "@/server/db";
import { can } from "@/server/authz/context";
import { PERMISSIONS, roleHas } from "@/server/authz/permissions";
import { DefinitionList, PageHeader, Panel } from "@/components/ui/panel";
import { Avatar } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { ROLE } from "@/lib/status";
import { formatMoney, timeAgo } from "@/lib/format";
import type { Role } from "@prisma/client";

export const metadata: Metadata = { title: "Settings" };

const ROLES = Object.keys(ROLE) as Role[];

export default async function SettingsPage() {
  const ctx = await pageContext();
  const [user, workspace, members] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { name: true, email: true, avatarColor: true, lastLoginAt: true } }),
    db.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } }),
    can(ctx, "users.manage")
      ? db.workspaceMember.findMany({ where: { workspaceId: ctx.workspaceId }, include: { user: { select: { name: true, email: true, avatarColor: true, lastLoginAt: true } }, client: { select: { name: true } } }, orderBy: { createdAt: "asc" } })
      : Promise.resolve([]),
  ]);
  const fmt = { currency: workspace.currency, locale: workspace.locale };

  return (
    <>
      <PageHeader title="Settings" description="Profile, workspace, team and permissions." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Profile" bodyClassName="p-4">
          <div className="mb-4 flex items-center gap-3">
            <Avatar name={user.name} color={user.avatarColor} size="md" />
            <div><p className="text-[13px] font-medium">{user.name}</p><p className="text-xs text-ink-3">{user.email}</p></div>
            <Badge tone="violet" className="ml-auto">{ROLE[ctx.role]}</Badge>
          </div>
          <DefinitionList items={[{ label: "Last sign-in", value: user.lastLoginAt ? timeAgo(user.lastLoginAt) : "—" }, { label: "Session", value: "Secure httpOnly cookie, 30-day rolling expiry" }]} />
        </Panel>
        <Panel title="Workspace" bodyClassName="p-4">
          <DefinitionList
            items={[
              { label: "Name", value: workspace.name },
              { label: "Currency", value: `${workspace.currency} (${workspace.locale})` },
              { label: "Timezone", value: workspace.timezone },
              { label: "Default tax rate", value: `${Number(workspace.defaultTaxRate)}%` },
              { label: "Invoice prefix", value: workspace.invoicePrefix },
              ...(can(ctx, "finance.view") ? [{ label: "Default internal cost / hour", value: formatMoney(Number(workspace.defaultHourlyCost), fmt) }] : []),
            ]}
          />
        </Panel>
      </div>

      {members.length > 0 && (
        <Panel className="mt-5" title="Team" description={`${members.length} members`}>
          <Table>
            <THead><TH>Member</TH><TH>Role</TH><TH className="hidden md:table-cell">Cost / hour</TH><TH className="hidden lg:table-cell">Last sign-in</TH></THead>
            <tbody>
              {members.map((m) => (
                <TR key={m.id}>
                  <TD><div className="flex items-center gap-2"><Avatar name={m.user.name} color={m.user.avatarColor} /><div><p className="font-medium">{m.user.name}</p><p className="text-2xs text-ink-4">{m.user.email}</p></div></div></TD>
                  <TD><Badge tone={m.role === "CLIENT" ? "amber" : "neutral"}>{ROLE[m.role]}</Badge>{m.client && <span className="ml-1 text-2xs text-ink-4">· {m.client.name}</span>}</TD>
                  <TD className="tabular hidden text-ink-2 md:table-cell">{m.hourlyCost ? formatMoney(Number(m.hourlyCost), fmt) : <span className="text-ink-4">Workspace default</span>}</TD>
                  <TD className="hidden text-ink-3 lg:table-cell">{m.user.lastLoginAt ? timeAgo(m.user.lastLoginAt) : "Never"}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Panel>
      )}

      <Panel className="mt-5" title="Roles & permissions" description="Enforced on the server for every request. Client users never see internal financials.">
        <Table>
          <THead>
            <TH>Permission</TH>
            {ROLES.map((r) => <TH key={r} className="text-center">{ROLE[r]}</TH>)}
          </THead>
          <tbody>
            {PERMISSIONS.map((p) => (
              <TR key={p}>
                <TD className="font-mono text-xs">{p}</TD>
                {ROLES.map((r) => <TD key={r} className="text-center">{roleHas(r, p) ? <Check className="mx-auto size-3.5 text-ok" aria-label="Allowed" /> : <span className="text-ink-4" aria-label="Not allowed">·</span>}</TD>)}
              </TR>
            ))}
          </tbody>
        </Table>
      </Panel>
    </>
  );
}
