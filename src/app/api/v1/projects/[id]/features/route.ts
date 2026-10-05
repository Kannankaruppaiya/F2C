import { apiHandler } from "@/server/api/handler";
import { createFeature, listFeatures } from "@/server/services/features";
import { featureCreateSchema } from "@/server/validation/schemas";

export const GET = apiHandler<{ id: string }>(({ ctx, params, query }) => listFeatures(ctx, params.id, { phaseId: query.get("phaseId") ?? undefined }));
export const POST = apiHandler<{ id: string }>(async ({ ctx, params, body }) => createFeature(ctx, params.id, await body(featureCreateSchema)), { status: 201 });
