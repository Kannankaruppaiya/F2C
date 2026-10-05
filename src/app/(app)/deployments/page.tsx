import type { Metadata } from "next";
import { pageContext, load } from "@/server/page-context";
import { listDeployments } from "@/server/services/records";
import { PageHeader, Panel } from "@/components/ui/panel";
import { DeploymentTable } from "@/features/records/tables";
import { ReadOnlyNote } from "@/features/records/read-only-note";

export const metadata: Metadata = { title: "Deployments" };

export default async function Page() {
  const ctx = await pageContext();
  const rows = await load(() => listDeployments(ctx));
  return (
    <>
      <PageHeader title="Deployments" description="Release history across environments." actions={<ReadOnlyNote module="Deployment logging" phase="Phase 5" />} />
      <Panel>
        <DeploymentTable rows={rows} showProject />
      </Panel>
    </>
  );
}
