import { PageShell } from '@/components/ui';
import { CostElementsPageClient } from '@/components/cost-elements-page-client';
import { getProjectCostElementControl, getProjects } from '@/lib/data';
import { requireRouteAccess } from '@/lib/current-user';

export default async function CostElementsPage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  await requireRouteAccess('/cost-elements');
  const params = await searchParams;
  const projects = await getProjects();
  const selectedProjectId = params.projectId && projects.some((project) => project.id === params.projectId)
    ? params.projectId
    : projects[0]?.id ?? '';
  const costElements = selectedProjectId ? await getProjectCostElementControl(selectedProjectId) : [];

  return (
    <PageShell
      title="Cost Element Control"
      subtitle="Choose which GR55 cost elements are included or excluded from actual cost, separately for each project."
    >
      <CostElementsPageClient projects={projects} selectedProjectId={selectedProjectId} costElements={costElements} />
    </PageShell>
  );
}
