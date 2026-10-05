"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { Kbd } from "@/components/ui/misc";

interface Hit {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}
interface Group {
  label: string;
  hits: Hit[];
}

const JUMPS: Group = {
  label: "Go to",
  hits: [
    { id: "j-dash", title: "Dashboard", href: "/dashboard" },
    { id: "j-proj", title: "Projects", href: "/projects" },
    { id: "j-tasks", title: "My tasks", href: "/tasks?assigneeId=me" },
    { id: "j-clients", title: "Clients", href: "/clients" },
    { id: "j-newp", title: "New project", href: "/projects/new" },
    { id: "j-newt", title: "New task", href: "/tasks/new" },
  ],
};

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setGroups([]);
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        if (res.ok) {
          const json = (await res.json()) as { data: Group[] };
          setGroups(json.data);
          setActive(0);
        }
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const shown = useMemo(() => (q.trim().length < 2 ? [JUMPS] : groups), [q, groups]);
  const flat = useMemo(() => shown.flatMap((g) => g.hits), [shown]);

  const go = useCallback(
    (hit: Hit | undefined) => {
      if (!hit) return;
      onClose();
      router.push(hit.href);
    },
    [onClose, router],
  );

  if (!open) return null;

  // Flat index of each group's first hit, for keyboard navigation across groups.
  const groupOffsets = shown.map((_, gi) => shown.slice(0, gi).reduce((n, g) => n + g.hits.length, 0));
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-zinc-950/30 px-4 pt-[12vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Search"
        className="w-full max-w-xl overflow-hidden rounded-lg border border-line bg-surface shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, flat.length - 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          }
          if (e.key === "Enter") {
            e.preventDefault();
            go(flat[active]);
          }
        }}
      >
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search className="size-4 text-ink-4" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search projects, clients, tasks, features, bugs, invoices…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-4"
            aria-label="Search"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-1">
          {loading && flat.length === 0 && <p className="px-4 py-6 text-center text-xs text-ink-3">Searching…</p>}
          {!loading && q.trim().length >= 2 && flat.length === 0 && (
            <p className="px-4 py-6 text-center text-xs text-ink-3">No results for “{q.trim()}”.</p>
          )}
          {shown.map((g, gi) => (
            <div key={g.label} className="py-1">
              <p className="px-4 pt-1 pb-1 text-2xs font-medium uppercase tracking-wide text-ink-4">{g.label}</p>
              {g.hits.map((h, hi) => {
                const i = groupOffsets[gi]! + hi;
                return (
                  <button
                    key={g.label + h.id}
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(h)}
                    className={cn("flex w-full items-center gap-3 px-4 py-2 text-left", i === active ? "bg-accent-soft" : "hover:bg-subtle")}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ink">{h.title}</span>
                      {h.subtitle && <span className="block truncate text-xs text-ink-3">{h.subtitle}</span>}
                    </span>
                    {i === active && <CornerDownLeft className="size-3.5 text-ink-4" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
