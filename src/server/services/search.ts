import "server-only";
import { db } from "@/server/db";
import { can, projectScope, viaProject, type AuthContext } from "@/server/authz/context";
import { taskKey } from "./tasks";

export interface SearchHit {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

export interface SearchGroup {
  label: string;
  hits: SearchHit[];
}

const LIMIT = 6;

export async function globalSearch(ctx: AuthContext, rawQ: string): Promise<SearchGroup[]> {
  const q = rawQ.trim().slice(0, 100);
  if (q.length < 2) return [];
  const contains = { contains: q, mode: "insensitive" as const };
  const scope = viaProject(ctx);
  const taskNumber = Number(q.replace(/^t-/i, ""));

  const [projects, clients, tasks, features, bugs, invoices] = await Promise.all([
    db.project.findMany({
      where: { AND: [projectScope(ctx), { OR: [{ name: contains }, { code: contains }] }] },
      select: { id: true, name: true, code: true, client: { select: { name: true } } },
      take: LIMIT,
    }),
    can(ctx, "client.view")
      ? db.client.findMany({
          where: { workspaceId: ctx.workspaceId, deletedAt: null, OR: [{ name: contains }, { company: contains }, { email: contains }] },
          select: { id: true, name: true, company: true },
          take: LIMIT,
        })
      : Promise.resolve([]),
    db.task.findMany({
      where: {
        ...scope,
        deletedAt: null,
        OR: [{ title: contains }, ...(Number.isInteger(taskNumber) && taskNumber > 0 ? [{ number: taskNumber }] : [])],
      },
      select: { id: true, number: true, title: true, project: { select: { name: true } } },
      take: LIMIT,
    }),
    db.feature.findMany({
      where: { ...scope, deletedAt: null, name: contains },
      select: { id: true, name: true, projectId: true, project: { select: { name: true } } },
      take: LIMIT,
    }),
    db.bug.findMany({
      where: { ...scope, deletedAt: null, title: contains },
      select: { id: true, number: true, title: true, projectId: true, project: { select: { name: true } } },
      take: LIMIT,
    }),
    can(ctx, "finance.view")
      ? db.invoice.findMany({
          where: { ...scope, deletedAt: null, number: contains },
          select: { id: true, number: true, projectId: true, project: { select: { name: true } } },
          take: LIMIT,
        })
      : Promise.resolve([]),
  ]);

  const groups: SearchGroup[] = [
    { label: "Projects", hits: projects.map((p) => ({ id: p.id, title: p.name, subtitle: `${p.code} · ${p.client.name}`, href: `/projects/${p.id}` })) },
    { label: "Clients", hits: clients.map((c) => ({ id: c.id, title: c.name, subtitle: c.company ?? undefined, href: `/clients/${c.id}` })) },
    { label: "Tasks", hits: tasks.map((t) => ({ id: t.id, title: t.title, subtitle: `${taskKey(t.number)} · ${t.project.name}`, href: `/tasks/${t.id}` })) },
    { label: "Features", hits: features.map((f) => ({ id: f.id, title: f.name, subtitle: f.project.name, href: `/projects/${f.projectId}/features#${f.id}` })) },
    { label: "Bugs", hits: bugs.map((b) => ({ id: b.id, title: b.title, subtitle: `BUG-${b.number} · ${b.project.name}`, href: `/projects/${b.projectId}/bugs` })) },
    { label: "Invoices", hits: invoices.map((i) => ({ id: i.id, title: i.number, subtitle: i.project.name, href: `/projects/${i.projectId}/payments` })) },
  ];
  return groups.filter((g) => g.hits.length > 0);
}
