// Central registry of every toggleable dashboard visual.
//
// Each chart/card/panel on the project dashboard has a stable id here. The dashboard
// renders a visual only when it is not hidden, so hiding is reversible and no code is
// ever deleted. Visibility overrides are stored per-id in the dashboard layout config
// (see lib/dashboard-layout.ts); anything without an override defaults to visible.

export type DashboardTab = 'summary' | 'trends';
export type WidgetStatus = 'active' | 'hidden' | 'archived';

// Column span out of a 12-col grid — drives width in the reorderable dashboard grid.
export type WidgetSpan = 2 | 4 | 6 | 12;

// id -> status override. Absent id means "use the default" (active).
export type DashboardLayout = Record<string, WidgetStatus>;

export type DashboardWidget = {
  id: string;
  tab: DashboardTab;
  group: string; // grouping label for the Settings panel
  title: string; // human-readable label
  span: WidgetSpan; // native width in the 12-col dashboard grid
};

export const DASHBOARD_WIDGETS: DashboardWidget[] = [
  // --- Financial Summary · Stat cards (narrow: 2/12) ---
  { id: 'summary.card.plannedCost', tab: 'summary', group: 'Summary · Stat cards', title: 'Planned Cost', span: 2 },
  { id: 'summary.card.mgmtActualCost', tab: 'summary', group: 'Summary · Stat cards', title: 'Management Actual Cost', span: 2 },
  { id: 'summary.card.plannedRevenue', tab: 'summary', group: 'Summary · Stat cards', title: 'Planned Revenue', span: 2 },
  { id: 'summary.card.recognizedRevenue', tab: 'summary', group: 'Summary · Stat cards', title: 'Recognized Revenue', span: 2 },
  { id: 'summary.card.forecastMargin', tab: 'summary', group: 'Summary · Stat cards', title: 'Forecast Margin', span: 2 },
  { id: 'summary.card.pocPercent', tab: 'summary', group: 'Summary · Stat cards', title: 'POC %', span: 2 },

  // --- Financial Summary · Panels ---
  { id: 'summary.panel.sapView', tab: 'summary', group: 'Summary · Panels', title: 'SAP View', span: 6 },
  { id: 'summary.panel.managementView', tab: 'summary', group: 'Summary · Panels', title: 'Management View', span: 6 },
  { id: 'summary.panel.projectToDate', tab: 'summary', group: 'Summary · Panels', title: 'Project-to-Date', span: 4 },
  { id: 'summary.panel.ytdPerformance', tab: 'summary', group: 'Summary · Panels', title: 'YTD Performance', span: 4 },
  { id: 'summary.panel.periodRollups', tab: 'summary', group: 'Summary · Panels', title: 'Period Rollups', span: 4 },

  // --- Financial Summary · Charts (half: 6/12) ---
  { id: 'summary.chart.revenueTrend', tab: 'summary', group: 'Summary · Charts', title: 'Revenue Trend', span: 6 },
  { id: 'summary.chart.revenueSplit', tab: 'summary', group: 'Summary · Charts', title: 'Revenue Split', span: 6 },
  { id: 'summary.chart.pocByWbs', tab: 'summary', group: 'Summary · Charts', title: 'POC by WBS', span: 6 },
  { id: 'summary.chart.revenueVsSimulation', tab: 'summary', group: 'Summary · Charts', title: 'Revenue vs Simulation', span: 6 },
  { id: 'summary.chart.costComparison', tab: 'summary', group: 'Summary · Charts', title: 'Cost Comparison', span: 6 },
  { id: 'summary.chart.topWbs', tab: 'summary', group: 'Summary · Charts', title: 'Top WBS by Revenue', span: 6 },

  // --- Financial Summary · Tables & detail panels ---
  { id: 'summary.table.wbsFinancialAnalysis', tab: 'summary', group: 'Summary · Tables & details', title: 'WBS Financial Analysis', span: 12 },
  { id: 'summary.panel.projectDetails', tab: 'summary', group: 'Summary · Tables & details', title: 'Project Details', span: 6 },
  { id: 'summary.panel.pendingForPosting', tab: 'summary', group: 'Summary · Tables & details', title: 'Pending for Posting', span: 6 },
  { id: 'summary.panel.topRiskExposure', tab: 'summary', group: 'Summary · Tables & details', title: 'Top Risk Exposure', span: 12 },

  // --- Trend Analysis ---
  { id: 'trends.kpis', tab: 'trends', group: 'Trends · KPIs', title: 'KPI Summary Cards', span: 12 },
  { id: 'trends.chart.costTrend', tab: 'trends', group: 'Trends · Charts', title: 'Project Cost Trend', span: 6 },
  { id: 'trends.chart.revenueTrend', tab: 'trends', group: 'Trends · Charts', title: 'Project Revenue Trend', span: 6 },
  { id: 'trends.chart.costVsRevenueGrowth', tab: 'trends', group: 'Trends · Charts', title: 'Cost vs Revenue Growth', span: 6 },
  { id: 'trends.chart.forecastTrend', tab: 'trends', group: 'Trends · Charts', title: 'Forecast Trend', span: 6 },
  { id: 'trends.section.costElementAnalysis', tab: 'trends', group: 'Trends · Sections', title: 'Cost Element Analysis', span: 12 },
  { id: 'trends.section.subcontractorPo', tab: 'trends', group: 'Trends · Sections', title: 'Subcontractor Performance (PO)', span: 12 },
  { id: 'trends.section.revenueByWbsMatrix', tab: 'trends', group: 'Trends · Sections', title: 'Revenue by WBS & Period', span: 12 },
  { id: 'trends.section.drilldown', tab: 'trends', group: 'Trends · Sections', title: 'Transaction Drill-down', span: 12 },
];

// The registry-default order for a tab (flat). Kept for backward compat with sanitize logic.
export function defaultOrder(tab: DashboardTab): string[] {
  return DASHBOARD_WIDGETS.filter((w) => w.tab === tab).map((w) => w.id);
}

// Default row-based layout for a tab. Each inner array is a fixed row.
export function defaultRowLayout(tab: DashboardTab): string[][] {
  if (tab === 'summary') {
    return [
      ['summary.card.plannedCost', 'summary.card.mgmtActualCost', 'summary.card.plannedRevenue', 'summary.card.recognizedRevenue', 'summary.card.forecastMargin', 'summary.card.pocPercent'],
      ['summary.panel.sapView', 'summary.panel.managementView'],
      ['summary.panel.projectToDate', 'summary.panel.ytdPerformance', 'summary.panel.periodRollups'],
      ['summary.chart.revenueTrend', 'summary.chart.revenueSplit'],
      ['summary.chart.pocByWbs', 'summary.chart.revenueVsSimulation'],
      ['summary.chart.costComparison', 'summary.chart.topWbs'],
      ['summary.table.wbsFinancialAnalysis'],
      ['summary.panel.projectDetails', 'summary.panel.pendingForPosting'],
      ['summary.panel.topRiskExposure'],
    ];
  }
  if (tab === 'trends') {
    return [
      ['trends.kpis'],
      ['trends.chart.costTrend', 'trends.chart.revenueTrend'],
      ['trends.chart.costVsRevenueGrowth', 'trends.chart.forecastTrend'],
      ['trends.section.costElementAnalysis'],
      ['trends.section.subcontractorPo'],
      ['trends.section.revenueByWbsMatrix'],
      ['trends.section.drilldown'],
    ];
  }
  return [];
}

// Convert a flat id array to a row layout using group boundaries from the registry.
export function flatOrderToRows(ids: string[]): string[][] {
  if (!ids.length) return [];
  const rows: string[][] = [];
  let currentGroup: string | null = null;
  let currentRow: string[] = [];
  for (const id of ids) {
    const w = getWidget(id);
    if (!w) continue;
    const group = w.group;
    if (group !== currentGroup) {
      if (currentRow.length) rows.push(currentRow);
      currentRow = [id];
      currentGroup = group;
    } else {
      currentRow.push(id);
    }
  }
  if (currentRow.length) rows.push(currentRow);
  return rows;
}

const WIDGET_BY_ID = new Map(DASHBOARD_WIDGETS.map((w) => [w.id, w] as const));
export function getWidget(id: string): DashboardWidget | undefined {
  return WIDGET_BY_ID.get(id);
}

// Static Tailwind classes per span (never build col-span-${n} at runtime — Tailwind purges it).
// Cards halve on mobile, everything else stacks full-width; spans honored at md+.
export const SPAN_CLASS: Record<WidgetSpan, string> = {
  2: 'col-span-6 md:col-span-2',
  4: 'col-span-12 md:col-span-4',
  6: 'col-span-12 md:col-span-6',
  12: 'col-span-12',
};

// Fail-safe: only an explicit hidden/archived override hides a widget. Unknown or absent
// ids (including a typo'd gate) resolve to visible, so gating can never accidentally hide.
export function isWidgetHidden(layout: DashboardLayout | undefined | null, id: string): boolean {
  const status = layout?.[id];
  return status === 'hidden' || status === 'archived';
}

export function widgetStatus(layout: DashboardLayout | undefined | null, id: string): WidgetStatus {
  return layout?.[id] ?? 'active';
}
