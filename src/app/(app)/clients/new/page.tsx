import type { Metadata } from "next";
import { pageContext, load } from "@/server/page-context";
import { requirePermission } from "@/server/authz/context";
import { PageHeader } from "@/components/ui/panel";
import { ClientForm } from "@/features/clients/client-form";

export const metadata: Metadata = { title: "New client" };

export default async function NewClientPage() {
  const ctx = await pageContext();
  await load(async () => requirePermission(ctx, "client.edit"));
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="New client" description="Add a client so you can start projects for them." />
      <ClientForm clientId={null} />
    </div>
  );
}
