import { apiHandler } from "@/server/api/handler";
import { createImplementationTasks } from "@/server/services/change-requests";
import { implementationTasksSchema } from "@/server/validation/schemas";

export const POST = apiHandler<{ id: string }>(async ({ ctx, params, body }) => createImplementationTasks(ctx, params.id, await body(implementationTasksSchema)), { status: 201 });
