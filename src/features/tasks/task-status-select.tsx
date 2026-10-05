"use client";

import { useState, useTransition } from "react";
import type { TaskStatus } from "@prisma/client";
import { cn } from "@/lib/cn";
import { TASK_STATUS, options, type Tone } from "@/lib/status";
import { setTaskStatusAction } from "./actions";

const toneCls: Record<Tone, string> = {
  neutral: "bg-zinc-100 text-ink-2",
  muted: "bg-subtle text-ink-3",
  blue: "bg-info-soft text-info",
  violet: "bg-violet-soft text-violet",
  amber: "bg-warn-soft text-warn",
  green: "bg-ok-soft text-ok",
  red: "bg-bad-soft text-bad",
};

/** Inline status changer that looks like a badge. Shows server rule violations inline. */
export function TaskStatusSelect({ taskId, status, disabled }: { taskId: string; status: TaskStatus; disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="relative inline-flex">
      <select
        aria-label="Task status"
        value={status}
        disabled={disabled || pending}
        onChange={(e) => {
          const next = e.target.value as TaskStatus;
          startTransition(async () => {
            const r = await setTaskStatusAction(taskId, next);
            setError(r.ok ? null : (r.error ?? "Could not update"));
          });
        }}
        className={cn("h-6 cursor-pointer appearance-none rounded border-0 px-1.5 text-2xs font-medium disabled:cursor-default", toneCls[TASK_STATUS[status].tone], pending && "opacity-60")}
      >
        {options(TASK_STATUS).map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {error && (
        <span role="alert" className="absolute top-full left-0 z-20 mt-1 w-64 rounded border border-bad/20 bg-bad-soft p-2 text-xs text-bad shadow" onClick={() => setError(null)}>
          {error}
        </span>
      )}
    </span>
  );
}
