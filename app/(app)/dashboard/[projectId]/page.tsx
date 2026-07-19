import { notFound } from 'next/navigation';
import { PageShell, Badge } from '@/components/ui';
import {
  getDailyUpdates,
  getProjectById,
  getProjectManpowerRates,
  getProjectMaterialMaster,
  getProjectWbsMaster,
  getRevenueGeneratingRows,
  getRevenueRows,
  getProjects,
  getProjectCostElementControl,
  getGr55Summaries,
  getHistoricalRevenueRows,
} from '@/lib/data';
import { getEffectiveDashboardLayout, getEffectiveOrder } from '@/lib/dashboard-layout';
import { getCurrentAppUser, canManageDashboardLayout } from '@/lib/current-user';
import { DashboardClientWorkspace } from '@/components/dashboard-client-workspace';

export default async function ProjectDashboardPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getProjectById(projectId);
  if (!project) return notFound();

  // Load all required datasets concurrently on the server
  const [
    projects,
    revenueRows,
    costRowsRaw,
    updates,
    manpowerRates,
    materialMasters,
    projectWbsMaster,
    costElementControl,
    gr55Rows,
    historicalRevenueRows,
  ] = await Promise.all([
    getProjects(),
    getRevenueGeneratingRows(projectId),
    getRevenueRows(projectId),
    getDailyUpdates(projectId),
    getProjectManpowerRates(projectId),
    getProjectMaterialMaster(projectId),
    getProjectWbsMaster(projectId),
    getProjectCostElementControl(projectId),
    getGr55Summaries(projectId),
    getHistoricalRevenueRows(projectId),
  ]);

  const dashboardLayout = await getEffectiveDashboardLayout(projectId);
  const [summaryOrder, trendsOrder] = await Promise.all([
    getEffectiveOrder(projectId, 'summary'),
    getEffectiveOrder(projectId, 'trends'),
  ]);
  const currentUser = await getCurrentAppUser();
  const canCustomize = canManageDashboardLayout(currentUser?.role);

  // Only include active and cost-included WBS elements from WBS Master
  const costWbsCodes = new Set(
    projectWbsMaster
      .filter((w) => w.is_active !== false && w.include_in_cost !== false)
      .map((w) => w.wbs_code.replace(/[^A-Za-z0-9]/g, '').toUpperCase())
      .filter(Boolean)
  );

  const costRows = costRowsRaw.filter((row) => {
    const code = row.wbs_code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    return costWbsCodes.has(code);
  });

  return (
    <PageShell
      title={`Project: ${project.project_name}`}
      subtitle="Executive Dashboard"
      actions={<Badge tone="accent">{project.project_code}</Badge>}
    >
      <DashboardClientWorkspace
        project={project}
        projects={projects}
        revenueRows={revenueRows}
        costRows={costRows}
        allWbsRows={costRowsRaw}
        updates={updates}
        manpowerRates={manpowerRates}
        materialMasters={materialMasters}
        projectWbsMaster={projectWbsMaster}
        costElementControl={costElementControl}
        gr55Rows={gr55Rows}
        historicalRevenueRows={historicalRevenueRows}
        dashboardLayout={dashboardLayout}
        canCustomize={canCustomize}
        summaryOrder={summaryOrder}
        trendsOrder={trendsOrder}
      />
    </PageShell>
  );
}
