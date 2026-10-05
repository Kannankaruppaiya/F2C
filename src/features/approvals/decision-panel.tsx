"use client";

import { useState } from "react";
import { Check, MessageSquareWarning, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cancelApprovalAction, decideApprovalAction } from "./actions";

type Action = "approve" | "reject" | "request_changes";

const COPY: Record<Action, { title: (t: string) => string; description: string; confirm: string; reason?: { label: string; required: boolean; placeholder: string }; tone: "primary" | "danger" }> = {
  approve: {
    title: (t) => `Approve ${t}?`,
    description: "Your approval is recorded against this exact version and cannot be changed afterwards.",
    confirm: "Approve",
    reason: { label: "Comment", required: false, placeholder: "Optional" },
    tone: "primary",
  },
  request_changes: {
    title: (t) => `Request changes to ${t}?`,
    description: "The team will revise the document and send a new version for approval.",
    confirm: "Request changes",
    reason: { label: "What should change?", required: true, placeholder: "e.g. Add Microsoft login to section 3" },
    tone: "primary",
  },
  reject: {
    title: (t) => `Reject ${t}?`,
    description: "Rejection is final for this version and is recorded in the audit history.",
    confirm: "Reject",
    reason: { label: "Reason for rejection", required: true, placeholder: "Explain why this version cannot be accepted" },
    tone: "danger",
  },
};

export function DecisionPanel({ approvalId, title }: { approvalId: string; title: string }) {
  const [action, setAction] = useState<Action | null>(null);
  const c = action ? COPY[action] : null;
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="primary" onClick={() => setAction("approve")}><Check className="size-3.5" /> Approve</Button>
      <Button onClick={() => setAction("request_changes")}><MessageSquareWarning className="size-3.5" /> Request changes</Button>
      <Button variant="danger" onClick={() => setAction("reject")}><X className="size-3.5" /> Reject</Button>
      {action && c && (
        <ConfirmDialog
          open
          onClose={() => setAction(null)}
          title={c.title(title)}
          description={c.description}
          confirmLabel={c.confirm}
          tone={c.tone}
          reason={c.reason}
          onConfirm={(text) => decideApprovalAction(approvalId, action, text)}
        />
      )}
    </div>
  );
}

export function CancelApprovalButton({ approvalId, title }: { approvalId: string; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>Cancel request</Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Cancel the approval request for ${title}?`}
        description="The client will no longer be able to respond. The cancelled request stays in the history."
        confirmLabel="Cancel request"
        tone="danger"
        onConfirm={() => cancelApprovalAction(approvalId)}
      />
    </>
  );
}
