import { apiHandler } from "@/server/api/handler";
import { deleteTask, getTask, updateTask } from "@/server/services/tasks";
import { taskUpdateSchema } from "@/server/validation/schemas";

export const GET = apiHandler<{ id: string }>(({ ctx, params }) => getTask(ctx, params.id));
export const PATCH = apiHandler<{ id: string }>(async ({ ctx, params, body }) => updateTask(ctx, params.id, await body(taskUpdateSchema)));
export const DELETE = apiHandler<{ id: string }>(async ({ ctx, params }) => {
  await deleteTask(ctx, params.id);
});
