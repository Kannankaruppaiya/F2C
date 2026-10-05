"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/server/authz/context";
import { errorState, formObject, type ActionState } from "@/server/action-state";
import { markNotificationsRead } from "@/server/services/notifications";
import { logTime, stopTimer } from "@/server/services/tasks";

export async function markAllNotificationsReadAction(): Promise<void> {
  const ctx = await getAuthContext();
  await markNotificationsRead(ctx);
  revalidatePath("/", "layout");
}

export async function markNotificationReadAction(id: string): Promise<void> {
  const ctx = await getAuthContext();
  await markNotificationsRead(ctx, [id]);
  revalidatePath("/", "layout");
}

export async function stopTimerAction(): Promise<void> {
  const ctx = await getAuthContext();
  await stopTimer(ctx);
  revalidatePath("/", "layout");
}

export async function logTimeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await getAuthContext();
    await logTime(ctx, formObject(fd) as never);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return errorState(e, fd);
  }
}
