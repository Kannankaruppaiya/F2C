import Link from "@/components/ui/link";
import { pageContext, load } from "@/server/page-context";
import { getProject } from "@/server/services/projects";
import { listTimeEntries } from "@/server/services/records";
import { Panel } from "@/components/ui/panel";
import { EmptyState, Stat, StatGrid } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { formatDate, formatHours } from "@/lib/format";

export default async function ProjectTimePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ctx = await pageContext();
  const [{ summary }, entries] = await load(() => Promise.all([getProject(ctx, projectId), listTimeEntries(ctx, projectId)]));
  const variance = summary.actualHours - summary.estimatedHours;
  const byUser = new Map<string, number>();
  for (const e of entries) byUser.set(e.user, (byUser.get(e.user) ?? 0) + e.hours);

  return (
    <div className="space-y-5">
      <StatGrid className="grid-cols-3">
        <Stat label="Estimated" value={formatHours(summary.estimatedHours)} />
        <Stat label="Actual" value={formatHours(summary.actualHours)} />
        <Stat label="Variance (total)" value={`${variance > 0 ? "+" : ""}${formatHours(variance)}`} tone={variance > 0 ? "bad" : "ok"} sub={variance > 0 ? "Actual effort exceeds the full estimate" : "Remaining budgeted effort"} />
      </StatGrid>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Panel title="Time entries" description="Log time from a task or the + Add menu">
          {entries.length === 0 ? (
            <EmptyState title="No time tracked yet." />
          ) : (
            <Table>
              <THead><TH>Date</TH><TH>Who</TH><TH className="hidden md:table-cell">Task</TH><TH className="hidden lg:table-cell">Phase</TH><TH className="text-right">Hours</TH></THead>
              <tbody>
                {entries.map((e) => (
                  <TR key={e.id}>
                    <TD className="tabular">{formatDate(e.date)}</TD>
                    <TD>{e.user}</TD>
                    <TD className="hidden max-w-80 truncate md:table-cell">{e.task ? <Link href={`/tasks/${e.task.id}`} className="hover:text-accent"><span className="font-mono text-2xs text-ink-4">{e.task.key}</span> {e.task.title}</Link> : <span className="text-ink-3">{e.description ?? "—"}</span>}</TD>
                    <TD className="hidden text-ink-3 lg:table-cell">{e.phase ?? "—"}</TD>
                    <TD className={cn("tabular text-right", e.running && "text-ok")}>{e.running ? "running" : formatHours(e.hours)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
        <div className="space-y-5">
          <Panel title="By phase">
            <ul className="divide-y divide-line text-[13px]">
              {summary.phases.map((p) => (
                <li key={p.id} className="flex justify-between gap-2 px-4 py-2">
                  <span className="truncate">{p.name}</span>
                  <span className={cn("tabular text-xs", p.estimatedHours > 0 && p.actualHours > p.estimatedHours ? "text-bad" : "text-ink-2")}>{formatHours(p.actualHours)} / {formatHours(p.estimatedHours)}</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="By person">
            <ul className="divide-y divide-line text-[13px]">
              {[...byUser.entries()].sort((a, b) => b[1] - a[1]).map(([u, h]) => (
                <li key={u} className="flex justify-between px-4 py-2"><span>{u}</span><span className="tabular text-ink-2">{formatHours(h)}</span></li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
