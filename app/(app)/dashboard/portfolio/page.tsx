import { PageShell } from '@/components/ui';
import { getProjects, getRevenueGeneratingRows, getRevenueRows, getLatestUploadDate, getProjectWbsMaster } from '@/lib/data';
import { getCurrentAppUser, requireRouteAccess } from '@/lib/current-user';
import { PortfolioDashboard } from '@/components/portfolio-dashboard';

export default async function PortfolioPage() {
  await requireRouteAccess('/dashboard');

  const [projects, currentUser] = await Promise.all([getProjects(), getCurrentAppUser()]);

  const visibleProjects =
    currentUser?.role === 'Project Manager'
      ? projects.filter(
          (p) =>
            p.project_manager_user_id === currentUser.id ||
            p.project_manager_email === currentUser.email,
        )
      : projects;

  const rows = await Promise.all(
    visibleProjects.map(async (project) => {
      const [revenueRows, costRowsAll, wbsMaster, latestUpload] = await Promise.all([
        getRevenueGeneratingRows(project.id),
        getRevenueRows(project.id),
        getProjectWbsMaster(project.id),
        getLatestUploadDate(project.id),
      ]);

      // Apply the exact same WBS filter the project dashboard uses
      const activeCostWbsCodes = new Set(
        wbsMaster
          .filter((w) => w.is_active !== false && w.include_in_cost !== false)
          .map((w) => w.wbs_code.replace(/[^A-Za-z0-9]/g, '').toUpperCase())
          .filter(Boolean),
      );
      const costRows =
        activeCostWbsCodes.size > 0
          ? costRowsAll.filter((r) =>
              activeCostWbsCodes.has(r.wbs_code.replace(/[^A-Za-z0-9]/g, '').toUpperCase()),
            )
          : costRowsAll;

      // Sum pre-stored values from revenue_wbs directly — revenue rows for everything revenue-related
      const plannedRevenue    = revenueRows.reduce((s, r) => s + r.planned_revenue, 0);
      const recognizedRevenue = revenueRows.reduce((s, r) => s + r.recognized_revenue_to_date, 0);
      const forecastMargin    = revenueRows.reduce((s, r) => s + r.forecast_margin, 0);
      const mtdRevenue        = revenueRows.reduce((s, r) => s + r.mtd_revenue_recognition, 0);
      const ytdRevenue        = revenueRows.reduce((s, r) => s + r.ytd_revenue_recognition, 0);
      // Cost rows (WBS-filtered) for cost figures
      const plannedCost       = costRows.reduce((s, r) => s + r.planned_cost, 0);
      const actualCost        = costRows.reduce((s, r) => s + r.actual_cost_to_date, 0);
      const forecastCost      = costRows.reduce((s, r) => s + r.forecast_cost, 0);
      // POC = recognizedRevenue / plannedRevenue — exact same formula as the project dashboard
      const pocPercent        = plannedRevenue > 0 ? Math.min(100, (recognizedRevenue / plannedRevenue) * 100) : 0;
      const forecastMarginPct = plannedRevenue > 0 ? (forecastMargin / plannedRevenue) * 100 : 0;

      return {
        id: project.id,
        project_code: project.project_code,
        project_name: project.project_name,
        client_name: project.client_name ?? null,
        project_manager_name: project.project_manager_name ?? null,
        status: project.status ?? 'Active',
        latestUpload,
        plannedRevenue,
        plannedCost,
        actualCost,
        recognizedRevenue,
        forecastCost,
        forecastMargin,
        forecastMarginPct,
        pocPercent,
        mtdRevenue,
        ytdRevenue,
        riskStatus: (forecastMargin < 0 ? 'Warning' : 'Safe') as 'Warning' | 'Safe',
      };
    }),
  );

  return (
    <PageShell
      title="Portfolio Overview"
      subtitle="Aggregated financial performance across all active projects."
    >
      <PortfolioDashboard rows={rows} />
    </PageShell>
  );
}
