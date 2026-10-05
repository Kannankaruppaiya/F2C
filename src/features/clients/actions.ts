"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/server/authz/context";
import { errorState, formObject, type ActionState } from "@/server/action-state";
import { addContact, createClient, deleteClient, removeContact, updateClient } from "@/server/services/clients";

export async function saveClientAction(clientId: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  let id = clientId;
  try {
    const ctx = await getAuthContext();
    const input = formObject(fd);
    if (id) await updateClient(ctx, id, input);
    else id = (await createClient(ctx, input as never)).id;
  } catch (e) {
    return errorState(e, fd);
  }
  revalidatePath("/clients");
  redirect(`/clients/${id}`);
}

export async function addContactAction(clientId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await getAuthContext();
    await addContact(ctx, clientId, formObject(fd) as never);
    revalidatePath(`/clients/${clientId}`);
    return { ok: true };
  } catch (e) {
    return errorState(e, fd);
  }
}

export async function removeContactAction(contactId: string): Promise<void> {
  const ctx = await getAuthContext();
  const clientId = await removeContact(ctx, contactId);
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteClientAction(clientId: string, _prev: ActionState): Promise<ActionState> {
  try {
    const ctx = await getAuthContext();
    await deleteClient(ctx, clientId);
  } catch (e) {
    return errorState(e);
  }
  revalidatePath("/clients");
  redirect("/clients");
}
