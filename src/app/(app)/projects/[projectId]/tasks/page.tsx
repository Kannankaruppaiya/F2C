import { pageContext, load } from "@/server/page-context";
import { assertProjectAccess } from "@/server/services/projects";
import { TaskListView } from "@/features/tasks/task-list-view";
import { flatParams, type SearchParams } from "@/lib/url";

export default async function ProjectTasksPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<SearchParams> }) {
  const [{ projectId }, sp] = await Promise.all([params, searchParams]);
  const ctx = await pageContext();
  await load(() => assertProjectAccess(ctx, projectId));
  return <TaskListView ctx={ctx} base={`/projects/${projectId}/tasks`} params={flatParams(sp)} projectId={projectId} />;
}
