"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "@/components/ui/link";
import { CheckSquare, Pencil, Plus, Square, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/misc";
import { ProgressBar } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { formatHours } from "@/lib/format";
import { FEATURE_STATUS, PRIORITY, options } from "@/lib/status";
import type { ActionState } from "@/server/action-state";
import type { FeatureRow } from "@/server/services/features";
import { deleteFeatureAction, saveFeatureAction, setFeatureStatusAction, toggleCriterionAction } from "./actions";

export function FeatureManager({
  projectId,
  features,
  phases,
  canEdit,
  canVerify,
  openNew,
  changeRequests = [],
}: {
  /** Approved change requests a feature can be attributed to. */
  changeRequests?: { id: string; key: string; title: string }[];
  projectId: string;
  features: FeatureRow[];
  phases: { id: string; name: string }[];
  canEdit: boolean;
  canVerify: boolean;
  openNew: boolean;
}) {
  const [editing, setEditing] = useState<FeatureRow | "new" | null>(openNew && canEdit ? "new" : null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<ActionState | void>) =>
    startTransition(async () => {
      const r = await fn();
      setError(r && !r.ok ? (r.error ?? "Action failed") : null);
    });
  const nameOf = new Map(features.map((f) => [f.id, f.name]));
  const groups = phases.map((p) => ({ phase: p, items: features.filter((f) => f.phase.id === p.id) })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      {error && <FormError message={error} />}
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-ink-3">
          {features.length} features · {features.filter((f) => f.status === "COMPLETED").length} completed · {features.filter((f) => !["COMPLETED", "REJECTED"].includes(f.status)).length} pending
        </p>
        {canEdit && phases.length > 0 && <Button variant="primary" onClick={() => setEditing("new")}><Plus className="size-3.5" /> Add feature</Button>}
      </div>

      {phases.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface">
          <EmptyState title="Add a phase first." description="Features belong to a phase (Project → Phase → Feature → Task)." action={<Link className="text-[13px] text-accent hover:underline" href={`/projects/${projectId}/phases`}>Go to phases</Link>} />
        </div>
      ) : features.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface">
          <EmptyState title="No features yet." description="Features describe what the client gets, with acceptance criteria QA can verify." action={canEdit && <Button variant="primary" onClick={() => setEditing("new")}>Add first feature</Button>} />
        </div>
      ) : (
        groups.map(({ phase, items }) => (
          <section key={phase.id} className={cn("rounded-lg border border-line bg-surface", pending && "opacity-70")}>
            <header className="flex items-center justify-between border-b border-line px-4 py-2">
              <h3 className="text-[13px] font-semibold">{phase.name}</h3>
              <span className="text-xs text-ink-4">{items.length} feature{items.length === 1 ? "" : "s"}</span>
            </header>
            <ul className="divide-y divide-line">
              {items.map((f) => {
                const met = f.acceptanceCriteria.filter((a) => a.isMet).length;
                return (
                  <li key={f.id} id={f.id} className="scroll-mt-20 px-4 py-3 target:bg-accent-soft/40">
                    <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] font-semibold">{f.name}</span>
                          <Badge tone={PRIORITY[f.priority].tone}>{PRIORITY[f.priority].label}</Badge>
                          {f.changeRequest && <Link href={`/change-requests/${f.changeRequest.id}`} title="Added to scope by an approved change request"><Badge tone="violet">{f.changeRequest.key}</Badge></Link>}
                          {canEdit ? (
                            <select aria-label={`Status of ${f.name}`} value={f.status} onChange={(e) => run(() => setFeatureStatusAction(projectId, f.id, e.target.value))} className="h-6 rounded border border-line bg-surface px-1 text-2xs">
                              {options(FEATURE_STATUS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          ) : (
                            <Badge tone={FEATURE_STATUS[f.status].tone}>{FEATURE_STATUS[f.status].label}</Badge>
                          )}
                        </div>
                        {f.description && <p className="mt-1 text-xs leading-relaxed text-ink-3">{f.description}</p>}
                        {f.dependsOnIds.length > 0 && <p className="mt-1 text-2xs text-ink-4">Depends on {f.dependsOnIds.map((d) => nameOf.get(d)).filter(Boolean).join(", ")}</p>}
                      </div>
                      <div className="w-full shrink-0 text-xs sm:w-56">
                        <div className="flex items-center gap-2"><ProgressBar value={f.progress} /><span className="tabular">{Math.round(f.progress)}%</span></div>
                        <p className="mt-1 text-2xs text-ink-4">
                          <Link href={`/projects/${projectId}/tasks?featureId=${f.id}`} className="hover:text-accent">{f.openTaskCount} open / {f.taskCount} tasks</Link>
                          {" · "}
                          <span className={cn(f.estimatedHours > 0 && f.actualHours > f.estimatedHours && "font-medium text-bad")}>{formatHours(f.actualHours)} / {formatHours(f.estimatedHours)}</span>
                          {f.openBugCount > 0 && <span className="text-bad"> · {f.openBugCount} bug{f.openBugCount === 1 ? "" : "s"}</span>}
                        </p>
                      </div>
                      {canEdit && (
                        <div className="flex gap-0.5">
                          <button type="button" className="rounded p-1.5 text-ink-4 hover:bg-black/5 hover:text-ink" onClick={() => setEditing(f)} aria-label={`Edit ${f.name}`}><Pencil className="size-3.5" /></button>
                          <button type="button" className="rounded p-1.5 text-ink-4 hover:bg-bad-soft hover:text-bad" onClick={() => confirm(`Delete feature "${f.name}"?`) && run(() => deleteFeatureAction(f.id))} aria-label={`Delete ${f.name}`}><Trash2 className="size-3.5" /></button>
                        </div>
                      )}
                    </div>
                    {f.acceptanceCriteria.length > 0 && (
                      <div className="mt-2 rounded-md border border-line bg-subtle/60 px-3 py-2">
                        <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-ink-4">Acceptance criteria · {met}/{f.acceptanceCriteria.length} verified</p>
                        <ul className="grid gap-0.5 sm:grid-cols-2">
                          {f.acceptanceCriteria.map((a) => (
                            <li key={a.id}>
                              <button
                                type="button"
                                disabled={!canVerify}
                                onClick={() => run(() => toggleCriterionAction(a.id))}
                                className={cn("flex w-full items-start gap-1.5 rounded px-1 py-0.5 text-left text-xs", canVerify && "hover:bg-black/5", a.isMet ? "text-ink-3" : "text-ink")}
                              >
                                {a.isMet ? <CheckSquare className="mt-px size-3.5 shrink-0 text-ok" /> : <Square className="mt-px size-3.5 shrink-0 text-ink-4" />}
                                <span className={cn(a.isMet && "line-through decoration-ink-4")}>{a.text}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {editing && <FeatureDialog projectId={projectId} feature={editing === "new" ? null : editing} phases={phases} features={features} changeRequests={changeRequests} onClose={() => setEditing(null)} />}
    </div>
  );
}

function FeatureDialog({
  projectId,
  feature,
  phases,
  features,
  changeRequests,
  onClose,
}: {
  projectId: string;
  feature: FeatureRow | null;
  phases: { id: string; name: string }[];
  features: FeatureRow[];
  changeRequests: { id: string; key: string; title: string }[];
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(saveFeatureAction.bind(null, projectId, feature?.id ?? null), { ok: false } as ActionState);
  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);
  const fe = state.fieldErrors ?? {};
  const deps = new Set(feature?.dependsOnIds ?? []);
  const others = features.filter((f) => f.id !== feature?.id);
  return (
    <Dialog open onClose={onClose} title={feature ? `Edit ${feature.name}` : "Add feature"} size="lg">
      <form action={action} className="grid gap-4 p-5 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2"><FormError message={state.ok ? null : state.error} /></div>
        <Field label="Feature name" htmlFor="f-name" error={fe.name} required className="sm:col-span-2"><Input id="f-name" name="name" defaultValue={feature?.name} autoFocus /></Field>
        <Field label="Phase" htmlFor="f-phase" error={fe.phaseId} required>
          <Select id="f-phase" name="phaseId" defaultValue={feature?.phase.id ?? phases[0]?.id}>
            {phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Priority" htmlFor="f-priority">
          <Select id="f-priority" name="priority" defaultValue={feature?.priority ?? "MEDIUM"}>
            {options(PRIORITY).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
        <Field label="Status" htmlFor="f-status">
          <Select id="f-status" name="status" defaultValue={feature?.status ?? "BACKLOG"}>
            {options(FEATURE_STATUS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
        <Field label="Estimated hours" htmlFor="f-hours" error={fe.estimatedHours}><Input id="f-hours" name="estimatedHours" type="number" min="0" step="0.5" defaultValue={feature?.plannedHours ?? ""} /></Field>
        {(changeRequests.length > 0 || feature?.changeRequest) && (
          <Field label="Scope origin" htmlFor="f-cr" error={fe.changeRequestId} hint="Features added by an approved change request count as approved changes, not original scope." className="sm:col-span-2">
            <Select id="f-cr" name="changeRequestId" defaultValue={feature?.changeRequest?.id ?? ""}>
              <option value="">Original scope</option>
              {changeRequests.map((c) => <option key={c.id} value={c.id}>{c.key} · {c.title}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Description" htmlFor="f-desc" error={fe.description} className="sm:col-span-2"><Textarea id="f-desc" name="description" rows={3} defaultValue={feature?.description ?? ""} /></Field>
        <Field label="Acceptance criteria" htmlFor="f-ac" error={fe.acceptanceCriteria} hint="One per line. Verified state is kept for unchanged lines." className="sm:col-span-2">
          <Textarea id="f-ac" name="acceptanceCriteria" rows={5} placeholder={"User can start roleplay\nAI responds as customer\nConversation is stored"} defaultValue={feature?.acceptanceCriteria.map((a) => a.text).join("\n") ?? ""} />
        </Field>
        {others.length > 0 && (
          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-xs font-medium text-ink-2">Depends on</legend>
            <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
              {others.map((f) => (
                <label key={f.id} className="flex cursor-pointer items-center gap-1.5 rounded border border-line px-2 py-1 text-xs has-checked:border-accent/40 has-checked:bg-accent-soft">
                  <input type="checkbox" name="dependsOnIds" value={f.id} defaultChecked={deps.has(f.id)} className="accent-accent" /> {f.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : feature ? "Save feature" : "Add feature"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
