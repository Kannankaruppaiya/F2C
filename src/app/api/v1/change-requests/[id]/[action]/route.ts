import { apiHandler } from "@/server/api/handler";
import { notFound } from "@/server/errors";
import { cancelChangeRequest, decideChangeRequest, getChangeRequest, transitionChangeRequest } from "@/server/services/change-requests";

/** POST /change-requests/:id/submit | send | withdraw | implement | approve | reject | cancel */
export const POST = apiHandler<{ id: string; action: string }>(async ({ ctx, params, req }) => {
  const input = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  switch (params.action) {
    case "submit":
    case "send":
    case "withdraw":
    case "implement":
      await transitionChangeRequest(ctx, params.id, params.action);
      break;
    case "approve":
    case "reject":
      await decideChangeRequest(ctx, params.id, params.action, input);
      break;
    case "cancel":
      await cancelChangeRequest(ctx, params.id, input as never);
      break;
    default:
      throw notFound("Action");
  }
  return getChangeRequest(ctx, params.id);
});
