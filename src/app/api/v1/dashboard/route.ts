import { apiHandler } from "@/server/api/handler";
import { getDashboard } from "@/server/services/dashboard";

export const GET = apiHandler(({ ctx }) => getDashboard(ctx));
