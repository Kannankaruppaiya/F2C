import type { ReactNode } from "react";
import { PageHeader, Panel } from "./panel";

/** Honest page for modules scheduled in a later delivery phase. No fake data or controls. */
export function RoadmapPage({ title, description, phase, capabilities, available }: { title: string; description: string; phase: string; capabilities: string[]; available?: ReactNode }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title={`Planned for ${phase}`} description="This module's data model is in place; its workflow ships in this phase.">
          <ul className="divide-y divide-line">
            {capabilities.map((c) => (
              <li key={c} className="px-4 py-2.5 text-[13px] text-ink-2">{c}</li>
            ))}
          </ul>
        </Panel>
        {available && <Panel title="Available today" bodyClassName="p-4 text-[13px] text-ink-2 space-y-2">{available}</Panel>}
      </div>
    </>
  );
}
