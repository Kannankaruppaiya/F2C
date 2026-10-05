import type { Metadata } from "next";
import { pageContext, load } from "@/server/page-context";
import { can, requirePermission } from "@/server/authz/context";
import { getTask } from "@/server/services/tasks";
import { PageHeader } from "@/components/ui/panel";
import { TaskForm } from "@/features/tasks/task-form";
import { loadTaskFormOptions } from "@/features/tasks/form-options";

export const metadata: Metadata = { title: "Edit task" };

export default async function EditTaskPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const ctx = await pageContext();
  const task = await load(async () => {
    requirePermission(ctx, "task.edit");
    return getTask(ctx, taskId);
  });
  const opts = await loadTaskFormOptions(ctx, task.project.id, task.id);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={`Edit ${task.key}`} description={task.title} />
      <TaskForm
        taskId={task.id}
        projectId={task.project.id}
        opts={opts}
        canAssign={can(ctx, "task.assign")}
        selfId={ctx.userId}
        initial={{
          title: task.title,
          description: task.description,
          acceptanceCriteria: task.acceptanceCriteria,
          phaseId: task.phase.id,
          featureId: task.feature?.id ?? null,
          assigneeId: task.assignee?.id ?? null,
          priority: task.priority,
          status: task.status,
          dueDate: task.dueDate,
          estimatedHours: task.estimatedHours,
          blockedReason: task.blockedReason,
          dependsOnIds: task.dependsOn.map((d) => d.id),
        }}
      />
    </div>
  );
}
