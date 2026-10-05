import Link from "@/components/ui/link";
import { timeAgo, formatDateTime } from "@/lib/format";
import type { ActivityItem } from "@/server/services/activity";
import { EmptyState } from "@/components/ui/misc";

const ACTION_TONE: Record<string, string> = {
  approved: "bg-ok",
  completed: "bg-ok",
  paid: "bg-ok",
  recorded: "bg-ok",
  created: "bg-info",
  deleted: "bg-bad",
  failed: "bg-bad",
};

function tone(action: string) {
  const verb = action.split(".").pop() ?? "";
  return ACTION_TONE[verb] ?? "bg-ink-4";
}

export function ActivityFeed({ items, showProject = true, empty = "No activity recorded yet." }: { items: ActivityItem[]; showProject?: boolean; empty?: string }) {
  if (items.length === 0) return <EmptyState title={empty} className="py-8" />;
  return (
    <ol className="divide-y divide-line">
      {items.map((a) => (
        <li key={a.id} className="flex gap-3 px-4 py-2.5">
          <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${tone(a.action)}`} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-ink">{a.summary}</p>
            <p className="mt-0.5 truncate text-2xs text-ink-4">
              {a.actorName ?? "System"}
              {showProject && a.projectName && a.projectId && (
                <>
                  {" · "}
                  <Link href={`/projects/${a.projectId}`} className="hover:text-accent">{a.projectName}</Link>
                </>
              )}
              {" · "}
              <time dateTime={a.createdAt} title={formatDateTime(a.createdAt)}>{timeAgo(a.createdAt)}</time>
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
