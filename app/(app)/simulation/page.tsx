import { PageShell, Card, StatRow } from '@/components/ui';
import { getDailyUpdates, getRevenueRows } from '@/lib/data';
import { formatCurrency, formatPercent } from '@/lib/utils';
import { RevenueVsSimulationChart, CostComparisonChart, TopWbsChart, PendingChart, PocChart, RiskChart } from '@/components/charts';
import { buildRiskAlerts } from '@/lib/calculations';
import { getEffectivePendingCost } from '@/lib/pm-posting';
import { requireRouteAccess } from '@/lib/current-user';

export default async function SimulationPage() {
  await requireRouteAccess('/simulation');
  const revenueRows = await getRevenueRows();
  const updates = await getDailyUpdates();
  const risks = buildRiskAlerts(revenueRows);

  const plannedRevenue = revenueRows.reduce((sum, row) => sum + row.planned_revenue, 0);
  const recognizedRevenue = revenueRows.reduce((sum, row) => sum + row.recognized_revenue_to_date, 0);
  const actualCost = revenueRows.reduce((sum, row) => sum + row.actual_cost_to_date, 0);
  const plannedCost = revenueRows.reduce((sum, row) => sum + row.planned_cost, 0);
  const forecastMargin = revenueRows.reduce((sum, row) => sum + row.forecast_margin, 0);
  const mtdRevenue = revenueRows.reduce((sum, row) => sum + row.mtd_revenue_recognition, 0);
  const ytdRevenue = revenueRows.reduce((sum, row) => sum + row.ytd_revenue_recognition, 0);

  return (
    <PageShell title="Financial Performance" subtitle="Project-to-date, MTD, and YTD views built from Cost-to-Cost revenue recognition.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card title="Planned Revenue" value={formatCurrency(plannedRevenue)} />
        <Card title="Recognized Revenue" value={formatCurrency(recognizedRevenue)} tone="accent" />
        <Card title="Actual Cost to Date" value={formatCurrency(actualCost)} />
        <Card title="Forecast Margin" value={formatCurrency(forecastMargin)} tone="accent" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="glass rounded-2xl p-5">
          <h3 className="text-lg font-semibold text-text">Period Summary</h3>
          <div className="mt-4 space-y-1">
            <StatRow label="Project-to-date planned cost" value={formatCurrency(plannedCost)} />
            <StatRow label="MTD revenue recognition" value={formatCurrency(mtdRevenue)} />
            <StatRow label="YTD revenue recognition" value={formatCurrency(ytdRevenue)} />
            <StatRow label="Open PM updates" value={String(updates.length)} />
            <StatRow label="Open risk alerts" value={String(risks.length)} />
          </div>
        </div>
        <div className="glass rounded-2xl p-5">
          <h3 className="text-lg font-semibold text-text">Current Month Pendings</h3>
          <div className="mt-4 space-y-1">
            {updates.slice(0, 3).map((update) => (
              <StatRow
                key={`${update.project_id}-${update.update_date}-${update.revenue_wbs_id}`}
                label={`${new Date(update.update_date).toLocaleDateString()} | ${update.revenue_wbs_id}`}
                value={`${formatPercent(update.expected_progress)} | ${formatCurrency(getEffectivePendingCost(update))}`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <RevenueVsSimulationChart data={revenueRows.map((row) => ({ name: row.wbs_code, sap: row.recognized_revenue_to_date, simulated: row.planned_revenue }))} />
        <CostComparisonChart data={revenueRows.map((row) => ({ name: row.wbs_code, sap: row.actual_cost_to_date, simulated: row.planned_cost }))} />
        <TopWbsChart data={revenueRows.slice().sort((a, b) => b.recognized_revenue_to_date - a.recognized_revenue_to_date).slice(0, 10).map((row) => ({ name: row.wbs_description || row.wbs_code, value: row.recognized_revenue_to_date }))} />
        <PendingChart data={updates.slice(0, 8).map((update) => ({ name: update.revenue_wbs_id, value: getEffectivePendingCost(update) }))} />
        <PocChart data={revenueRows.map((row) => ({ name: row.wbs_description || row.wbs_code, value: row.poc_percent }))} />
        <RiskChart
          data={Array.from(risks.reduce((map, risk) => map.set(risk.risk_type, (map.get(risk.risk_type) ?? 0) + 1), new Map<string, number>()), ([name, value]) => ({ name, value }))}
        />
      </div>
    </PageShell>
  );
}
