import { apiHandler } from "@/server/api/handler";
import { globalSearch } from "@/server/services/search";

export const GET = apiHandler(({ ctx, query }) => globalSearch(ctx, query.get("q") ?? ""));
