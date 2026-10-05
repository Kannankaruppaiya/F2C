"use client";

import { useActionState, useRef } from "react";
import type { ProjectStatus } from "@prisma/client";
import { PROJECT_STATUS, PROJECT_TRANSITIONS } from "@/lib/status";
import type { ActionState } from "@/server/action-state";
import { changeProjectStatusAction } from "./actions";

/** Status selector constrained to allowed transitions; server enforces the same rules. */
export function ProjectStatusControl({ projectId, status }: { projectId: string; status: ProjectStatus }) {
  const [state, action, pending] = useActionState(changeProjectStatusAction.bind(null, projectId), { ok: false } as ActionState);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} action={action} className="relative">
      <select
        name="status"
        value=""
        disabled={pending}
        onChange={() => ref.current?.requestSubmit()}
        aria-label="Change status"
        className="h-8 rounded-md border border-line-strong bg-surface pr-7 pl-2.5 text-[13px] text-ink-2 shadow-xs"
      >
        <option value="" disabled>{pending ? "Updating…" : "Move to…"}</option>
        {PROJECT_TRANSITIONS[status].map((s) => (
          <option key={s} value={s}>{PROJECT_STATUS[s].label}</option>
        ))}
      </select>
      {state.error && <p role="alert" className="absolute top-full right-0 z-20 mt-1 w-72 rounded-md border border-bad/20 bg-bad-soft p-2 text-xs text-bad shadow">{state.error}</p>}
    </form>
  );
}
