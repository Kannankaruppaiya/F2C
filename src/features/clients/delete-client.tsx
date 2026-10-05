"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/server/action-state";
import { deleteClientAction } from "./actions";

export function DeleteClientButton({ clientId, name }: { clientId: string; name: string }) {
  const [state, action, pending] = useActionState(deleteClientAction.bind(null, clientId), { ok: false } as ActionState);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Delete ${name}? This cannot be undone.`)) e.preventDefault();
      }}
      className="flex flex-col items-end gap-1"
    >
      <Button type="submit" variant="danger" size="sm" disabled={pending}>Delete client</Button>
      {state.error && <p className="max-w-xs text-right text-xs text-bad">{state.error}</p>}
    </form>
  );
}
