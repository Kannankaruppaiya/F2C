import type { ComponentProps, ReactNode } from "react";
import Link from "@/components/ui/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/cn";

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className={cn("w-full border-collapse text-[13px]", className)} {...props} />
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-line bg-subtle/60">{children}</tr>
    </thead>
  );
}

export function TH({ className, ...props }: ComponentProps<"th">) {
  return <th className={cn("h-9 px-3 text-left text-2xs font-medium uppercase tracking-wide whitespace-nowrap text-ink-3 first:pl-4 last:pr-4", className)} {...props} />;
}

/** Sortable column header driven by URL search params. */
export function SortTH({
  label,
  field,
  current,
  dir,
  hrefFor,
  className,
  col,
}: {
  /** Column key for ColumnToggle. */
  col?: string;
  label: string;
  field: string;
  current: string;
  dir: "asc" | "desc";
  hrefFor: (field: string, dir: "asc" | "desc") => string;
  className?: string;
}) {
  const active = current === field;
  const next = active && dir === "asc" ? "desc" : "asc";
  return (
    <TH className={className} data-col={col} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}>
      <Link href={hrefFor(field, next)} className={cn("inline-flex items-center gap-1 hover:text-ink", active && "text-ink")}>
        {label}
        {active && (dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </Link>
    </TH>
  );
}

export function TR({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("border-b border-line last:border-0 hover:bg-subtle/70", className)} {...props} />;
}

export function TD({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("h-11 px-3 align-middle first:pl-4 last:pr-4", className)} {...props} />;
}
