import type { Metadata } from "next";
import { pageContext } from "@/server/page-context";
import { PageHeader } from "@/components/ui/panel";
import { TaskListView } from "@/features/tasks/task-list-view";
import { flatParams, type SearchParams } from "@/lib/url";

export const metadata: Metadata = { title: "Tasks" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await pageContext();
  const params = flatParams(await searchParams);
  return (
    <>
      <PageHeader title="Tasks" description="All open work across your projects, most urgent first." />
      <TaskListView ctx={ctx} base="/tasks" params={params} />
    </>
  );
}
