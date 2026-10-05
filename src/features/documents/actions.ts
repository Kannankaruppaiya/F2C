"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/server/authz/context";
import { errorState, formObject, type ActionState } from "@/server/action-state";
import { archiveDocument, restoreDocument, shareVersion, updateDocument } from "@/server/services/documents";
import { listApprovers, requestApproval } from "@/server/services/approvals";

const refresh = (documentId: string) => {
  revalidatePath(`/documents/${documentId}`);
  revalidatePath("/documents");
  revalidatePath("/", "layout");
};

export async function archiveDocumentAction(documentId: string): Promise<ActionState> {
  try {
    await archiveDocument(await getAuthContext(), documentId);
    refresh(documentId);
    return { ok: true };
  } catch (e) {
    return errorState(e);
  }
}

export async function restoreDocumentAction(documentId: string): Promise<ActionState> {
  try {
    await restoreDocument(await getAuthContext(), documentId);
    refresh(documentId);
    return { ok: true };
  } catch (e) {
    return errorState(e);
  }
}

export async function shareVersionAction(documentId: string, versionId: string): Promise<ActionState> {
  try {
    await shareVersion(await getAuthContext(), documentId, versionId);
    refresh(documentId);
    return { ok: true };
  } catch (e) {
    return errorState(e);
  }
}

export async function updateDocumentAction(documentId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await updateDocument(await getAuthContext(), documentId, formObject(fd));
    refresh(documentId);
    return { ok: true };
  } catch (e) {
    return errorState(e, fd);
  }
}

export async function requestApprovalAction(documentId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requestApproval(await getAuthContext(), { ...(formObject(fd) as object), documentId } as never);
    refresh(documentId);
    revalidatePath("/approvals");
    return { ok: true };
  } catch (e) {
    return errorState(e, fd);
  }
}

export async function loadApproversAction(projectId: string): Promise<{ id: string; name: string; email: string }[]> {
  return listApprovers(await getAuthContext(), projectId);
}
