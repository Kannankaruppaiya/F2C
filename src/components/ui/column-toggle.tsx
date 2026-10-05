"use client";

import { useEffect, useRef, useState } from "react";
import { Columns3 } from "lucide-react";
import { Button } from "./button";

/**
 * Column visibility control. Hidden columns are stored per table in localStorage and applied
 * via a data attribute + CSS, so server-rendered tables need no client state.
 */
export function ColumnToggle({ tableId, columns }: { tableId: string; columns: { key: string; label: string }[] }) {
  const [hidden, setHidden] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`cols:${tableId}`);
      if (raw) setHidden(JSON.parse(raw) as string[]);
    } catch {
      /* storage unavailable */
    }
  }, [tableId]);

  useEffect(() => {
    const el = document.getElementById(tableId);
    if (el) el.dataset.hidden = hidden.join(" ");
    try {
      localStorage.setItem(`cols:${tableId}`, JSON.stringify(hidden));
    } catch {
      /* ignore */
    }
  }, [hidden, tableId]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const css = hidden.map((k) => `#${tableId} [data-col="${k}"]{display:none}`).join("");

  return (
    <div className="relative" ref={ref}>
      <style>{css}</style>
      <Button size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Columns3 className="size-3.5" /> <span className="hidden sm:inline">Columns</span>
      </Button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-line bg-surface p-1 shadow-lg">
          {columns.map((c) => (
            <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] hover:bg-subtle">
              <input
                type="checkbox"
                className="accent-accent"
                checked={!hidden.includes(c.key)}
                onChange={(e) => setHidden((h) => (e.target.checked ? h.filter((x) => x !== c.key) : [...h, c.key]))}
              />
              {c.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
