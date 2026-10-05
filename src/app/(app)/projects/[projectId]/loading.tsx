import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]" aria-busy="true">
      <div className="space-y-5"><Skeleton className="h-16 rounded-lg" /><Skeleton className="h-64 rounded-lg" /><Skeleton className="h-48 rounded-lg" /></div>
      <div className="space-y-5"><Skeleton className="h-32 rounded-lg" /><Skeleton className="h-72 rounded-lg" /></div>
    </div>
  );
}
