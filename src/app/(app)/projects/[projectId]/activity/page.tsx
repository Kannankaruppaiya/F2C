import { pageContext, load } from "@/server/page-context";
import { assertProjectAccess } from "@/server/services/projects";
import { listActivity } from "@/server/services/activity";
import { Panel } from "@/components/ui/panel";
import { ActivityFeed } from "@/features/activity/activity-feed";

export default async function ProjectActivityPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ctx = await pageContext();
  await load(() => assertProjectAccess(ctx, projectId));
  const items = await listActivity(ctx, { projectId, limit: 200 });
  return <Panel title="Audit log" description="Append-only record of every important action. Entries cannot be edited or deleted."><ActivityFeed items={items} showProject={false} /></Panel>;
}
