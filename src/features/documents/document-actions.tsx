"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Archive, ArchiveRestore, Send, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import type { ActionState } from "@/server/action-state";
import { archiveDocumentAction, loadApproversAction, requestApprovalAction, restoreDocumentAction, shareVersionAction } from "./actions";

export function ArchiveButton({ documentId, name, archived }: { documentId: string; name: string; archived: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={archived ? "secondary" : "danger"} onClick={() => setOpen(true)}>
        {archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />} {archived ? "Restore" : "Archive"}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={archived ? `Restore ${name}?` : `Archive ${name}?`}
        description={archived ? "The document returns to the active list with its full version history." : "Archived documents are hidden from lists and from the client. Versions and approval history are kept and can be restored."}
        confirmLabel={archived ? "Restore" : "Archive document"}
        tone={archived ? "primary" : "danger"}
        onConfirm={() => (archived ? restoreDocumentAction(documentId) : archiveDocumentAction(documentId))}
      />
    </>
  );
}

export function ShareVersionButton({ documentId, versionId, label }: { documentId: string; versionId: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-accent hover:bg-accent-soft">
        <Share2 className="size-3" /> Share
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Share ${label} with the client?`}
        description="The client will be able to view and download this exact version and will be notified. Sharing can't be undone."
        confirmLabel="Share with client"
        onConfirm={() => shareVersionAction(documentId, versionId)}
      />
    </>
  );
}

export function RequestApprovalButton({ documentId, projectId, label, today }: { documentId: string; projectId: string; label: string; today: string }) {
  const [open, setOpen] = useState(false);
  const [approvers, setApprovers] = useState<{ id: string; name: string; email: string }[] | null>(null);
  const [state, action, pending] = useActionState(requestApprovalAction.bind(null, documentId), { ok: false } as ActionState);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (open && approvers === null) startTransition(async () => setApprovers(await loadApproversAction(projectId)));
  }, [open, approvers, projectId]);
  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);
  const fe = state.fieldErrors ?? {};

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Send className="size-3.5" /> Request approval
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Request approval for ${label}`} description="The approval is tied to this exact version. Uploading a newer version later will not change it." size="sm">
        <form action={action} className="space-y-4 p-5">
          <FormError message={state.ok ? null : state.error} />
          <Field label="Approver" htmlFor="ap-approver" error={fe.approverId} required hint={approvers?.length === 0 ? "This client has no portal users yet. Invite one from Settings → Team." : "Client users of this project's client"}>
            <Select id="ap-approver" name="approverId" disabled={!approvers?.length}>
              {approvers === null && <option>Loading…</option>}
              {approvers?.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.email})</option>)}
            </Select>
          </Field>
          <Field label="Due date" htmlFor="ap-due" error={fe.dueDate} hint="Optional">
            <Input id="ap-due" name="dueDate" type="date" min={today} />
          </Field>
          <Field label="Message" htmlFor="ap-msg" error={fe.message} hint="Optional — shown to the approver">
            <Textarea id="ap-msg" name="message" rows={3} placeholder="Please review the updated scope, especially section 4." />
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending || !approvers?.length}>{pending ? "Sending…" : "Send approval request"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
