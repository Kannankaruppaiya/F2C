import { cn } from "@/lib/cn";

export function ProgressBar({ value, className, tone }: { value: number; className?: string; tone?: "accent" | "ok" | "warn" | "bad" }) {
  const v = Math.max(0, Math.min(100, value));
  const color = { accent: "bg-accent", ok: "bg-ok", warn: "bg-warn", bad: "bg-bad" }[tone ?? (v >= 100 ? "ok" : "accent")];
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-zinc-200/80", className)} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full", color)} style={{ width: `${v}%` }} />
    </div>
  );
}

export function ProgressCell({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <ProgressBar value={value} className="w-16" />
      <span className="tabular w-9 text-right text-xs text-ink-2">{Math.round(value)}%</span>
    </div>
  );
}
