"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Priority, TaskStatus } from "@prisma/client";
import { getAuthContext } from "@/server/authz/context";
import { errorState, formObject, type ActionState } from "@/server/action-state";
import { addComment, addSubtask, createTask, deleteSubtask, deleteTask, logTime, startTimer, stopTimer, toggleSubtask, updateTask } from "@/server/services/tasks";

function refresh(taskId?: string) {
  revalidatePath("/", "layout");
  if (taskId) revalidatePath(`/tasks/${taskId}`);
}

/** Create/edit from the full task form. `returnTo` lets project tabs keep the user in context. */
export async function saveTaskAction(taskId: string | null, returnTo: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  let id = taskId;
  try {
    const ctx = await getAuthContext();
    const input = formObject(fd, ["dependsOnIds"]);
    if (id) {
      delete input.projectId;
      await updateTask(ctx, id, input);
    } else {
      id = (await createTask(ctx, input as never)).id;
    }
  } catch (e) {
    return errorState(e, fd);
  }
  refresh(id);
  if (returnTo === "stay") return { ok: true };
  redirect(returnTo || `/tasks/${id}`);
}

export async function setTaskStatusAction(taskId: string, status: TaskStatus): Promise<ActionState> {
  try {
    const ctx = await getAuthContext();
    await updateTask(ctx, taskId, { status });
    refresh(taskId);
    return { ok: true };
  } catch (e) {
    return errorState(e);
  }
}

export async function setTaskFieldAction(taskId: string, field: "priority" | "assigneeId", value: string): Promise<ActionState> {
  try {
    const ctx = await getAuthContext();
    await updateTask(ctx, taskId, field === "priority" ? { priority: value as Priority } : { assigneeId: value || null });
    refresh(taskId);
    return { ok: true };
  } catch (e) {
    return errorState(e);
  }
}

export async function deleteTaskAction(taskId: string): Promise<ActionState> {
  let projectId: string;
  try {
    const ctx = await getAuthContext();
    projectId = await deleteTask(ctx, taskId);
  } catch (e) {
    return errorState(e);
  }
  refresh();
  redirect(`/projects/${projectId}/tasks`);
}

export async function addSubtaskAction(taskId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await getAuthContext();
    await addSubtask(ctx, taskId, formObject(fd) as never);
    refresh(taskId);
    return { ok: true };
  } catch (e) {
    return errorState(e, fd);
  }
}

export async function toggleSubtaskAction(subtaskId: string): Promise<void> {
  const ctx = await getAuthContext();
  refresh(await toggleSubtask(ctx, subtaskId));
}

export async function deleteSubtaskAction(subtaskId: string): Promise<void> {
  const ctx = await getAuthContext();
  refresh(await deleteSubtask(ctx, subtaskId));
}

export async function addCommentAction(taskId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await getAuthContext();
    await addComment(ctx, taskId, formObject(fd) as never);
    refresh(taskId);
    return { ok: true };
  } catch (e) {
    return errorState(e, fd);
  }
}

export async function startTimerAction(taskId: string): Promise<ActionState> {
  try {
    const ctx = await getAuthContext();
    await startTimer(ctx, taskId);
    refresh(taskId);
    return { ok: true };
  } catch (e) {
    return errorState(e);
  }
}

export async function stopTaskTimerAction(taskId: string): Promise<void> {
  const ctx = await getAuthContext();
  await stopTimer(ctx);
  refresh(taskId);
}

export async function logTaskTimeAction(taskId: string, projectId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await getAuthContext();
    await logTime(ctx, { ...(formObject(fd) as object), taskId, projectId } as never);
    refresh(taskId);
    return { ok: true };
  } catch (e) {
    return errorState(e, fd);
  }
}
