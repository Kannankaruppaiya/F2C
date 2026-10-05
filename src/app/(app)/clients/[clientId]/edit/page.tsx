import type { Metadata } from "next";
import { pageContext, load } from "@/server/page-context";
import { can, requirePermission } from "@/server/authz/context";
import { getClient } from "@/server/services/clients";
import { PageHeader } from "@/components/ui/panel";
import { ClientForm } from "@/features/clients/client-form";
import { DeleteClientButton } from "@/features/clients/delete-client";

export const metadata: Metadata = { title: "Edit client" };

export default async function EditClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const ctx = await pageContext();
  const { client } = await load(async () => {
    requirePermission(ctx, "client.edit");
    return getClient(ctx, clientId);
  });
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={`Edit ${client.name}`} actions={can(ctx, "client.delete") && <DeleteClientButton clientId={client.id} name={client.name} />} />
      <ClientForm clientId={client.id} initial={client} />
    </div>
  );
}
