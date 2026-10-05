import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Bordered content section with an optional header row. The workhorse container. */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("rounded-lg border border-line bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]", className)}>
      {(title || actions) && (
        <header className="flex min-h-11 items-center justify-between gap-3 border-b border-line px-4 py-2">
          <div className="min-w-0 flex-1">
            {typeof title === "string" ? <h2 className="truncate text-[13px] font-semibold text-ink">{title}</h2> : title}
            {description && <p className="truncate text-xs text-ink-3">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions, meta }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; meta?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function DefinitionList({ items, className, single }: { items: { label: string; value: ReactNode }[]; className?: string; single?: boolean }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-3", !single && "sm:grid-cols-2", className)}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="text-2xs font-medium uppercase tracking-wide text-ink-4">{it.label}</dt>
          <dd className={cn("mt-0.5 text-[13px] text-ink", !single && "truncate")}>{it.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
