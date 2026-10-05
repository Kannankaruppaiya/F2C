import { apiHandler, queryObject } from "@/server/api/handler";
import { assertProjectAccess } from "@/server/services/projects";
import { createTask, listTasks } from "@/server/services/tasks";
import { taskCreateSchema } from "@/server/validation/schemas";

export const GET = apiHandler<{ id: string }>(async ({ ctx, params, query }) => {
  await assertProjectAccess(ctx, params.id);
  return listTasks(ctx, { ...queryObject(query), projectId: params.id });
});

export const POST = apiHandler<{ id: string }>(
  async ({ ctx, params, body }) => {
    const input = await body(taskCreateSchema.omit({ projectId: true }));
    return createTask(ctx, { ...input, projectId: params.id });
  },
  { status: 201 },
);
