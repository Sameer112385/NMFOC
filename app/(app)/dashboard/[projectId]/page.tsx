import { notFound } from 'next/navigation';
import { PageShell } from '@/components/ui';
import { ProjectStickyIdentity } from '@/components/project-sticky-identity';
import {
  getDailyUpdates,
  getProjectById,
  getProjectManpowerRates,
  getProjectMaterialMaster,
  getProjectWbsMaster,
  getPoCommitmentRows,
  getRevenueGeneratingRows,
  getRevenueRows,
  getProjects,
  getProjectCostElementControl,
  getGr55Summaries,
  getHistoricalRevenueRows,
} from '@/lib/data';
import { getEffectiveDashboardLayout, getEffectiveRowOrder } from '@/lib/dashboard-layout';
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
    poCommitments,
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
    getPoCommitmentRows(projectId),
    getProjectCostElementControl(projectId),
    getGr55Summaries(projectId),
    getHistoricalRevenueRows(projectId),
  ]);

  const dashboardLayout = await getEffectiveDashboardLayout(projectId);
  const [summaryOrder, trendsOrder, costTrendsOrder] = await Promise.all([
    getEffectiveRowOrder(projectId, 'summary'),
    getEffectiveRowOrder(projectId, 'trends'),
    getEffectiveRowOrder(projectId, 'costTrends'),
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
      compact
      actions={
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-xs">
          <span className="font-mono font-semibold text-text">{project.project_code}</span>
          <span className="text-muted"><span className="font-semibold text-text">Client:</span> {project.client_name ?? '-'}</span>
          <span className="text-muted"><span className="font-semibold text-text">Status:</span> {project.status ?? 'Active'}</span>
          <span className="text-muted"><span className="font-semibold text-text">PM updates:</span> {updates.length}</span>
        </div>
      }
    >
      <ProjectStickyIdentity projectName={project.project_name} projectCode={project.project_code} />
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
        poCommitments={poCommitments}
        costElementControl={costElementControl}
        gr55Rows={gr55Rows}
        historicalRevenueRows={historicalRevenueRows}
        dashboardLayout={dashboardLayout}
        canCustomize={canCustomize}
        summaryOrder={summaryOrder}
        trendsOrder={trendsOrder}
        costTrendsOrder={costTrendsOrder}
      />
    </PageShell>
  );
}