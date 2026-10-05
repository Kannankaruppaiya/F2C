"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/server/authz/context";
import { errorState, type ActionState } from "@/server/action-state";
import { cancelApproval, decideApproval } from "@/server/services/approvals";

export async function decideApprovalAction(approvalId: string, action: "approve" | "reject" | "request_changes", comment: string): Promise<ActionState> {
  try {
    await decideApproval(await getAuthContext(), approvalId, action, { comment });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return errorState(e);
  }
}

export async function cancelApprovalAction(approvalId: string): Promise<ActionState> {
  try {
    await cancelApproval(await getAuthContext(), approvalId);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return errorState(e);
  }
}
