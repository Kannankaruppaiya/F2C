import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-2 h-6 w-48" />
      <Skeleton className="mb-5 h-4 w-72" />
      <div className="rounded-lg border border-line bg-surface">
        <div className="border-b border-line p-3"><Skeleton className="h-8 w-80" /></div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-4 border-b border-line px-4 py-3 last:border-0">
            <Skeleton className="h-4 w-1/3" /><Skeleton className="h-4 w-1/6" /><Skeleton className="h-4 w-1/6" /><Skeleton className="h-4 w-1/12" />
          </div>
        ))}
      </div>
    </div>
  );
}
