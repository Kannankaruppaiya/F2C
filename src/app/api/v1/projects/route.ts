import { z } from "zod";
import { apiHandler, queryObject } from "@/server/api/handler";
import { createProject, listProjects } from "@/server/services/projects";
import { projectCreateSchema } from "@/server/validation/schemas";

export const GET = apiHandler(({ ctx, query }) => listProjects(ctx, queryObject(query)));

const createBody = z.object({ standardPhases: z.boolean().optional() }).passthrough();

export const POST = apiHandler(
  async ({ ctx, body }) => {
    const raw = await body(createBody);
    return createProject(ctx, projectCreateSchema.parse(raw), { standardPhases: raw.standardPhases });
  },
  { status: 201 },
);
