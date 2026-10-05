import type { Metadata } from "next";
import Link from "@/components/ui/link";
import { pageContext } from "@/server/page-context";
import { listDocuments } from "@/server/services/documents";
import { listProjectOptions } from "@/server/services/projects";
import { documentListQuery } from "@/server/validation/schemas";
import { db } from "@/server/db";
import { PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/misc";
import { FilterBar, FilterSelect, SearchInput } from "@/components/ui/filter-bar";
import { DocumentTable } from "@/features/documents/document-table";
import { UploadDialog } from "@/features/documents/upload-dialog";
import { loadUploadOptions } from "@/features/documents/upload-options";
import { DOCUMENT_CATEGORY, DOCUMENT_STATUS, options } from "@/lib/status";
import { flatParams, hrefWith, type SearchParams } from "@/lib/url";

export const metadata: Metadata = { title: "Documents" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await pageContext();
  const params = flatParams(await searchParams);
  const parsed = documentListQuery.safeParse(params);
  const query = parsed.success ? parsed.data : documentListQuery.parse({});
  const [rows, projects, upload] = await Promise.all([listDocuments(ctx, query), listProjectOptions(ctx), loadUploadOptions(ctx)]);
  const phases = query.projectId ? await db.phase.findMany({ where: { projectId: query.projectId, workspaceId: ctx.workspaceId, deletedAt: null }, select: { id: true, name: true }, orderBy: { position: "asc" } }) : [];
  const filtered = !!(params.q || params.category || params.status || params.projectId || params.phaseId);
  const isClient = ctx.role === "CLIENT";

  return (
    <>
      <PageHeader
        title="Documents"
        description={isClient ? "Documents your project team has shared with you." : "Versioned project documents. Every upload is a new, immutable version."}
        actions={upload.canUpload && upload.projects.length > 0 && <UploadDialog mode={{ kind: "document", projects: upload.projects, clients: upload.clients, defaultProjectId: query.projectId, canShare: upload.canShare }} maxMb={upload.maxMb} />}
      />
      <Panel
        title={
          <FilterBar action="/documents">
            <SearchInput defaultValue={params.q} placeholder="Search documents" />
            <FilterSelect name="category" label="Any category" defaultValue={params.category} options={Object.entries(DOCUMENT_CATEGORY).map(([value, label]) => ({ value, label }))} />
            <FilterSelect name="status" label="Active (not archived)" defaultValue={params.status} options={options(DOCUMENT_STATUS)} />
            {projects.length > 1 && <FilterSelect name="projectId" label="All projects" defaultValue={params.projectId} options={projects.map((p) => ({ value: p.id, label: p.name }))} />}
            {phases.length > 0 && <FilterSelect name="phaseId" label="Any phase" defaultValue={params.phaseId} options={phases.map((p) => ({ value: p.id, label: p.name }))} />}
            <FilterSelect name="sort" label="Recently updated" defaultValue={params.sort === "updated" ? undefined : params.sort} options={[{ value: "name", label: "Name" }, { value: "category", label: "Category" }]} />
            {filtered && <Link href="/documents" className="text-xs text-ink-3 hover:text-ink">Clear</Link>}
          </FilterBar>
        }
      >
        <DocumentTable
          rows={rows}
          empty={
            filtered ? (
              <EmptyState title="No documents match these filters." action={<Link href={hrefWith("/documents", {})} className="text-[13px] text-accent hover:underline">Clear filters</Link>} />
            ) : (
              <EmptyState
                title={isClient ? "No documents have been shared with you yet." : "No project documents yet."}
                description={isClient ? "When your team shares a document or asks for your approval, it appears here." : "Upload requirements, designs, proposals and technical docs. Each revision becomes a new version."}
              />
            )
          }
        />
      </Panel>
    </>
  );
}
