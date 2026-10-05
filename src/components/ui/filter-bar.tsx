"use client";

import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";

/** GET form for list filters. Selects auto-submit; search submits on Enter. Works without JS too. */
export function FilterBar({ action, children, hidden = {}, className }: { action: string; children: ReactNode; hidden?: Record<string, string | undefined>; className?: string }) {
  return (
    <form
      action={action}
      method="get"
      className={cn("flex flex-wrap items-center gap-2", className)}
      onChange={(e) => {
        const t = e.target as HTMLElement;
        if (t.tagName === "SELECT") (e.currentTarget as HTMLFormElement).requestSubmit();
      }}
    >
      {Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      {children}
    </form>
  );
}

export function SearchInput({ name = "q", defaultValue, placeholder }: { name?: string; defaultValue?: string; placeholder: string }) {
  return (
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-4" />
      <input
        type="search"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="h-8 w-full rounded-md border border-line-strong bg-surface pr-2.5 pl-8 text-[13px] shadow-xs placeholder:text-ink-4 focus:border-accent focus:ring-2 focus:ring-accent/15 focus:outline-none"
      />
    </div>
  );
}

export function FilterSelect({ name, defaultValue, label, options }: { name: string; defaultValue?: string; label: string; options: { value: string; label: string }[] }) {
  return (
    <select
      name={name}
      defaultValue={defaultValue ?? ""}
      aria-label={label}
      className={cn(
        "h-8 rounded-md border bg-surface pr-7 pl-2.5 text-[13px] shadow-xs focus:border-accent focus:outline-none",
        defaultValue ? "border-accent/40 text-ink" : "border-line-strong text-ink-3",
      )}
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
