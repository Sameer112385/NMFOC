import { clampPercent, safeNumber } from '@/lib/utils';
import { isWbsElementObjectType } from '@/lib/cn41';
import type {
  CN41Row,
  DailyUpdate,
  FinancialSummary,
  Gr55CostRow,
  HistoricalRevenueRow,
  RevenueWBS,
  RiskAlert,
  SalesOrderRevenueRow,
  SimulationSnapshot,
} from '@/lib/types';
import { getEffectivePendingCost } from '@/lib/pm-posting';

export function isRevenueGeneratingRow(row: Pick<CN41Row, 'level' | 'object_type'>) {
  return row.level === 3 && isWbsElementObjectType(String(row.object_type ?? ''));
}

export function revenueFromPlan(plannedRevenue: number | null | undefined) {
  return safeNumber(plannedRevenue);
}

export function calculateCostToCostPoc(actualCost: number, plannedCost: number) {
  if (plannedCost <= 0) return 0;
  return clampPercent((actualCost / plannedCost) * 100);
}

export function buildFinancialWbsRow(
  input: {
    projectId: string;
    wbsCode: string;
    wbsDescription: string;
    plannedCost: number;
    plannedRevenue: number;
    actualCostRows?: Gr55CostRow[];
    historicalRevenueRows?: HistoricalRevenueRow[];
    gr55RawRowsForRevenue?: Gr55CostRow[];
    salesOrderRows?: SalesOrderRevenueRow[];
    updates?: DailyUpdate[];
    asOfDate?: string | null;
    reportingWbsLevel?: number | null;
    costCategoryBreakdown?: Record<string, number>;
  },
): RevenueWBS {
  const plannedCost = safeNumber(input.plannedCost);
  const plannedRevenue = safeNumber(input.plannedRevenue);
  const actualRows = input.actualCostRows ?? [];
  const salesRows = input.salesOrderRows ?? [];
  const activeUpdates = input.updates ?? [];
  const pmSimulatedCost = activeUpdates.reduce((sum, item) => sum + getEffectivePendingCost(item), 0);

  // Compute reporting period (current month)
  const currentPeriod = input.asOfDate ? input.asOfDate.slice(0, 7) : ''; // e.g. "2026-07"

  // Helper to extract posted revenue for any specific month
  const getPostedRevenueForMonth = (monthStr: string): number => {
    const isPre2026 = monthStr < '2026-01';
    if (isPre2026) {
      // Historical revenue values are already negated to positive during parsing/ingestion
      return (input.historicalRevenueRows ?? [])
        .filter((row) => {
          const m = row.posting_date ? row.posting_date.slice(0, 7) : '';
          if (m !== monthStr) return false;
          const costEl = String(row.cost_element ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
          return ['400110', '400119', '400210', '400310'].includes(costEl);
        })
        .reduce((sum, row) => sum + safeNumber(row.amount), 0);
    } else {
      // Negate GR55 sum because raw SAP revenue postings are negative (credit)
      const sum = (input.gr55RawRowsForRevenue ?? [])
        .filter((row) => {
          const m = row.posting_date ? row.posting_date.slice(0, 7) : '';
          if (m !== monthStr) return false;
          const costEl = String(row.cost_element ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
          return ['400110', '400119', '400210', '400310'].includes(costEl);
        })
        .reduce((sum, row) => sum + safeNumber(row.amount), 0);
      return -sum;
    }
  };

  // Collect all unique historical months prior to the current period
  const prevMonthsSet = new Set<string>();
  (input.historicalRevenueRows ?? []).forEach((row) => {
    const m = row.posting_date ? row.posting_date.slice(0, 7) : '';
    if (m && m < currentPeriod) prevMonthsSet.add(m);
  });
  (input.gr55RawRowsForRevenue ?? []).forEach((row) => {
    const m = row.posting_date ? row.posting_date.slice(0, 7) : '';
    if (m && m >= '2026-01' && m < currentPeriod) prevMonthsSet.add(m);
  });

  const prevMonthsList = Array.from(prevMonthsSet).sort();
  const cumulativePostedRevenuePrevMonths = prevMonthsList.reduce((sum, month) => sum + getPostedRevenueForMonth(month), 0);

  // Cost-to-cost calculations (actualRows already has revenue GLs excluded)
  const sapActualCostToDate = actualRows.reduce((sum, row) => sum + safeNumber(row.amount), 0);
  const sapMtdActualCost = actualRows
    .filter((row) => isSameMonth(row.posting_date, input.asOfDate))
    .reduce((sum, row) => sum + safeNumber(row.amount), 0);
  const sapYtdActualCost = actualRows
    .filter((row) => isSameYear(row.posting_date, input.asOfDate))
    .reduce((sum, row) => sum + safeNumber(row.amount), 0);

  const mtdPmSimulatedCost = activeUpdates
    .filter((update) => isSameMonth(update.update_date, input.asOfDate))
    .reduce((sum, update) => sum + getEffectivePendingCost(update), 0);
  const ytdPmSimulatedCost = activeUpdates
    .filter((update) => isSameYear(update.update_date, input.asOfDate))
    .reduce((sum, update) => sum + getEffectivePendingCost(update), 0);
  const managementActualCostToDate = sapActualCostToDate + pmSimulatedCost;
  const managementMtdActualCost = sapMtdActualCost + mtdPmSimulatedCost;
  const managementYtdActualCost = sapYtdActualCost + ytdPmSimulatedCost;

  const totalPlannedRevenue = salesRows.reduce(
    (sum, row) => sum + safeNumber(row.planned_revenue) + safeNumber(row.amendment_delta),
    0,
  );

  // POC revenue recognition
  const pocPercent = calculateCostToCostPoc(managementActualCostToDate, plannedCost);
  const sapPocPercent = calculateCostToCostPoc(sapActualCostToDate, plannedCost);

  // Cumulative POC recognized revenues to date
  const recognizedRevenueToDate = (pocPercent / 100) * (totalPlannedRevenue || plannedRevenue);
  const sapRecognizedRevenueToDate = (sapPocPercent / 100) * (totalPlannedRevenue || plannedRevenue);

  // Option A (Cumulative POC Delta): Current Month POC revenue is the delta between cumulative POC revenue and previous months' actual postings
  const currentMonthRevenue = recognizedRevenueToDate - cumulativePostedRevenuePrevMonths;
  const mtdRevenueRecognition = currentMonthRevenue;

  // YTD Revenue: Sum of monthly revenues in the current fiscal year up to and including the current month
  const currentYear = currentPeriod ? currentPeriod.slice(0, 4) : '';
  let ytdRevenueRecognition = 0;
  if (currentYear) {
    const currentMonthInt = currentPeriod ? parseInt(currentPeriod.slice(5, 7), 10) : 0;
    for (let mVal = 1; mVal <= currentMonthInt; mVal++) {
      const monthStr = `${currentYear}-${mVal < 10 ? '0' + mVal : mVal}`;
      if (monthStr < currentPeriod) {
        ytdRevenueRecognition += getPostedRevenueForMonth(monthStr);
      } else if (monthStr === currentPeriod) {
        ytdRevenueRecognition += currentMonthRevenue;
      }
    }
  }

  const forecastCost = managementActualCostToDate;
  const forecastRevenue = recognizedRevenueToDate;
  const remainingRevenue = (totalPlannedRevenue || plannedRevenue) - recognizedRevenueToDate;
  const remainingCost = plannedCost - managementActualCostToDate;
  const forecastMargin = (totalPlannedRevenue || plannedRevenue) - managementActualCostToDate;
  const forecastMarginPercent = (totalPlannedRevenue || plannedRevenue) > 0 ? (forecastMargin / (totalPlannedRevenue || plannedRevenue)) * 100 : 0;
  const mtdMargin = mtdRevenueRecognition - managementMtdActualCost;
  const ytdMargin = ytdRevenueRecognition - managementYtdActualCost;
  const ytdMarginPercent = ytdRevenueRecognition > 0 ? (ytdMargin / ytdRevenueRecognition) * 100 : 0;
  const status =
    managementActualCostToDate > plannedCost
      ? 'Overrun'
      : managementActualCostToDate > 0
        ? 'In Progress'
        : 'Stable';

  const actualCostCategories =
    input.costCategoryBreakdown ??
    actualRows.reduce<Record<string, number>>((acc, row) => {
      const btx = String(row.raw_data_json?.business_transaction || "").toUpperCase();
      const key = btx === "COIE" ? "Material" : (String(row.cost_category ?? 'Unassigned').trim() || 'Unassigned');
      acc[key] = (acc[key] ?? 0) + safeNumber(row.amount);
      return acc;
    }, {});

  return {
    project_id: input.projectId,
    upload_id: null,
    wbs_code: input.wbsCode,
    wbs_description: input.wbsDescription,
    reporting_wbs_level: input.reportingWbsLevel ?? null,
    planned_cost: plannedCost,
    actual_cost_to_date: managementActualCostToDate,
    mtd_actual_cost: managementMtdActualCost,
    ytd_actual_cost: managementYtdActualCost,
    planned_revenue: totalPlannedRevenue || plannedRevenue,
    opening_recognized_revenue: cumulativePostedRevenuePrevMonths,
    recognized_revenue_to_date: recognizedRevenueToDate,
    current_month_revenue_recognition: currentMonthRevenue,
    mtd_revenue_recognition: mtdRevenueRecognition,
    ytd_revenue_recognition: ytdRevenueRecognition,
    remaining_revenue: remainingRevenue,
    remaining_cost: remainingCost,
    forecast_cost: forecastCost,
    forecast_revenue: forecastRevenue,
    forecast_margin: forecastMargin,
    forecast_margin_percent: forecastMarginPercent,
    poc_percent: pocPercent,
    ytd_margin: ytdMargin,
    ytd_margin_percent: ytdMarginPercent,
    mtd_margin: mtdMargin,
    cost_category_breakdown: actualCostCategories,
    last_actual_posting_date: actualRows.length ? latestDate(actualRows.map((row) => row.posting_date)) : null,
    last_sales_order_date: salesRows.length ? latestDate(salesRows.map((row) => row.effective_date ?? null)) : null,
    status,
    sap_actual_cost: sapActualCostToDate,
    sap_planned_cost: plannedCost,
    sap_poc_percent: sapPocPercent,
    prrevpl000: plannedRevenue ? -plannedRevenue : null,
    revenue_value: plannedRevenue,
    sap_earned_revenue: sapRecognizedRevenueToDate,
    pm_pending_cost: pmSimulatedCost,
    simulated_actual_cost: managementActualCostToDate,
    simulated_poc_percent: pocPercent,
    simulated_revenue: recognizedRevenueToDate,
    revenue_difference: recognizedRevenueToDate - sapRecognizedRevenueToDate,
    actual_cost_categories: actualCostCategories,
    reporting_period: input.asOfDate ? input.asOfDate.slice(0, 7) : null,
  };
}

export function buildFinancialSummary(projectId: string, rows: RevenueWBS[]): FinancialSummary {
  const plannedCost = rows.reduce((sum, row) => sum + safeNumber(row.planned_cost), 0);
  const plannedRevenue = rows.reduce((sum, row) => sum + safeNumber(row.planned_revenue), 0);
  const actualCostToDate = rows.reduce((sum, row) => sum + safeNumber(row.actual_cost_to_date), 0);
  const recognizedRevenueToDate = rows.reduce((sum, row) => sum + safeNumber(row.recognized_revenue_to_date), 0);
  const remainingRevenue = rows.reduce((sum, row) => sum + safeNumber(row.remaining_revenue), 0);
  const remainingCost = rows.reduce((sum, row) => sum + safeNumber(row.remaining_cost), 0);
  const forecastMargin = rows.reduce((sum, row) => sum + safeNumber(row.forecast_margin), 0);
  const mtdActualCost = rows.reduce((sum, row) => sum + safeNumber(row.mtd_actual_cost), 0);
  const mtdRevenueRecognition = rows.reduce((sum, row) => sum + safeNumber(row.mtd_revenue_recognition), 0);
  const ytdActualCost = rows.reduce((sum, row) => sum + safeNumber(row.ytd_actual_cost), 0);
  const ytdRevenueRecognition = rows.reduce((sum, row) => sum + safeNumber(row.ytd_revenue_recognition), 0);
  const ytdMargin = rows.reduce((sum, row) => sum + safeNumber(row.ytd_margin), 0);

  return {
    project_id: projectId,
    planned_cost: plannedCost,
    planned_revenue: plannedRevenue,
    actual_cost_to_date: actualCostToDate,
    poc_percent: clampPercent(plannedRevenue > 0 ? (recognizedRevenueToDate / plannedRevenue) * 100 : 0),
    recognized_revenue_to_date: recognizedRevenueToDate,
    remaining_revenue: remainingRevenue,
    remaining_cost: remainingCost,
    forecast_margin: forecastMargin,
    forecast_margin_percent: plannedRevenue > 0 ? (forecastMargin / plannedRevenue) * 100 : 0,
    mtd_actual_cost: mtdActualCost,
    mtd_revenue_recognition: mtdRevenueRecognition,
    mtd_margin: mtdRevenueRecognition - mtdActualCost,
    ytd_actual_cost: ytdActualCost,
    ytd_revenue_recognition: ytdRevenueRecognition,
    ytd_margin: ytdMargin,
    ytd_margin_percent: ytdRevenueRecognition > 0 ? (ytdMargin / ytdRevenueRecognition) * 100 : 0,
  };
}

export function buildRiskAlerts(revenueRows: RevenueWBS[]): RiskAlert[] {
  const risks: RiskAlert[] = [];

  for (const row of revenueRows) {
    const actualOverPlanned = row.actual_cost_to_date > row.planned_cost && row.planned_cost > 0;
    const plannedZeroActualPositive = row.planned_cost === 0 && row.actual_cost_to_date > 0;
    const missingRevenue = row.planned_revenue <= 0;
    const pendingPosted = row.pm_pending_cost > 0;
    const simHigherThanRecognized = row.simulated_revenue > row.sap_earned_revenue;
    const missingPlanned = row.planned_cost <= 0;
    const negativePlan = row.planned_cost < 0;

    if (actualOverPlanned) {
      risks.push(makeRisk(row, 'Actual cost above planned cost', 'Cost overrun on cost-to-cost baseline', row.actual_cost_to_date - row.planned_cost, 'High', 'Review cost drivers and update forecast.'));
    }
    if (plannedZeroActualPositive) {
      risks.push(makeRisk(row, 'Planned cost is zero', 'Cost exists but no planned cost was loaded', row.actual_cost_to_date, 'High', 'Validate the CN41 planned-cost source.'));
    }
    if (missingRevenue) {
      risks.push(makeRisk(row, 'Missing planned revenue', 'Sales order planned revenue is missing', 0, 'High', 'Check the sales order import and WBS mapping.'));
    }
    if (pendingPosted) {
      risks.push(makeRisk(row, 'PM pending cost not posted', 'Daily update includes cost not yet in forecast', row.pm_pending_cost, 'Medium', 'Follow up with PM and posting owner.'));
    }
    if (simHigherThanRecognized) {
      risks.push(makeRisk(row, 'Forecast revenue exceeds recognized revenue', 'Forecasted revenue is higher than current recognized revenue', row.simulated_revenue - row.sap_earned_revenue, 'Medium', 'Validate progress assumptions and review pending costs.'));
    }
    if (missingPlanned) {
      risks.push(makeRisk(row, 'Missing planned cost', 'Reporting WBS lacks planned cost data', row.planned_cost, 'High', 'Complete planning or exclude from forecast.'));
    }
    if (negativePlan) {
      risks.push(makeRisk(row, 'Negative planned cost', 'Planned cost should not be negative', row.planned_cost, 'High', 'Fix the planned-cost baseline mapping.'));
    }
  }

  return risks;
}

export function createSnapshot(projectId: string, rows: RevenueWBS[]): SimulationSnapshot {
  return {
    project_id: projectId,
    upload_id: null,
    snapshot_date: new Date().toISOString(),
    total_sap_actual_cost: rows.reduce((sum, row) => sum + row.actual_cost_to_date, 0),
    total_sap_revenue: rows.reduce((sum, row) => sum + row.sap_earned_revenue, 0),
    total_pm_pending_cost: rows.reduce((sum, row) => sum + row.pm_pending_cost, 0),
    total_simulated_actual_cost: rows.reduce((sum, row) => sum + row.forecast_cost, 0),
    total_simulated_revenue: rows.reduce((sum, row) => sum + row.forecast_revenue, 0),
  };
}

function makeRisk(
  row: RevenueWBS,
  riskType: string,
  description: string,
  amount: number,
  severity: 'High' | 'Medium' | 'Low',
  suggestedAction: string,
): RiskAlert {
  return {
    project_id: row.project_id,
    wbs_code: row.wbs_code,
    risk_type: riskType,
    risk_description: description,
    amount,
    severity,
    suggested_action: suggestedAction,
    status: 'Open',
  };
}

function calculateCostToDatePoc(actualCost: number, plannedCost: number) {
  return calculateCostToCostPoc(actualCost, plannedCost);
}

function calculateRecognizedRevenue(actualCost: number, plannedCost: number, plannedRevenue: number) {
  if (plannedCost <= 0 || plannedRevenue <= 0) return 0;
  return (calculateCostToCostPoc(actualCost, plannedCost) / 100) * plannedRevenue;
}

function latestDate(values: Array<string | null | undefined>) {
  const filtered = values.filter(Boolean) as string[];
  if (!filtered.length) return null;
  return filtered.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
}

function normalizeDate(value?: string | null) {
  const raw = String(value ?? '').trim();
  return raw ? raw.slice(0, 10) : '';
}

function isSameMonth(a?: string | null, b?: string | null) {
  const left = normalizeDate(a);
  const right = normalizeDate(b);
  if (!left || !right) return false;
  return left.slice(0, 7) === right.slice(0, 7);
}

function isSameYear(a?: string | null, b?: string | null) {
  const left = normalizeDate(a);
  const right = normalizeDate(b);
  if (!left || !right) return false;
  return left.slice(0, 4) === right.slice(0, 4);
}

function isBeforeMonth(a?: string | null, b?: string | null) {
  const left = normalizeDate(a);
  const right = normalizeDate(b);
  if (!left || !right) return false;
  return left.slice(0, 7) < right.slice(0, 7);
}
