"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ProjectStatus } from "@prisma/client";
import { getAuthContext } from "@/server/authz/context";
import { errorState, formObject, type ActionState } from "@/server/action-state";
import { createProject, deleteProject, updateProject } from "@/server/services/projects";
import { createPhase, deletePhase, movePhase, updatePhase } from "@/server/services/phases";
import { createFeature, deleteFeature, toggleCriterion, updateFeature } from "@/server/services/features";

const projectPath = (id: string) => `/projects/${id}`;

export async function saveProjectAction(projectId: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  let id = projectId;
  try {
    const ctx = await getAuthContext();
    const input = formObject(fd, ["memberIds"]);
    if (id) {
      // Editing never touches status here (status changes go through the transition control).
      delete input.status;
      delete input.standardPhases;
      await updateProject(ctx, id, input);
    } else {
      const standardPhases = input.standardPhases === "on";
      delete input.standardPhases;
      id = (await createProject(ctx, input as never, { standardPhases })).id;
    }
  } catch (e) {
    return errorState(e, fd);
  }
  revalidatePath("/projects");
  redirect(projectPath(id));
}

export async function changeProjectStatusAction(projectId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await getAuthContext();
    await updateProject(ctx, projectId, { status: String(fd.get("status")) as ProjectStatus });
    revalidatePath(projectPath(projectId), "layout");
    return { ok: true };
  } catch (e) {
    return errorState(e);
  }
}

export async function deleteProjectAction(projectId: string): Promise<ActionState> {
  try {
    const ctx = await getAuthContext();
    await deleteProject(ctx, projectId);
  } catch (e) {
    return errorState(e);
  }
  revalidatePath("/projects");
  redirect("/projects");
}

// ─── Phases ───

export async function savePhaseAction(projectId: string, phaseId: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await getAuthContext();
    const input = formObject(fd, ["dependsOnIds"]);
    if (phaseId) await updatePhase(ctx, phaseId, input);
    else await createPhase(ctx, projectId, input as never);
    revalidatePath(projectPath(projectId), "layout");
    return { ok: true };
  } catch (e) {
    return errorState(e, fd);
  }
}

export async function setPhaseStatusAction(projectId: string, phaseId: string, status: string): Promise<ActionState> {
  try {
    const ctx = await getAuthContext();
    await updatePhase(ctx, phaseId, { status: status as never });
    revalidatePath(projectPath(projectId), "layout");
    return { ok: true };
  } catch (e) {
    return errorState(e);
  }
}

export async function movePhaseAction(projectId: string, phaseId: string, direction: "up" | "down"): Promise<void> {
  const ctx = await getAuthContext();
  await movePhase(ctx, phaseId, direction);
  revalidatePath(projectPath(projectId), "layout");
}

export async function deletePhaseAction(projectId: string, phaseId: string): Promise<ActionState> {
  try {
    const ctx = await getAuthContext();
    await deletePhase(ctx, phaseId);
    revalidatePath(projectPath(projectId), "layout");
    return { ok: true };
  } catch (e) {
    return errorState(e);
  }
}

// ─── Features ───

export async function saveFeatureAction(projectId: string, featureId: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await getAuthContext();
    const input = formObject(fd, ["dependsOnIds"]);
    input.acceptanceCriteria = String(fd.get("acceptanceCriteria") ?? "")
      .split("\n")
      .map((l) => l.replace(/^[-*•]\s*/, "").trim())
      .filter(Boolean);
    if (featureId) await updateFeature(ctx, featureId, input);
    else await createFeature(ctx, projectId, input as never);
    revalidatePath(projectPath(projectId), "layout");
    return { ok: true };
  } catch (e) {
    return errorState(e, fd);
  }
}

export async function setFeatureStatusAction(projectId: string, featureId: string, status: string): Promise<ActionState> {
  try {
    const ctx = await getAuthContext();
    await updateFeature(ctx, featureId, { status: status as never });
    revalidatePath(projectPath(projectId), "layout");
    return { ok: true };
  } catch (e) {
    return errorState(e);
  }
}

export async function toggleCriterionAction(criterionId: string): Promise<void> {
  const ctx = await getAuthContext();
  const projectId = await toggleCriterion(ctx, criterionId);
  revalidatePath(projectPath(projectId), "layout");
}

export async function deleteFeatureAction(featureId: string): Promise<ActionState> {
  try {
    const ctx = await getAuthContext();
    const projectId = await deleteFeature(ctx, featureId);
    revalidatePath(projectPath(projectId), "layout");
    return { ok: true };
  } catch (e) {
    return errorState(e);
  }
}
