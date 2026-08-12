import type { Gr55CostRow, HistoricalRevenueRow, PoCommitmentRow, ProjectCostElementControl, RevenueWBS } from "@/lib/types";

const REVENUE_GL_CODES = new Set(["400110", "400119", "400210", "400310"]);

export type RevenueForecastBasis = "last1" | "last2" | "last3" | "ytd" | "recommended" | "targetDate" | "monthlyTarget";

export const REVENUE_FORECAST_BASIS_LABELS: Record<RevenueForecastBasis, string> = {
  last1: "Last 1 Month",
  last2: "Last 2 Months Average",
  last3: "Last 3 Months Average",
  ytd: "Current Year Average",
  recommended: "Recommended / Smart Forecast",
  targetDate: "Target Completion Date",
  monthlyTarget: "Monthly Revenue Target",
};

type ForecastTimelinePoint = {
  period: string;
  revenueActual: number | null;
  revenueForecast: number | null;
  costActual: number | null;
  costForecast: number | null;
  isCurrentMonth: boolean;
  isFinalPeriod: boolean;
};

type ForecastMethodComparison = {
  basis: RevenueForecastBasis;
  label: string;
  periods: string[];
  monthlyRunRate: number;
  completionPeriod: string | null;
  available: boolean;
};

type ForecastScenario = {
  name: "Conservative" | "Expected" | "Optimistic";
  monthlyRunRate: number;
  completionPeriod: string | null;
  forecastFinalCost: number;
};

export type ProjectForecast = {
  plannedCost: number;
  actualCost: number;
  remainingBudget: number;
  outstandingCommitments: number;
  eac: number;
  expectedOverrun: number;
  expectedFinalGM: number;
  expectedGMPercent: number | null;
  budgetUtilization: number;
  includedCostElementCount: number;
  currentPeriod: string;
  completedPeriods: string[];
  completionPeriod: string | null;
  timeline: ForecastTimelinePoint[];
  selectedBasis: RevenueForecastBasis;
  recommendedBasis: RevenueForecastBasis;
  recommendationReason: string;
  revenueTrend: "Increasing" | "Stable" | "Decreasing";
  revenueStability: "High Stability" | "Medium Stability" | "High Variation";
  forecastConfidence: "High Confidence" | "Medium Confidence" | "Low Confidence";
  targetDate: string | null;
  monthlyRevenueTarget: number | null;
  targetStatus: string | null;
  targetStatusTone: "success" | "warning" | "danger" | null;
  runRateGap: number;
  runRateGapPercent: number | null;
  methodComparison: ForecastMethodComparison[];
  scenarios: ForecastScenario[];
  revenue: {
    planned: number;
    actualToDate: number;
    remaining: number;
    selectedRunRate: number;
    currentActual: number;
    currentForecast: number;
    futureMonthlyForecast: number;
  };
  cost: {
    eligibleActualForBasis: number;
    costPerRevenue: number | null;
    currentActual: number;
    currentForecast: number;
    futureMonthlyForecast: number;
  };
  categoryBreakdown: Array<{ name: string; actual: number }>;
  notes: string[];
};

function periodFor(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function shiftPeriod(period: string, offset: number) {
  const [year, month] = period.split("-").map(Number);
  return periodFor(new Date(Date.UTC(year, month - 1 + offset, 1)));
}

function normalizeCostElement(value?: string | null) {
  return String(value ?? "").trim().replace(/\s+/g, "");
}

function monthKey(date?: string | null) {
  return date && /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : null;
}

function sumByPeriod(rows: Array<{ posting_date: string; amount: number }>, transform: (amount: number) => number) {
  const result = new Map<string, number>();
  rows.forEach((row) => {
    const period = monthKey(row.posting_date);
    if (!period) return;
    result.set(period, (result.get(period) ?? 0) + transform(Number(row.amount ?? 0)));
  });
  return result;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function deviation(values: number[]) {
  if (values.length < 2) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function periodSeries(currentPeriod: string, basis: RevenueForecastBasis) {
  if (basis === "last1") return [shiftPeriod(currentPeriod, -1)];
  if (basis === "last2") return [-2, -1].map((offset) => shiftPeriod(currentPeriod, offset));
  if (basis === "last3") return [-3, -2, -1].map((offset) => shiftPeriod(currentPeriod, offset));
  const year = currentPeriod.slice(0, 4);
  const lastCompletedMonth = Number(currentPeriod.slice(5, 7)) - 1;
  return Array.from({ length: Math.max(0, lastCompletedMonth) }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
}

function completionForRunRate({ currentPeriod, currentRevenueActual, remainingRevenue, remainingDays, runRate }: { currentPeriod: string; currentRevenueActual: number; remainingRevenue: number; remainingDays: number; runRate: number }) {
  if (remainingRevenue <= 0) return currentPeriod;
  if (runRate <= 0) return null;
  const currentAdditional = Math.min(remainingRevenue, Math.max(0, runRate / (365.25 / 12) * remainingDays));
  let stillToForecast = Math.max(0, remainingRevenue - currentAdditional);
  let period = currentPeriod;
  while (stillToForecast > 0) {
    period = shiftPeriod(period, 1);
    stillToForecast -= runRate;
  }
  return period;
}

export function buildProjectForecast({
  costRows,
  revenueRows,
  gr55Rows,
  historicalRevenueRows,
  poCommitments,
  costElementControl,
  revenueTrend,
  recognizedRevenueToDate,
  selectedBasis = "last3",
  targetCompletionDate,
  monthlyRevenueTarget,
  asOfDate = new Date(),
}: {
  costRows: RevenueWBS[];
  revenueRows: RevenueWBS[];
  gr55Rows: Gr55CostRow[];
  historicalRevenueRows: HistoricalRevenueRow[];
  poCommitments: PoCommitmentRow[];
  costElementControl: ProjectCostElementControl[];
  revenueTrend?: Array<{ period: string; recognizedRevenue: number }>;
  /** Revenue-tab cumulative recognized revenue. This is the authoritative total. */
  recognizedRevenueToDate?: number;
  selectedBasis?: RevenueForecastBasis;
  targetCompletionDate?: string | null;
  monthlyRevenueTarget?: number | null;
  asOfDate?: Date;
}): ProjectForecast {
  const currentPeriod = periodFor(asOfDate);
  const includedCostElements = new Set(costElementControl.filter((control) => control.include_in_cost).map((control) => normalizeCostElement(control.cost_element)));
  const hasControl = costElementControl.length > 0;
  const isRevenueRow = (row: Gr55CostRow) => REVENUE_GL_CODES.has(normalizeCostElement(row.cost_element));
  const includedCostRows = gr55Rows.filter((row) => !isRevenueRow(row) && (!hasControl || includedCostElements.has(normalizeCostElement(row.cost_element))));
  const gr55RevenueRows = gr55Rows.filter(isRevenueRow);
  const costByMonth = sumByPeriod(includedCostRows, (amount) => amount);
  const revenueByMonth = sumByPeriod(gr55RevenueRows, (amount) => -amount);
  historicalRevenueRows.forEach((row) => {
    const period = monthKey(row.posting_date);
    if (!period || period >= "2026-01" || !REVENUE_GL_CODES.has(normalizeCostElement(row.cost_element))) return;
    revenueByMonth.set(period, (revenueByMonth.get(period) ?? 0) + Number(row.amount ?? 0));
  });

  const plannedRevenue = revenueRows.reduce((sum, row) => sum + Number(row.planned_revenue ?? 0), 0);
  const managementCurrentRevenue = revenueTrend?.find((point) => point.period === currentPeriod)?.recognizedRevenue;
  const currentRevenueActual = managementCurrentRevenue ?? (revenueByMonth.get(currentPeriod) ?? 0);
  // Do not rebuild cumulative revenue here. The Revenue tab already owns this
  // calculation (GR55, PM and current-period POC recognition) and is the source
  // of truth used by the dashboard cards.
  const authoritativeRecognizedRevenue = Number.isFinite(recognizedRevenueToDate)
    ? Number(recognizedRevenueToDate)
    : Array.from(revenueByMonth.entries()).filter(([period]) => period < currentPeriod).reduce((sum, [, amount]) => sum + amount, 0) + currentRevenueActual;
  const remainingRevenue = Math.max(0, plannedRevenue - authoritativeRecognizedRevenue);
  const daysInCurrentMonth = new Date(Date.UTC(asOfDate.getUTCFullYear(), asOfDate.getUTCMonth() + 1, 0)).getUTCDate();
  const remainingDays = Math.max(0, daysInCurrentMonth - asOfDate.getUTCDate());

  const lastThreeValues = periodSeries(currentPeriod, "last3").map((period) => revenueByMonth.get(period) ?? 0);
  const lastValue = lastThreeValues.at(-1) ?? 0;
  const previousTwoAverage = average(lastThreeValues.slice(0, 2));
  const recentAverage = average(lastThreeValues);
  const variation = recentAverage > 0 ? deviation(lastThreeValues) / recentAverage : Infinity;
  const revenueTrendDirection: ProjectForecast["revenueTrend"] = lastThreeValues.length < 3 || recentAverage <= 0
    ? "Stable"
    : lastValue >= previousTwoAverage * 1.15 ? "Increasing" : lastValue <= previousTwoAverage * 0.85 ? "Decreasing" : "Stable";
  const revenueStability: ProjectForecast["revenueStability"] = variation <= 0.15 ? "High Stability" : variation <= 0.4 ? "Medium Stability" : "High Variation";
  const sufficientHistory = lastThreeValues.filter((value) => value > 0).length >= 3;
  const forecastConfidence: ProjectForecast["forecastConfidence"] = !sufficientHistory || variation > 0.7 ? "Low Confidence" : variation > 0.4 ? "Medium Confidence" : "High Confidence";
  const recommendedBasis: RevenueForecastBasis = revenueTrendDirection === "Increasing" || revenueTrendDirection === "Decreasing" ? "last1" : "last3";
  const recommendationReason = !sufficientHistory
    ? "Limited positive revenue history is available; review the selected assumption before relying on the forecast."
    : revenueTrendDirection === "Increasing"
      ? "Revenue increased materially in the latest completed month, so the latest month best reflects the current ramp-up."
      : revenueTrendDirection === "Decreasing"
        ? "Revenue reduced materially in the latest completed month, so the latest month reflects the current slowdown."
        : "Revenue is relatively stable over the recent months, so the 3-month average provides the most balanced forecast.";

  const historicalBases: RevenueForecastBasis[] = ["last1", "last2", "last3", "ytd"];
  const methodComparison = historicalBases.map((basis) => {
    const periods = periodSeries(currentPeriod, basis);
    const values = periods.map((period) => revenueByMonth.get(period) ?? 0);
    const available = periods.length > 0 && values.some((value) => value > 0);
    const monthlyRunRate = average(values);
    return { basis, label: REVENUE_FORECAST_BASIS_LABELS[basis], periods, monthlyRunRate, completionPeriod: completionForRunRate({ currentPeriod, currentRevenueActual, remainingRevenue, remainingDays, runRate: monthlyRunRate }), available };
  });
  const performanceMethod = methodComparison.find((method) => method.basis === "last3") ?? methodComparison[2];
  const selectedHistoricalBasis = selectedBasis === "recommended" ? recommendedBasis : historicalBases.includes(selectedBasis) ? selectedBasis : "last3";
  const selectedMethod = methodComparison.find((method) => method.basis === selectedHistoricalBasis) ?? performanceMethod;
  const selectedPeriods = selectedMethod.periods;
  const parsedTargetDate = targetCompletionDate && /^\d{4}-\d{2}-\d{2}$/.test(targetCompletionDate) ? new Date(`${targetCompletionDate}T00:00:00Z`) : null;
  const startOfToday = new Date(Date.UTC(asOfDate.getUTCFullYear(), asOfDate.getUTCMonth(), asOfDate.getUTCDate()));
  const targetMonthsAvailable = parsedTargetDate && parsedTargetDate >= startOfToday ? (parsedTargetDate.getTime() - startOfToday.getTime() + 86400000) / 86400000 / (365.25 / 12) : 0;
  const targetDateRunRate = targetMonthsAvailable > 0 ? remainingRevenue / targetMonthsAvailable : 0;
  const enteredMonthlyTarget = Math.max(0, Number(monthlyRevenueTarget ?? 0));
  const selectedRunRate = selectedBasis === "targetDate" ? targetDateRunRate : selectedBasis === "monthlyTarget" ? enteredMonthlyTarget : selectedMethod.monthlyRunRate;
  const selectedEligibleCost = selectedPeriods.reduce((sum, period) => sum + (costByMonth.get(period) ?? 0), 0);
  const selectedRevenue = selectedPeriods.reduce((sum, period) => sum + (revenueByMonth.get(period) ?? 0), 0);
  const costPerRevenue = selectedRevenue > 0 ? selectedEligibleCost / selectedRevenue : null;

  const currentAdditionalRevenue = selectedBasis === "monthlyTarget"
    ? Math.min(remainingRevenue, Math.max(0, selectedRunRate - currentRevenueActual))
    : Math.min(remainingRevenue, Math.max(0, selectedRunRate / (365.25 / 12) * remainingDays));
  const currentRevenueForecast = currentRevenueActual + currentAdditionalRevenue;
  let revenueStillToForecast = Math.max(0, remainingRevenue - currentAdditionalRevenue);
  const currentCostActual = costByMonth.get(currentPeriod) ?? 0;
  const currentCostForecast = currentCostActual + currentAdditionalRevenue * (costPerRevenue ?? 0);
  const priorActualCost = Array.from(costByMonth.entries()).filter(([period]) => period < currentPeriod).reduce((sum, [, amount]) => sum + amount, 0);
  const actualCost = priorActualCost + currentCostActual;
  const timeline: ForecastTimelinePoint[] = [{ period: currentPeriod, revenueActual: currentRevenueActual, revenueForecast: currentRevenueForecast, costActual: currentCostActual, costForecast: currentCostForecast, isCurrentMonth: true, isFinalPeriod: revenueStillToForecast <= 0 }];
  let futurePeriod = shiftPeriod(currentPeriod, 1);
  while (revenueStillToForecast > 0 && selectedRunRate > 0 && timeline.length < 120) {
    const revenueForecast = Math.min(selectedRunRate, revenueStillToForecast);
    timeline.push({ period: futurePeriod, revenueActual: null, revenueForecast, costActual: null, costForecast: revenueForecast * (costPerRevenue ?? 0), isCurrentMonth: false, isFinalPeriod: revenueForecast >= revenueStillToForecast });
    revenueStillToForecast -= revenueForecast;
    futurePeriod = shiftPeriod(futurePeriod, 1);
  }

  const completionPeriod = selectedBasis === "targetDate" && targetDateRunRate > 0 ? targetCompletionDate!.slice(0, 7) : timeline.find((point) => point.isFinalPeriod)?.period ?? null;
  const futureCostForecast = timeline.filter((point) => !point.isCurrentMonth).reduce((sum, point) => sum + (point.costForecast ?? 0), 0);
  const eac = priorActualCost + currentCostForecast + futureCostForecast;
  const plannedCost = costRows.reduce((sum, row) => sum + Number(row.planned_cost ?? 0), 0);
  const positiveRates = methodComparison.filter((method) => method.available && method.monthlyRunRate > 0).map((method) => method.monthlyRunRate);
  const conservativeRate = positiveRates.length ? Math.min(...positiveRates) : selectedRunRate;
  const optimisticRate = positiveRates.length ? Math.max(...positiveRates) : selectedRunRate;
  const scenarioFor = (name: ForecastScenario["name"], runRate: number): ForecastScenario => {
    const currentAdditional = Math.min(remainingRevenue, Math.max(0, runRate / (365.25 / 12) * remainingDays));
    const futureRevenue = Math.max(0, remainingRevenue - currentAdditional);
    return { name, monthlyRunRate: runRate, completionPeriod: completionForRunRate({ currentPeriod, currentRevenueActual, remainingRevenue, remainingDays, runRate }), forecastFinalCost: priorActualCost + currentCostActual + (currentAdditional + futureRevenue) * (costPerRevenue ?? 0) };
  };
  const scenarios = [
    scenarioFor("Conservative", conservativeRate),
    { name: "Expected" as const, monthlyRunRate: selectedRunRate, completionPeriod, forecastFinalCost: eac },
    scenarioFor("Optimistic", optimisticRate),
  ];
  const threeMonthRate = performanceMethod.monthlyRunRate;
  const runRateGap = selectedRunRate - threeMonthRate;
  const runRateGapPercent = threeMonthRate > 0 ? runRateGap / threeMonthRate * 100 : null;
  const targetStatus = selectedBasis === "targetDate"
    ? !parsedTargetDate || targetMonthsAvailable <= 0 ? "Select a future target date"
      : runRateGapPercent !== null && runRateGapPercent <= -10 ? "Ahead of Required Run Rate"
        : runRateGapPercent !== null && runRateGapPercent <= 5 ? "On Track"
          : runRateGapPercent !== null && runRateGapPercent <= 20 ? "Slightly Below Required Run Rate" : "Significantly Below Required Run Rate"
    : selectedBasis === "monthlyTarget"
      ? enteredMonthlyTarget <= 0 ? "Enter a monthly revenue target"
        : runRateGapPercent !== null && runRateGapPercent <= 5 ? "Easily Achievable"
          : runRateGapPercent !== null && runRateGapPercent <= 15 ? "Achievable"
            : runRateGapPercent !== null && runRateGapPercent <= 35 ? "Challenging" : "Aggressive"
      : null;
  const targetStatusTone: ProjectForecast["targetStatusTone"] = !targetStatus ? null
    : /Ahead|On Track|Easily/.test(targetStatus) ? "success"
      : /Slightly|Achievable|Challenging/.test(targetStatus) ? "warning" : "danger";

  const activeCommitments = poCommitments.filter((row) => String(row.deletion_indicator ?? "").trim().toUpperCase() !== "L");
  const actualByPo = new Map<string, number>();
  includedCostRows.forEach((row) => { const po = String(row.purchasing_document ?? "").trim(); if (po) actualByPo.set(po, (actualByPo.get(po) ?? 0) + Number(row.amount ?? 0)); });
  const provisionByPo = new Map<string, number>();
  activeCommitments.forEach((row) => { const po = String(row.po_number ?? "").trim(); if (po) provisionByPo.set(po, (provisionByPo.get(po) ?? 0) + Number(row.net_order_value ?? 0)); });
  const outstandingCommitments = Array.from(provisionByPo.entries()).reduce((sum, [po, provision]) => sum + Math.max(0, provision - (actualByPo.get(po) ?? 0)), 0);
  const category = new Map<string, number>();
  includedCostRows.forEach((row) => { const name = String(row.cost_category ?? "").trim() || "Other direct cost"; category.set(name, (category.get(name) ?? 0) + Number(row.amount ?? 0)); });
  const notes = [
    `Selected basis: ${REVENUE_FORECAST_BASIS_LABELS[selectedBasis]}${selectedPeriods.length ? `; cost ratio uses ${selectedMethod.label} (${selectedPeriods.join(", ")})` : ""}`,
    `Current-month revenue uses management POC recognition plus ${remainingDays} remaining days at the selected run rate`,
    "Revenue is capped at the remaining planned/contract revenue",
    costPerRevenue === null ? "Cost ratio is unavailable because selected-period revenue is zero or negative" : "Future cost follows the eligible cost-to-revenue ratio from the selected revenue basis",
  ];

  return {
    plannedCost, actualCost, remainingBudget: Math.max(0, plannedCost - actualCost), outstandingCommitments, eac,
    expectedOverrun: Math.max(0, eac - plannedCost), expectedFinalGM: plannedRevenue - eac, expectedGMPercent: plannedRevenue > 0 ? (plannedRevenue - eac) / plannedRevenue * 100 : null, budgetUtilization: plannedCost > 0 ? actualCost / plannedCost * 100 : 0,
    includedCostElementCount: includedCostElements.size, currentPeriod, completedPeriods: selectedPeriods, completionPeriod, timeline,
    selectedBasis, recommendedBasis, recommendationReason, revenueTrend: revenueTrendDirection, revenueStability, forecastConfidence, methodComparison, scenarios,
    targetDate: targetCompletionDate ?? null, monthlyRevenueTarget: selectedBasis === "monthlyTarget" ? enteredMonthlyTarget : null, targetStatus, targetStatusTone, runRateGap, runRateGapPercent,
    revenue: { planned: plannedRevenue, actualToDate: authoritativeRecognizedRevenue, remaining: remainingRevenue, selectedRunRate, currentActual: currentRevenueActual, currentForecast: currentRevenueForecast, futureMonthlyForecast: selectedRunRate },
    cost: { eligibleActualForBasis: selectedEligibleCost, costPerRevenue, currentActual: currentCostActual, currentForecast: currentCostForecast, futureMonthlyForecast: selectedRunRate * (costPerRevenue ?? 0) },
    categoryBreakdown: Array.from(category.entries()).map(([name, actual]) => ({ name, actual })).sort((a, b) => b.actual - a.actual), notes,
  };
}
