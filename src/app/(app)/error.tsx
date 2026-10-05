"use client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      className="py-24"
      title="Something went wrong"
      description={`This view failed to load. ${error.digest ? `Reference: ${error.digest}` : ""}`}
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
