"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/server/authz/context";
import { errorState, formObject, type ActionState } from "@/server/action-state";
import {
  cancelChangeRequest,
  createChangeRequest,
  createImplementationTasks,
  decideChangeRequest,
  transitionChangeRequest,
  updateChangeRequest,
} from "@/server/services/change-requests";

const refresh = () => revalidatePath("/", "layout");

export async function createChangeRequestAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    id = (await createChangeRequest(await getAuthContext(), formObject(fd) as never)).id;
  } catch (e) {
    return errorState(e, fd);
  }
  refresh();
  redirect(`/change-requests/${id}`);
}

export async function updateChangeRequestAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await updateChangeRequest(await getAuthContext(), id, formObject(fd));
    refresh();
    return { ok: true };
  } catch (e) {
    return errorState(e, fd);
  }
}

export async function transitionChangeRequestAction(id: string, action: "submit" | "send" | "withdraw" | "implement"): Promise<ActionState> {
  try {
    await transitionChangeRequest(await getAuthContext(), id, action);
    refresh();
    return { ok: true };
  } catch (e) {
    return errorState(e);
  }
}

export async function decideChangeRequestAction(id: string, decision: "approve" | "reject", input: { note: string; onBehalf: boolean }): Promise<ActionState> {
  try {
    await decideChangeRequest(await getAuthContext(), id, decision, input);
    refresh();
    return { ok: true };
  } catch (e) {
    return errorState(e);
  }
}

export async function cancelChangeRequestAction(id: string, reason: string): Promise<ActionState> {
  try {
    await cancelChangeRequest(await getAuthContext(), id, { reason });
    refresh();
    return { ok: true };
  } catch (e) {
    return errorState(e);
  }
}

export interface ImplementationTaskInput {
  title: string;
  phaseId: string;
  estimatedHours: number;
  assigneeId: string | null;
}

export async function createImplementationTasksAction(
  id: string,
  input: { feature: { name: string; phaseId: string } | null; tasks: ImplementationTaskInput[] },
): Promise<ActionState & { created?: number }> {
  try {
    const res = await createImplementationTasks(await getAuthContext(), id, input);
    refresh();
    return { ok: true, created: res.tasks.length };
  } catch (e) {
    return errorState(e);
  }
}
