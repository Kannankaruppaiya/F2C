"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Dialog } from "./dialog";
import { Button } from "./button";
import { Field, FormError, Textarea } from "./field";
import type { ActionState } from "@/server/action-state";

/**
 * Confirmation for consequential actions (archive, approve, reject, cancel). When `reason` is set,
 * a text field is shown and — if required — must be filled before confirming.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  tone = "primary",
  reason,
  onConfirm,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  reason?: { label: string; required: boolean; placeholder?: string };
  onConfirm: (reason: string) => Promise<ActionState | void>;
  children?: ReactNode;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const blocked = !!reason?.required && !text.trim();

  return (
    <Dialog open={open} onClose={onClose} title={title} size="sm">
      <div className="space-y-4 p-5">
        {description && <div className="text-[13px] leading-relaxed text-ink-2">{description}</div>}
        {children}
        {reason && (
          <Field label={reason.label} htmlFor="confirm-reason" required={reason.required}>
            <Textarea id="confirm-reason" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={reason.placeholder} autoFocus />
          </Field>
        )}
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={pending}>Back</Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            disabled={pending || blocked}
            onClick={() =>
              startTransition(async () => {
                const r = await onConfirm(text.trim());
                if (r && !r.ok) setError(r.error ?? "Action failed");
                else {
                  setText("");
                  setError(null);
                  onClose();
                }
              })
            }
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
