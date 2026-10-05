"use client";

import { useState, useTransition } from "react";
import { Check, ListPlus, Plus, Send, Trash2, Undo2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Select } from "@/components/ui/field";
import { formatHours, formatMoney, type MoneyFormat } from "@/lib/format";
import type { ChangeRequestAction } from "@/server/domain/change-requests";
import {
  cancelChangeRequestAction,
  createImplementationTasksAction,
  decideChangeRequestAction,
  transitionChangeRequestAction,
  type ImplementationTaskInput,
} from "./actions";

type Dialogs = ChangeRequestAction | null;

export function ChangeRequestActions({
  id,
  crKey,
  title,
  actions,
  isClient,
  sendProblems,
  cost,
  hours,
  fmt,
}: {
  id: string;
  crKey: string;
  title: string;
  actions: ChangeRequestAction[];
  isClient: boolean;
  sendProblems: string[];
  cost: number;
  hours: number;
  fmt: MoneyFormat;
}) {
  const [open, setOpen] = useState<Dialogs>(null);
  const [onBehalf, setOnBehalf] = useState(false);
  const has = (a: ChangeRequestAction) => actions.includes(a);
  const quote = `${formatHours(hours)} · ${formatMoney(cost, fmt)}`;
  const close = () => {
    setOpen(null);
    setOnBehalf(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {has("submit") && <Button onClick={() => setOpen("submit")}>Submit for review</Button>}
      {has("send") && (
        <Button variant="primary" onClick={() => setOpen("send")} disabled={sendProblems.length > 0} title={sendProblems.length ? `Before sending: ${sendProblems.join(", ")}` : undefined}>
          <Send className="size-3.5" /> Send to client
        </Button>
      )}
      {has("withdraw") && <Button onClick={() => setOpen("withdraw")}><Undo2 className="size-3.5" /> Withdraw for revision</Button>}
      {has("approve") && <Button variant="primary" onClick={() => setOpen("approve")}><Check className="size-3.5" /> {isClient ? "Approve" : "Record approval"}</Button>}
      {has("reject") && <Button variant="danger" onClick={() => setOpen("reject")}><X className="size-3.5" /> {isClient ? "Reject" : "Record rejection"}</Button>}
      {has("implement") && <Button onClick={() => setOpen("implement")}><Check className="size-3.5" /> Mark implemented</Button>}
      {has("cancel") && <Button variant="ghost" onClick={() => setOpen("cancel")}><Trash2 className="size-3.5" /> Cancel CR</Button>}

      <ConfirmDialog open={open === "submit"} onClose={close} title={`Submit ${crKey} for internal review?`} confirmLabel="Submit" onConfirm={() => transitionChangeRequestAction(id, "submit")} />
      <ConfirmDialog
        open={open === "send"}
        onClose={close}
        title={`Send ${crKey} to the client?`}
        description={<>The client will be asked to approve <strong>{title}</strong> for <strong>{quote}</strong>. The estimate is locked while the client reviews it.</>}
        confirmLabel="Send to client"
        onConfirm={() => transitionChangeRequestAction(id, "send")}
      />
      <ConfirmDialog open={open === "withdraw"} onClose={close} title={`Withdraw ${crKey}?`} description="It returns to internal review so the estimate can be revised. The client is notified." confirmLabel="Withdraw" onConfirm={() => transitionChangeRequestAction(id, "withdraw")} />
      <ConfirmDialog open={open === "implement"} onClose={close} title={`Mark ${crKey} as implemented?`} description="All implementation tasks must be done." confirmLabel="Mark implemented" onConfirm={() => transitionChangeRequestAction(id, "implement")} />
      <ConfirmDialog
        open={open === "cancel"}
        onClose={close}
        title={`Cancel ${crKey}?`}
        description="Cancelled change requests are kept in the history and cannot be reopened."
        confirmLabel="Cancel change request"
        tone="danger"
        reason={{ label: "Reason", required: true, placeholder: "e.g. Duplicate of CR-012" }}
        onConfirm={(reason) => cancelChangeRequestAction(id, reason)}
      />
      {(open === "approve" || open === "reject") && (
        <ConfirmDialog
          open
          onClose={close}
          title={isClient ? `${open === "approve" ? "Approve" : "Reject"} ${crKey}?` : `Record the client's ${open === "approve" ? "approval" : "rejection"} of ${crKey}`}
          description={
            open === "approve" ? (
              <>Approving adds <strong>{title}</strong> to the project scope for <strong>{quote}</strong>.</>
            ) : (
              <>The request and your reason are kept on record.</>
            )
          }
          confirmLabel={open === "approve" ? (isClient ? "Approve change" : "Record approval") : isClient ? "Reject change" : "Record rejection"}
          tone={open === "reject" ? "danger" : "primary"}
          reason={{
            label: isClient ? (open === "approve" ? "Comment" : "Reason for rejection") : "How did the client communicate this?",
            required: !isClient || open === "reject",
            placeholder: isClient ? undefined : "e.g. Approved by email from Fatima on 3 Oct",
          }}
          onConfirm={async (note) => {
            if (!isClient && !onBehalf) return { ok: false, error: "Confirm that you are recording the client's decision on their behalf." };
            return decideChangeRequestAction(id, open, { note, onBehalf: !isClient });
          }}
        >
          {!isClient && (
            <label className="flex items-start gap-2 rounded-md border border-warn/30 bg-warn-soft p-3 text-[13px]">
              <input type="checkbox" checked={onBehalf} onChange={(e) => setOnBehalf(e.target.checked)} className="mt-0.5 accent-accent" />
              <span>The client made this decision outside the app and I am recording it on their behalf. This is noted in the audit log.</span>
            </label>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}

interface Row extends ImplementationTaskInput {
  key: number;
}

export function ImplementationTasksDialog({
  id,
  crKey,
  title,
  estimatedHours,
  phases,
  team,
}: {
  id: string;
  crKey: string;
  title: string;
  estimatedHours: number;
  phases: { id: string; name: string }[];
  team: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [withFeature, setWithFeature] = useState(true);
  const [featureName, setFeatureName] = useState(title);
  const [featurePhase, setFeaturePhase] = useState(phases[0]?.id ?? "");
  const [rows, setRows] = useState<Row[]>([{ key: 1, title, phaseId: phases[0]?.id ?? "", estimatedHours, assigneeId: null }]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const total = rows.reduce((s, r) => s + (Number(r.estimatedHours) || 0), 0);
  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}><ListPlus className="size-3.5" /> Create implementation tasks</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Create implementation tasks for ${crKey}`} description="Review and edit the tasks below. Nothing is created until you confirm. Every task will reference this change request." size="lg">
        <div className="space-y-4 p-5">
          <FormError message={error} />
          <label className="flex items-start gap-2 text-[13px]">
            <input type="checkbox" checked={withFeature} onChange={(e) => setWithFeature(e.target.checked)} className="mt-0.5 accent-accent" />
            <span>
              Add a feature for this change
              <span className="block text-xs text-ink-3">The feature counts toward “Approved changes” in the project scope.</span>
            </span>
          </label>
          {withFeature && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Feature name" htmlFor="it-feature"><Input id="it-feature" value={featureName} onChange={(e) => setFeatureName(e.target.value)} /></Field>
              <Field label="Phase" htmlFor="it-feature-phase">
                <Select id="it-feature-phase" value={featurePhase} onChange={(e) => setFeaturePhase(e.target.value)}>
                  {phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </Field>
            </div>
          )}
          <div className="rounded-md border border-line">
            <div className="grid grid-cols-[1fr_8rem_5rem_9rem_2rem] gap-2 border-b border-line bg-subtle px-3 py-1.5 text-2xs font-medium uppercase tracking-wide text-ink-3">
              <span>Task</span><span>Phase</span><span>Hours</span><span>Assignee</span><span />
            </div>
            {rows.map((r, i) => (
              <div key={r.key} className="grid grid-cols-[1fr_8rem_5rem_9rem_2rem] items-center gap-2 border-b border-line px-3 py-1.5 last:border-0">
                <Input aria-label={`Task ${i + 1} title`} value={r.title} onChange={(e) => update(r.key, { title: e.target.value })} className="h-8" />
                <Select aria-label={`Task ${i + 1} phase`} value={withFeature ? featurePhase : r.phaseId} disabled={withFeature} onChange={(e) => update(r.key, { phaseId: e.target.value })} className="h-8">
                  {phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
                <Input aria-label={`Task ${i + 1} hours`} type="number" min="0" step="0.5" value={r.estimatedHours} onChange={(e) => update(r.key, { estimatedHours: Number(e.target.value) })} className="h-8" />
                <Select aria-label={`Task ${i + 1} assignee`} value={r.assigneeId ?? ""} onChange={(e) => update(r.key, { assigneeId: e.target.value || null })} className="h-8">
                  <option value="">Unassigned</option>
                  {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
                <button type="button" aria-label={`Remove task ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="rounded p-1 text-ink-4 hover:text-bad disabled:opacity-30">
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs">
            <Button size="xs" variant="ghost" onClick={() => setRows((rs) => [...rs, { key: Math.max(...rs.map((x) => x.key)) + 1, title: "", phaseId: withFeature ? featurePhase : (phases[0]?.id ?? ""), estimatedHours: 0, assigneeId: null }])}>
              <Plus className="size-3.5" /> Add task
            </Button>
            <span className={total > estimatedHours ? "text-bad" : "text-ink-3"}>
              {formatHours(total)} planned of {formatHours(estimatedHours)} approved{total > estimatedHours ? " — exceeds the approved estimate" : ""}
            </span>
          </div>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button
              variant="primary"
              disabled={pending || rows.some((r) => !r.title.trim())}
              onClick={() =>
                startTransition(async () => {
                  const res = await createImplementationTasksAction(id, {
                    feature: withFeature ? { name: featureName, phaseId: featurePhase } : null,
                    tasks: rows.map((r) => ({ title: r.title, phaseId: withFeature ? featurePhase : r.phaseId, estimatedHours: Number(r.estimatedHours) || 0, assigneeId: r.assigneeId })),
                  });
                  if (!res.ok) setError(res.error ?? "Could not create tasks");
                  else {
                    setOpen(false);
                    router.refresh();
                  }
                })
              }
            >
              {pending ? "Creating…" : `Create ${rows.length} task${rows.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
