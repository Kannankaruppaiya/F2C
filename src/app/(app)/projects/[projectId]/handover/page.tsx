import { CheckCircle2, Circle, MinusCircle } from "lucide-react";
import { pageContext, load } from "@/server/page-context";
import { listHandover } from "@/server/services/records";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { ProgressBar } from "@/components/ui/progress";
import { ReadOnlyNote } from "@/features/records/read-only-note";

export default async function ProjectHandoverPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ctx = await pageContext();
  const items = await load(() => listHandover(ctx, projectId));
  const required = items.filter((i) => i.isRequired);
  const requiredDone = required.filter((i) => i.status !== "PENDING").length;
  const ready = required.length > 0 && requiredDone === required.length;
  return (
    <Panel
      title="Handover checklist"
      description={ready ? "All required items complete — the project can be marked Completed." : `${requiredDone} of ${required.length} required items complete. The project cannot be marked Completed until all are done.`}
      actions={<ReadOnlyNote module="Checklist editing" phase="Phase 5" />}
    >
      {items.length === 0 ? (
        <EmptyState title="No handover checklist." />
      ) : (
        <>
          <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
            <ProgressBar value={required.length ? (requiredDone / required.length) * 100 : 0} tone={ready ? "ok" : "accent"} className="max-w-xs" />
            <span className="tabular text-xs text-ink-3">{requiredDone}/{required.length} required</span>
          </div>
          <ul className="divide-y divide-line">
            {items.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                {i.status === "COMPLETED" ? <CheckCircle2 className="size-4 text-ok" /> : i.status === "SKIPPED" ? <MinusCircle className="size-4 text-ink-4" /> : <Circle className="size-4 text-ink-4" />}
                <span className={i.status === "SKIPPED" ? "text-ink-3 line-through" : ""}>{i.name}</span>
                {i.isRequired && <Badge tone="neutral">Required</Badge>}
                <span className="ml-auto text-xs text-ink-4">{i.status === "PENDING" ? "Pending" : i.status === "SKIPPED" ? "Skipped" : "Completed"}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}
