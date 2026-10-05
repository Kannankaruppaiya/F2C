import { Money } from "@/components/ui/money";
import { formatHours, type MoneyFormat } from "@/lib/format";
import type { ScopeSummary } from "@/server/services/scope";

/** Original scope → approved changes → current scope. Explains why effort grew. */
export function ScopeStrip({ scope, fmt, showCost }: { scope: ScopeSummary; fmt: MoneyFormat; showCost: boolean }) {
  const cell = "px-4 py-3";
  return (
    <div className="grid grid-cols-3 divide-x divide-line border-t border-line">
      <div className={cell}>
        <p className="text-2xs font-medium uppercase tracking-wide text-ink-4">Original scope</p>
        <p className="tabular mt-0.5 text-base font-semibold">{scope.original.features} <span className="text-xs font-normal text-ink-3">features</span></p>
        <p className="tabular text-2xs text-ink-4">{formatHours(scope.original.hours)} estimated</p>
      </div>
      <div className={cell}>
        <p className="text-2xs font-medium uppercase tracking-wide text-ink-4">Approved changes</p>
        <p className="tabular mt-0.5 text-base font-semibold">
          +{scope.approvedChanges.features} <span className="text-xs font-normal text-ink-3">features</span>
        </p>
        <p className="tabular text-2xs text-ink-4">
          {scope.approvedChanges.changeRequests} CR{scope.approvedChanges.changeRequests === 1 ? "" : "s"} · +{formatHours(scope.approvedChanges.hours)}
          {showCost && scope.approvedChanges.cost > 0 && <> · +<Money value={scope.approvedChanges.cost} fmt={fmt} compact /></>}
        </p>
      </div>
      <div className={cell}>
        <p className="text-2xs font-medium uppercase tracking-wide text-ink-4">Current scope</p>
        <p className="tabular mt-0.5 text-base font-semibold">{scope.current.features} <span className="text-xs font-normal text-ink-3">features</span></p>
        <p className="tabular text-2xs text-ink-4">
          {formatHours(scope.current.hours)}
          {scope.pendingChanges.changeRequests > 0 && <span className="text-warn"> · {scope.pendingChanges.changeRequests} pending</span>}
        </p>
      </div>
    </div>
  );
}
