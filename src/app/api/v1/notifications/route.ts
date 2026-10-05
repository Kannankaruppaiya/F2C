import { apiHandler } from "@/server/api/handler";
import { listNotifications } from "@/server/services/notifications";

export const GET = apiHandler(({ ctx }) => listNotifications(ctx, 50));
