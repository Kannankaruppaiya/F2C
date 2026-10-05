"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export interface TabItem {
  href: string;
  label: string;
  count?: number;
  /** Match only exact path (for index tabs). */
  exact?: boolean;
}

export function NavTabs({ items, className }: { items: TabItem[]; className?: string }) {
  const pathname = usePathname();
  return (
    <nav className={cn("-mb-px flex gap-1 overflow-x-auto scrollbar-thin", className)} aria-label="Sections">
      {items.map((t) => {
        const path = t.href.split("?")[0]!;
        const active = t.exact ? pathname === path : pathname === path || pathname.startsWith(path + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 pt-1 pb-2.5 text-[13px] font-medium whitespace-nowrap transition-colors",
              active ? "border-accent text-ink" : "border-transparent text-ink-3 hover:border-line-strong hover:text-ink-2",
            )}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={cn("tabular rounded px-1 text-2xs", active ? "bg-accent-soft text-accent" : "bg-zinc-100 text-ink-3")}>{t.count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** Segmented control backed by URL params (view switchers). */
export function Segmented({ items }: { items: { href: string; label: string; active: boolean; icon?: React.ReactNode }[] }) {
  return (
    <div className="inline-flex rounded-md border border-line-strong bg-surface p-0.5 shadow-xs">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          aria-current={it.active ? "page" : undefined}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-xs font-medium",
            it.active ? "bg-zinc-900 text-white" : "text-ink-3 hover:text-ink",
          )}
        >
          {it.icon}
          <span className="hidden sm:inline">{it.label}</span>
        </Link>
      ))}
    </div>
  );
}
