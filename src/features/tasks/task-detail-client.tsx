"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Check, CheckSquare, Eye, Play, Square, Trash2, X } from "lucide-react";
import type { Priority, TaskStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { FormError, Input, Textarea } from "@/components/ui/field";
import { Avatar } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { PRIORITY, options } from "@/lib/status";
import { timeAgo } from "@/lib/format";
import type { ActionState } from "@/server/action-state";
import {
  addCommentAction,
  addSubtaskAction,
  deleteSubtaskAction,
  deleteTaskAction,
  logTaskTimeAction,
  setTaskFieldAction,
  setTaskStatusAction,
  startTimerAction,
  stopTaskTimerAction,
  toggleSubtaskAction,
} from "./actions";

export function TaskQuickActions({
  taskId,
  status,
  priority,
  assigneeId,
  team,
  timerRunningHere,
  canEdit,
  canAssign,
  canLogTime,
  selfId,
}: {
  taskId: string;
  status: TaskStatus;
  priority: Priority;
  assigneeId: string | null;
  team: { id: string; name: string }[];
  timerRunningHere: boolean;
  canEdit: boolean;
  canAssign: boolean;
  canLogTime: boolean;
  selfId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<ActionState | void>) =>
    startTransition(async () => {
      const r = await fn();
      setError(r && !r.ok ? (r.error ?? "Action failed") : null);
    });
  const assignable = canAssign ? team : team.filter((m) => m.id === selfId || m.id === assigneeId);

  return (
    <div>
      <div className={cn("flex flex-wrap items-center gap-2", pending && "opacity-60")}>
        {canLogTime &&
          (timerRunningHere ? (
            <Button variant="secondary" className="border-ok/40 text-ok" onClick={() => run(() => stopTaskTimerAction(taskId))}><Square className="size-3 fill-current" /> Stop timer</Button>
          ) : (
            status !== "DONE" && <Button onClick={() => run(() => startTimerAction(taskId))}><Play className="size-3.5" /> Start timer</Button>
          ))}
        {canEdit && status !== "DONE" && <Button variant="primary" onClick={() => run(() => setTaskStatusAction(taskId, "DONE"))}><Check className="size-3.5" /> Mark complete</Button>}
        {canEdit && status !== "REVIEW" && status !== "DONE" && <Button onClick={() => run(() => setTaskStatusAction(taskId, "REVIEW"))}><Eye className="size-3.5" /> Move to review</Button>}
        {canEdit && status === "DONE" && <Button onClick={() => run(() => setTaskStatusAction(taskId, "IN_PROGRESS"))}>Reopen</Button>}
        {canEdit && (
          <select aria-label="Assignee" value={assigneeId ?? ""} onChange={(e) => run(() => setTaskFieldAction(taskId, "assigneeId", e.target.value))} className="h-8 rounded-md border border-line-strong bg-surface px-2 text-[13px] shadow-xs">
            <option value="">Unassigned</option>
            {assignable.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
        {canEdit && (
          <select aria-label="Priority" value={priority} onChange={(e) => run(() => setTaskFieldAction(taskId, "priority", e.target.value))} className="h-8 rounded-md border border-line-strong bg-surface px-2 text-[13px] shadow-xs">
            {options(PRIORITY).map((o) => <option key={o.value} value={o.value}>{o.label} priority</option>)}
          </select>
        )}
      </div>
      {error && <div className="mt-2"><FormError message={error} /></div>}
    </div>
  );
}

export function Subtasks({ taskId, items, canEdit }: { taskId: string; items: { id: string; title: string; isDone: boolean }[]; canEdit: boolean }) {
  const [state, action, pending] = useActionState(addSubtaskAction.bind(null, taskId), { ok: false } as ActionState);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <div>
      <ul>
        {items.map((s) => (
          <li key={s.id} className="group flex items-center gap-2 border-b border-line px-4 py-1.5 last:border-0">
            <button type="button" disabled={!canEdit} onClick={() => startTransition(() => toggleSubtaskAction(s.id))} className="flex min-w-0 flex-1 items-center gap-2 text-left text-[13px]" aria-pressed={s.isDone}>
              {s.isDone ? <CheckSquare className="size-4 shrink-0 text-ok" /> : <Square className="size-4 shrink-0 text-ink-4" />}
              <span className={cn("truncate", s.isDone && "text-ink-3 line-through decoration-ink-4")}>{s.title}</span>
            </button>
            {canEdit && (
              <button type="button" onClick={() => startTransition(() => deleteSubtaskAction(s.id))} className="rounded p-1 text-ink-4 opacity-0 group-hover:opacity-100 hover:text-bad focus:opacity-100" aria-label={`Delete ${s.title}`}>
                <X className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <form ref={ref} action={action} className="flex gap-2 border-t border-line px-4 py-2">
          <Input name="title" placeholder="Add a subtask…" className="h-8" aria-label="New subtask" />
          <Button type="submit" disabled={pending}>Add</Button>
        </form>
      )}
    </div>
  );
}

export function Comments({ taskId, comments, canComment }: { taskId: string; comments: { id: string; body: string; createdAt: string; author: { name: string; avatarColor: string | null } }[]; canComment: boolean }) {
  const [state, action, pending] = useActionState(addCommentAction.bind(null, taskId), { ok: false } as ActionState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <div>
      {comments.length === 0 && <p className="px-4 py-4 text-xs text-ink-4">No comments yet.</p>}
      <ul className="divide-y divide-line">
        {comments.map((c) => (
          <li key={c.id} className="flex gap-2.5 px-4 py-3">
            <Avatar name={c.author.name} color={c.author.avatarColor} />
            <div className="min-w-0">
              <p className="text-xs"><span className="font-medium text-ink">{c.author.name}</span> <span className="text-ink-4">· {timeAgo(c.createdAt)}</span></p>
              <p className="mt-0.5 whitespace-pre-line text-[13px] text-ink-2">{c.body}</p>
            </div>
          </li>
        ))}
      </ul>
      {canComment && (
        <form ref={ref} action={action} className="space-y-2 border-t border-line px-4 py-3">
          <Textarea name="body" rows={2} placeholder="Write a comment…" aria-label="Comment" />
          {!state.ok && state.error && <FormError message={state.error} />}
          <div className="flex justify-end"><Button type="submit" variant="primary" disabled={pending}>{pending ? "Posting…" : "Comment"}</Button></div>
        </form>
      )}
    </div>
  );
}

export function LogTimeForm({ taskId, projectId, today }: { taskId: string; projectId: string; today: string }) {
  const [state, action, pending] = useActionState(logTaskTimeAction.bind(null, taskId, projectId), { ok: false } as ActionState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  const fe = state.fieldErrors ?? {};
  return (
    <form ref={ref} action={action} className="space-y-2 border-t border-line px-4 py-3">
      <div className="grid grid-cols-[1fr_5rem] gap-2">
        <Input name="date" type="date" defaultValue={today} max={today} aria-label="Date" aria-invalid={!!fe.date} className="h-8" />
        <Input name="hours" type="number" step="0.25" min="0.25" max="24" placeholder="Hours" aria-label="Hours" aria-invalid={!!fe.hours} className="h-8" />
      </div>
      <Input name="description" placeholder="What did you do? (optional)" aria-label="Description" className="h-8" />
      {!state.ok && state.error && <p className="text-xs text-bad">{fe.hours?.[0] ?? fe.date?.[0] ?? state.error}</p>}
      <Button type="submit" size="xs" className="w-full" disabled={pending}>{pending ? "Logging…" : "Log time"}</Button>
    </form>
  );
}

export function DeleteTaskButton({ taskId }: { taskId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button variant="danger" size="xs" disabled={pending} onClick={() => confirm("Delete this task?") && startTransition(async () => void (await deleteTaskAction(taskId)))}>
      <Trash2 className="size-3.5" /> Delete
    </Button>
  );
}
