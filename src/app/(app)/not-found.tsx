import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";

export default function NotFound() {
  return <EmptyState className="py-24" title="Not found" description="This page doesn't exist, or you don't have access to it." action={<ButtonLink href="/dashboard">Back to dashboard</ButtonLink>} />;
}
