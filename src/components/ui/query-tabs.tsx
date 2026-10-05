import Link from "@/components/ui/link";
import { cn } from "@/lib/cn";

/** Server-rendered tabs driven by a ?tab= query param. */
export function QueryTabs({ base, active, items }: { base: string; active: string; items: { key: string; label: string; count?: number }[] }) {
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto scrollbar-thin" aria-label="Sections">
      {items.map((t, i) => {
        const isActive = active === t.key;
        return (
          <Link
            key={t.key}
            href={i === 0 ? base : `${base}?tab=${t.key}`}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 pt-1 pb-2.5 text-[13px] font-medium whitespace-nowrap",
              isActive ? "border-accent text-ink" : "border-transparent text-ink-3 hover:border-line-strong hover:text-ink-2",
            )}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && <span className="tabular rounded bg-zinc-100 px-1 text-2xs text-ink-3">{t.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
