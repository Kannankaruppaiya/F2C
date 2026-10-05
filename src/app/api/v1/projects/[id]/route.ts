import { apiHandler } from "@/server/api/handler";
import { deleteProject, getProject, updateProject } from "@/server/services/projects";
import { projectUpdateSchema } from "@/server/validation/schemas";

export const GET = apiHandler<{ id: string }>(({ ctx, params }) => getProject(ctx, params.id));
export const PATCH = apiHandler<{ id: string }>(async ({ ctx, params, body }) => updateProject(ctx, params.id, await body(projectUpdateSchema)));
export const DELETE = apiHandler<{ id: string }>(({ ctx, params }) => deleteProject(ctx, params.id));
