import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { HEALTH, type HealthLevel, type StatusDef, type Tone } from "@/lib/status";

const tones: Record<Tone, string> = {
  neutral: "bg-zinc-100 text-ink-2 ring-zinc-200",
  muted: "bg-subtle text-ink-3 ring-line",
  blue: "bg-info-soft text-info ring-info/20",
  violet: "bg-violet-soft text-violet ring-violet/20",
  amber: "bg-warn-soft text-warn ring-warn/20",
  green: "bg-ok-soft text-ok ring-ok/20",
  red: "bg-bad-soft text-bad ring-bad/20",
};

const dots: Record<Tone, string> = {
  neutral: "bg-ink-3",
  muted: "bg-ink-4",
  blue: "bg-info",
  violet: "bg-violet",
  amber: "bg-warn",
  green: "bg-ok",
  red: "bg-bad",
};

export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-2xs font-medium whitespace-nowrap ring-1 ring-inset", tones[tone], className)}>
      {dot && <span className={cn("size-1.5 rounded-full", dots[tone])} />}
      {children}
    </span>
  );
}

export function StatusBadge<T extends string>({ defs, value, dot }: { defs: Record<T, StatusDef>; value: T; dot?: boolean }) {
  const def = defs[value];
  return (
    <Badge tone={def.tone} dot={dot}>
      {def.label}
    </Badge>
  );
}

export function HealthBadge({ level, title }: { level: HealthLevel; title?: string }) {
  const def = HEALTH[level];
  return (
    <span title={title} className="inline-flex">
      <Badge tone={def.tone} dot>
        {def.label}
      </Badge>
    </span>
  );
}

export function Dot({ tone }: { tone: Tone }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", dots[tone])} />;
}
