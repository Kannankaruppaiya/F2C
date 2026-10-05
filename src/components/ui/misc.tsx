import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

export function EmptyState({ title, description, action, icon, className }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {icon && <div className="mb-3 text-ink-4">{icon}</div>}
      <p className="text-[13px] font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-ink-3">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-zinc-200/70", className)} />;
}

export function Avatar({ name, color, size = "sm" }: { name: string; color?: string | null; size?: "xs" | "sm" | "md" }) {
  const dims = { xs: "size-5 text-[9px]", sm: "size-6 text-[10px]", md: "size-8 text-xs" }[size];
  return (
    <span
      title={name}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white", dims)}
      style={{ backgroundColor: color ?? "#667085" }}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarName({ name, color }: { name: string | null | undefined; color?: string | null }) {
  if (!name) return <span className="text-ink-4">Unassigned</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Avatar name={name} color={color} size="xs" />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** Compact metric for KPI rows. */
export function Stat({ label, value, sub, tone, href }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "bad" | "warn" | "ok"; href?: string }) {
  const body = (
    <>
      <p className="text-2xs font-medium uppercase tracking-wide text-ink-3">{label}</p>
      <p className={cn("tabular mt-1 text-xl font-semibold tracking-tight", tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : "text-ink")}>
        {value}
      </p>
      {sub && <p className="mt-0.5 truncate text-xs text-ink-3">{sub}</p>}
    </>
  );
  const cls = "block min-w-0 bg-surface px-4 py-3";
  return href ? (
    <a href={href} className={cn(cls, "hover:bg-subtle")}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Grid of Stats sharing borders — denser than separate cards. */
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-px overflow-hidden rounded-lg border border-line bg-line", className)}>{children}</div>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-subtle px-1 font-mono text-[10px] text-ink-3">{children}</kbd>;
}
