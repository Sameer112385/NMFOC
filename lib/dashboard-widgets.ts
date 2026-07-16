// Central registry of every toggleable dashboard visual.
//
// Each chart/card/panel on the project dashboard has a stable id here. The dashboard
// renders a visual only when it is not hidden, so hiding is reversible and no code is
// ever deleted. Visibility overrides are stored per-id in the dashboard layout config
// (see lib/dashboard-layout.ts); anything without an override defaults to visible.

export type DashboardTab = 'summary' | 'trends';
export type WidgetStatus = 'active' | 'hidden' | 'archived';

// id -> status override. Absent id means "use the default" (active).
export type DashboardLayout = Record<string, WidgetStatus>;

export type DashboardWidget = {
  id: string;
  tab: DashboardTab;
  group: string; // grouping label for the Settings panel
  title: string; // human-readable label
};

export const DASHBOARD_WIDGETS: DashboardWidget[] = [
  // --- Financial Summary · Stat cards ---
  { id: 'summary.card.plannedCost', tab: 'summary', group: 'Summary · Stat cards', title: 'Planned Cost' },
  { id: 'summary.card.mgmtActualCost', tab: 'summary', group: 'Summary · Stat cards', title: 'Management Actual Cost' },
  { id: 'summary.card.plannedRevenue', tab: 'summary', group: 'Summary · Stat cards', title: 'Planned Revenue' },
  { id: 'summary.card.recognizedRevenue', tab: 'summary', group: 'Summary · Stat cards', title: 'Recognized Revenue' },
  { id: 'summary.card.forecastMargin', tab: 'summary', group: 'Summary · Stat cards', title: 'Forecast Margin' },
  { id: 'summary.card.pocPercent', tab: 'summary', group: 'Summary · Stat cards', title: 'POC %' },

  // --- Financial Summary · Panels ---
  { id: 'summary.panel.sapView', tab: 'summary', group: 'Summary · Panels', title: 'SAP View' },
  { id: 'summary.panel.managementView', tab: 'summary', group: 'Summary · Panels', title: 'Management View' },
  { id: 'summary.panel.projectToDate', tab: 'summary', group: 'Summary · Panels', title: 'Project-to-Date' },
  { id: 'summary.panel.ytdPerformance', tab: 'summary', group: 'Summary · Panels', title: 'YTD Performance' },
  { id: 'summary.panel.periodRollups', tab: 'summary', group: 'Summary · Panels', title: 'Period Rollups' },

  // --- Financial Summary · Charts ---
  { id: 'summary.chart.revenueTrend', tab: 'summary', group: 'Summary · Charts', title: 'Revenue Trend' },
  { id: 'summary.chart.revenueSplit', tab: 'summary', group: 'Summary · Charts', title: 'Revenue Split' },
  { id: 'summary.chart.pocByWbs', tab: 'summary', group: 'Summary · Charts', title: 'POC by WBS' },
  { id: 'summary.chart.revenueVsSimulation', tab: 'summary', group: 'Summary · Charts', title: 'Revenue vs Simulation' },
  { id: 'summary.chart.costComparison', tab: 'summary', group: 'Summary · Charts', title: 'Cost Comparison' },
  { id: 'summary.chart.topWbs', tab: 'summary', group: 'Summary · Charts', title: 'Top WBS by Revenue' },

  // --- Financial Summary · Tables & detail panels ---
  { id: 'summary.table.wbsFinancialAnalysis', tab: 'summary', group: 'Summary · Tables & details', title: 'WBS Financial Analysis' },
  { id: 'summary.panel.projectDetails', tab: 'summary', group: 'Summary · Tables & details', title: 'Project Details' },
  { id: 'summary.panel.pendingForPosting', tab: 'summary', group: 'Summary · Tables & details', title: 'Pending for Posting' },
  { id: 'summary.panel.topRiskExposure', tab: 'summary', group: 'Summary · Tables & details', title: 'Top Risk Exposure' },

  // --- Trend Analysis ---
  { id: 'trends.kpis', tab: 'trends', group: 'Trends · KPIs', title: 'KPI Summary Cards' },
  { id: 'trends.chart.costTrend', tab: 'trends', group: 'Trends · Charts', title: 'Project Cost Trend' },
  { id: 'trends.chart.revenueTrend', tab: 'trends', group: 'Trends · Charts', title: 'Project Revenue Trend' },
  { id: 'trends.chart.costVsRevenueGrowth', tab: 'trends', group: 'Trends · Charts', title: 'Cost vs Revenue Growth' },
  { id: 'trends.chart.forecastTrend', tab: 'trends', group: 'Trends · Charts', title: 'Forecast Trend' },
  { id: 'trends.section.costElementAnalysis', tab: 'trends', group: 'Trends · Sections', title: 'Cost Element Analysis' },
  { id: 'trends.section.subcontractorPo', tab: 'trends', group: 'Trends · Sections', title: 'Subcontractor Performance (PO)' },
  { id: 'trends.section.revenueByWbsMatrix', tab: 'trends', group: 'Trends · Sections', title: 'Revenue by WBS & Period' },
  { id: 'trends.section.drilldown', tab: 'trends', group: 'Trends · Sections', title: 'Transaction Drill-down' },
];

// Fail-safe: only an explicit hidden/archived override hides a widget. Unknown or absent
// ids (including a typo'd gate) resolve to visible, so gating can never accidentally hide.
export function isWidgetHidden(layout: DashboardLayout | undefined | null, id: string): boolean {
  const status = layout?.[id];
  return status === 'hidden' || status === 'archived';
}

export function widgetStatus(layout: DashboardLayout | undefined | null, id: string): WidgetStatus {
  return layout?.[id] ?? 'active';
}
