/** Honest marker on views whose create/edit workflow ships in a later delivery phase. */
export function ReadOnlyNote({ module, phase }: { module: string; phase: string }) {
  return (
    <span className="hidden rounded border border-line bg-subtle px-1.5 py-0.5 text-2xs text-ink-3 sm:inline" title={`${module} editing arrives in ${phase} of the roadmap. Records shown are live from the database.`}>
      View only · {module} in {phase}
    </span>
  );
}
