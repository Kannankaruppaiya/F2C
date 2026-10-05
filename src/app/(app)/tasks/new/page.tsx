import type { Metadata } from "next";
import { pageContext, load } from "@/server/page-context";
import { can, requirePermission } from "@/server/authz/context";
import { PageHeader } from "@/components/ui/panel";
import { TaskForm } from "@/features/tasks/task-form";
import { loadTaskFormOptions } from "@/features/tasks/form-options";

export const metadata: Metadata = { title: "New task" };

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ projectId?: string; phaseId?: string; featureId?: string }> }) {
  const ctx = await pageContext();
  const sp = await searchParams;
  const projectId = sp.projectId || null;
  const opts = await load(async () => {
    requirePermission(ctx, "task.create");
    return loadTaskFormOptions(ctx, projectId);
  });
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="New task" />
      <TaskForm key={projectId ?? "none"} taskId={null} projectId={projectId} opts={opts} canAssign={can(ctx, "task.assign")} selfId={ctx.userId} defaults={{ phaseId: sp.phaseId, featureId: sp.featureId }} />
    </div>
  );
}
