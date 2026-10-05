import Link from "next/link";
import { AlertOctagon, AlertTriangle, Info } from "lucide-react";
import type { AttentionItem } from "@/server/services/dashboard";
import { EmptyState } from "@/components/ui/misc";

const ICON = {
  critical: <AlertOctagon className="size-4 text-bad" />,
  warning: <AlertTriangle className="size-4 text-warn" />,
  info: <Info className="size-4 text-info" />,
};

export function NeedsAttention({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) return <EmptyState title="Nothing needs your attention." description="No overdue invoices, blocked work or pending approvals." className="py-8" />;
  return (
    <ul className="divide-y divide-line">
      {items.slice(0, 10).map((a, i) => (
        <li key={i}>
          <Link href={a.href} className="flex gap-2.5 px-4 py-2.5 hover:bg-subtle">
            <span className="mt-px shrink-0">{ICON[a.severity]}</span>
            <span className="min-w-0">
              <span className="block text-[13px] text-ink">{a.title}</span>
              {a.detail && <span className="block truncate text-xs text-ink-3">{a.detail}</span>}
            </span>
          </Link>
        </li>
      ))}
      {items.length > 10 && <li className="px-4 py-2 text-xs text-ink-4">+{items.length - 10} more items</li>}
    </ul>
  );
}
