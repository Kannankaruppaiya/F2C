import { apiHandler } from "@/server/api/handler";
import { createPhase, listPhases } from "@/server/services/phases";
import { phaseCreateSchema } from "@/server/validation/schemas";

export const GET = apiHandler<{ id: string }>(({ ctx, params }) => listPhases(ctx, params.id));
export const POST = apiHandler<{ id: string }>(async ({ ctx, params, body }) => createPhase(ctx, params.id, await body(phaseCreateSchema)), { status: 201 });
