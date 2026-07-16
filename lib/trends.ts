import type { Gr55CostRow, HistoricalRevenueRow, DailyUpdate, ProjectWbsMaster, ProjectCostElementControl, RevenueWBS } from '@/lib/types';
import { getEffectivePendingCost } from '@/lib/pm-posting';

export interface TrendDataPoint {
  period: string; // "YYYY-MM", "YYYY-Q#", or "YYYY"
  actualCost: number; // period actual cost (non-cumulative)
  cumulativeActualCost: number; // cumulative actual cost
  recognizedRevenue: number; // period recognized revenue (non-cumulative)
  cumulativeRecognizedRevenue: number; // cumulative recognized revenue
  forecastCost: number; // period forecast cost (non-cumulative)
  cumulativeForecastCost: number; // cumulative forecast cost
  forecastRevenue: number; // period forecast revenue (non-cumulative)
  cumulativeForecastRevenue: number; // cumulative forecast revenue
  plannedCost: number; // constant or cumulative planned cost
  plannedRevenue: number; // constant or cumulative planned revenue
  costGrowthPercent: number; // growth compared to previous period
  revenueGrowthPercent: number; // growth compared to previous period
  /**
   * Per-WBS decomposition of this period's revenue, keyed by NORMALIZED wbs code.
   *   past periods   : actual POSTED revenue for that WBS
   *   current period : POC accrual minus that WBS's cumulative prior postings
   *
   * INVARIANT: sum(wbsRevenue.values()) === recognizedRevenue === forecastRevenue
   * recognized and forecast share one map because their formulas are currently
   * identical in both branches. If they ever diverge this must split into two maps.
   */
  wbsRevenue: Map<string, number>;
}

// Normalize WBS code helper
export function normalizeCode(code: string) {
  return code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function resolveWbsCode(revenueWbsId: string | null | undefined, costRows: RevenueWBS[]) {
  const cleanId = String(revenueWbsId ?? '').trim();
  if (!cleanId) return '';

  const matchById = costRows.find((r) => r.id === cleanId);
  if (matchById) return matchById.wbs_code;

  const matchByCode = costRows.find((r) => r.wbs_code === cleanId);
  if (matchByCode) return matchByCode.wbs_code;

  const normId = normalizeCode(cleanId);
  const matchByNorm = costRows.find((r) => normalizeCode(r.wbs_code) === normId);
  if (matchByNorm) return matchByNorm.wbs_code;

  return cleanId;
}

function findActiveWbsPrefix(normalizedCode: string, activeWbsCodes: string[]) {
  for (const activeCode of activeWbsCodes) {
    if (normalizedCode.startsWith(activeCode)) {
      return activeCode;
    }
  }
  return null;
}

// Normalize Cost Element helper
function normalizeCostElement(code: string) {
  return code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

// SAP GL accounts that carry billed revenue rather than cost
const REVENUE_GL_CODES = ['400110', '400119', '400210', '400310'];

// Helper to determine if a cost element is included
function isCostElementIncluded(costElement: string, controlList: ProjectCostElementControl[]) {
  if (!controlList.length) return true;
  const key = normalizeCostElement(costElement);
  const control = controlList.find((c) => normalizeCostElement(c.cost_element) === key);
  return control ? control.include_in_cost !== false : true;
}

// Date helpers
function getMonthKey(dateStr: string): string {
  const clean = dateStr.trim().slice(0, 10);
  return clean.slice(0, 7); // "YYYY-MM"
}

function getQuarterKey(dateStr: string): string {
  const clean = dateStr.trim().slice(0, 10);
  const year = clean.slice(0, 4);
  const month = parseInt(clean.slice(5, 7), 10);
  if (isNaN(month)) return `${year}-Q1`;
  const quarter = Math.ceil(month / 3);
  return `${year}-Q${quarter}`;
}

function getYearKey(dateStr: string): string {
  return dateStr.trim().slice(0, 4); // "YYYY"
}

export function buildTrendData(params: {
  projectId: string;
  costRows: RevenueWBS[]; // from revenue_wbs (for Planned Cost and Planned Revenue)
  gr55Rows: Gr55CostRow[]; // raw/summary SAP postings
  historicalRevenueRows?: HistoricalRevenueRow[]; // raw pre-2026 revenue rows
  updates: DailyUpdate[]; // PM daily updates
  wbsMaster: ProjectWbsMaster[];
  costElementControl: ProjectCostElementControl[];
  filterWbsCodes?: string[]; // e.g. ["P.260840.01", "P.260840.02"]
  periodType: 'month' | 'quarter' | 'year';
  selectedPos?: string[];
}): TrendDataPoint[] {
  const { costRows, gr55Rows, historicalRevenueRows = [], updates, wbsMaster, costElementControl, filterWbsCodes, periodType, selectedPos } = params;

  // Create lookup maps for WBS rules
  const wbsMasterMap = new Map(wbsMaster.map((w) => [normalizeCode(w.wbs_code), w]));

  // Helper to check if a WBS starts with any of the selected filter WBS codes
  const isMatchingFilter = (wbsCode: string) => {
    if (!filterWbsCodes || filterWbsCodes.length === 0) return true;
    const targetNorms = filterWbsCodes.map((f) => normalizeCode(f));
    const codeNorm = normalizeCode(wbsCode);
    return targetNorms.some((targetNorm) => codeNorm.startsWith(targetNorm));
  };

  // Determine WBS codes matching the selected POs (if any selected)
  const wbsCodesForSelectedPo = (() => {
    if (!selectedPos || selectedPos.length === 0) return null;
    const codes = new Set<string>();
    gr55Rows.forEach((r) => {
      const pd = String(r.purchasing_document || "").trim();
      if (selectedPos.includes(pd)) {
        codes.add(normalizeCode(r.wbs_code));
      }
    });
    return codes;
  })();

  const isMatchingPo = (wbsCode: string) => {
    if (!wbsCodesForSelectedPo) return true;
    const norm = normalizeCode(wbsCode);
    return wbsCodesForSelectedPo.has(norm);
  };

  const hasWbsMaster = wbsMaster.length > 0;

  // 1. Identify active cost-included WBS elements
  const activeCostWbs = costRows.filter((row) => {
    const norm = normalizeCode(row.wbs_code);
    const config = wbsMasterMap.get(norm);
    if (hasWbsMaster && !config) return false;
    const includeInCost = config ? config.include_in_cost !== false : true;
    const isActive = config ? config.is_active !== false : true;
    return isActive && includeInCost && isMatchingFilter(row.wbs_code) && isMatchingPo(row.wbs_code);
  });

  // 2. Identify active revenue-generating WBS elements
  const activeRevenueWbs = costRows.filter((row) => {
    const norm = normalizeCode(row.wbs_code);
    const config = wbsMasterMap.get(norm);
    if (hasWbsMaster && !config) return false;
    const isRevGen = config ? config.is_revenue_generating === true : row.planned_revenue > 0;
    const isActive = config ? config.is_active !== false : true;
    return isActive && isRevGen && isMatchingFilter(row.wbs_code) && isMatchingPo(row.wbs_code);
  });

  const costWbsCodes = new Set(activeCostWbs.map((w) => normalizeCode(w.wbs_code)));
  const revWbsCodes = new Set(activeRevenueWbs.map((w) => normalizeCode(w.wbs_code)));

  const allActiveWbsNorms = Array.from(new Set([
    ...activeCostWbs.map((w) => normalizeCode(w.wbs_code)),
    ...activeRevenueWbs.map((w) => normalizeCode(w.wbs_code)),
  ])).sort((a, b) => b.length - a.length);

  // Filter raw SAP GR55 rows (apply WBS active/include_in_cost settings, Cost Element inclusion, and selected PO)
  let filteredGr55 = gr55Rows.filter((row) => {
    const code = normalizeCode(row.wbs_code);
    const config = wbsMasterMap.get(code);
    if (hasWbsMaster && !config) return false;
    const includeInCost = config ? config.include_in_cost !== false : true;
    const isActive = config ? config.is_active !== false : true;
    
    if (isActive === false || includeInCost === false) return false;
    
    // Exclude designated revenue GLs from cost calculations
    const costEl = normalizeCostElement(String(row.cost_element ?? '').trim());
    if (['400110', '400119', '400210', '400310'].includes(costEl)) return false;

    if (!isCostElementIncluded(row.cost_element ?? '', costElementControl)) return false;
    if (selectedPos && selectedPos.length > 0 && !selectedPos.includes(String(row.purchasing_document || "").trim())) return false;
    
    // Check if matching filtered WBS codes
    return isMatchingFilter(row.wbs_code);
  });

  // Filter PM updates (apply WBS matching and PO filter)
  let filteredUpdates = updates.filter((update) => {
    const code = resolveWbsCode(update.revenue_wbs_id, costRows);
    const norm = normalizeCode(code);
    const config = wbsMasterMap.get(norm);
    if (hasWbsMaster && !config) return false;
    const includeInCost = config ? config.include_in_cost !== false : true;
    const isActive = config ? config.is_active !== false : true;
    if (isActive === false || includeInCost === false) return false;
    return isMatchingFilter(code) && isMatchingPo(code);
  });

  // Planned totals for baseline reference
  const plannedCost = activeCostWbs.reduce((sum, row) => sum + (row.planned_cost ?? 0), 0);
  const plannedRevenue = activeRevenueWbs.reduce((sum, row) => sum + (row.planned_revenue ?? 0), 0);

  // 3. Establish timeline boundaries
  const dates: string[] = [];
  filteredGr55.forEach((row) => {
    if (row.posting_date) dates.push(row.posting_date);
  });
  historicalRevenueRows.forEach((row) => {
    if (row.posting_date) dates.push(row.posting_date);
  });
  gr55Rows.forEach((row) => {
    // Include posting dates for revenue GLs too
    const costEl = normalizeCostElement(String(row.cost_element ?? '').trim());
    if (['400110', '400119', '400210', '400310'].includes(costEl) && row.posting_date) {
      dates.push(row.posting_date);
    }
  });
  filteredUpdates.forEach((up) => {
    if (up.update_date) dates.push(up.update_date);
  });

  if (!dates.length) {
    return [];
  }

  dates.sort();
  const minDate = dates[0]!;
  const maxDate = dates[dates.length - 1]!;

  // Generate period keys
  const periodKeys: string[] = [];
  const getPeriodKey = {
    month: getMonthKey,
    quarter: getQuarterKey,
    year: getYearKey,
  }[periodType];

  const minYear = parseInt(minDate.slice(0, 4), 10);
  const maxYear = parseInt(maxDate.slice(0, 4), 10);

  if (periodType === 'month') {
    const minMonth = parseInt(minDate.slice(5, 7), 10);
    const maxMonth = parseInt(maxDate.slice(5, 7), 10);
    let currYear = minYear;
    let currMonth = minMonth;

    while (currYear < maxYear || (currYear === maxYear && currMonth <= maxMonth)) {
      const monthStr = currMonth < 10 ? `0${currMonth}` : `${currMonth}`;
      periodKeys.push(`${currYear}-${monthStr}`);
      currMonth++;
      if (currMonth > 12) {
        currMonth = 1;
        currYear++;
      }
    }
  } else if (periodType === 'quarter') {
    const minMonth = parseInt(minDate.slice(5, 7), 10);
    const maxMonth = parseInt(maxDate.slice(5, 7), 10);
    const minQ = Math.ceil(minMonth / 3);
    const maxQ = Math.ceil(maxMonth / 3);
    let currYear = minYear;
    let currQ = minQ;

    while (currYear < maxYear || (currYear === maxYear && currQ <= maxQ)) {
      periodKeys.push(`${currYear}-Q${currQ}`);
      currQ++;
      if (currQ > 4) {
        currQ = 1;
        currYear++;
      }
    }
  } else {
    for (let y = minYear; y <= maxYear; y++) {
      periodKeys.push(`${y}`);
    }
  }

  // 4. Tracking cumulative actuals and pending PM updates per WBS element
  const wbsActualCostMap = new Map<string, number>(); // WBS code -> cumulative actual cost
  const wbsPendingCostMap = new Map<string, number>(); // WBS code -> cumulative pending cost

  const trendData: TrendDataPoint[] = [];
  let prevCumulativeActualCost = 0;
  let prevCumulativeRecognizedRevenue = 0;
  let prevCumulativeForecastCost = 0;
  let prevCumulativeForecastRevenue = 0;

  // Cumulative posted revenue per normalized WBS across every period BEFORE the current one.
  // Partitions prevCumulativeRecognizedRevenue exactly, which is what lets the current
  // period's per-WBS accrual be derived as (POC revenue - that WBS's prior postings).
  const priorPostedByWbs = new Map<string, number>();

  // Posted revenue indexed as period -> (normalized WBS -> amount). Built in a single pass:
  // the previous implementation re-filtered every gr55 row once per period, which is
  // O(periods x rows) and scans the whole dataset ~37 times at monthly granularity.
  const postedRevenueByPeriodWbs = new Map<string, Map<string, number>>();

  const isRevenueGl = (row: { cost_element?: string | null }) =>
    REVENUE_GL_CODES.includes(normalizeCostElement(String(row.cost_element ?? '').trim()));

  const addPostedRevenue = (periodKey: string, rawWbsCode: string, amount: number) => {
    if (!amount) return;
    const norm = normalizeCode(String(rawWbsCode ?? ''));
    // Roll up to the owning active WBS so posted rows line up with the POC rows below.
    // The `?? norm` fallback is load-bearing: it guarantees no posting is ever dropped,
    // which is what keeps sum(wbsRevenue) === recognizedRevenue for every period.
    const key = findActiveWbsPrefix(norm, allActiveWbsNorms) ?? norm;
    let inner = postedRevenueByPeriodWbs.get(periodKey);
    if (!inner) {
      inner = new Map<string, number>();
      postedRevenueByPeriodWbs.set(periodKey, inner);
    }
    inner.set(key, (inner.get(key) ?? 0) + amount);
  };

  (historicalRevenueRows ?? []).forEach((row) => {
    if (!row.posting_date) return;
    if (row.posting_date.slice(0, 7) >= '2026-01') return; // Pre-2026 only
    if (!isMatchingFilter(row.wbs_code) || !isMatchingPo(row.wbs_code)) return;
    if (!isRevenueGl(row)) return;
    addPostedRevenue(getPeriodKey(row.posting_date), row.wbs_code, Number(row.amount || 0));
  });

  gr55Rows.forEach((row) => {
    if (!row.posting_date) return;
    if (row.posting_date.slice(0, 7) < '2026-01') return; // Post-2026 only
    if (!isMatchingFilter(row.wbs_code) || !isMatchingPo(row.wbs_code)) return;
    if (!isRevenueGl(row)) return;
    // Negate: raw SAP actuals are stored as credit (negative) values in the database
    addPostedRevenue(getPeriodKey(row.posting_date), row.wbs_code, -Number(row.amount || 0));
  });

  // Helper to extract posted revenue for a specific period key
  const getPostedRevenueForPeriod = (periodKey: string): number => {
    let sum = 0;
    postedRevenueByPeriodWbs.get(periodKey)?.forEach((value) => {
      sum += value;
    });
    return sum;
  };

  const currentPeriod = periodKeys[periodKeys.length - 1]!;

  for (let i = 0; i < periodKeys.length; i++) {
    const p = periodKeys[i]!;

    // Find actual cost postings for this period
    const periodGr55 = filteredGr55.filter((row) => getPeriodKey(row.posting_date) === p);
    periodGr55.forEach((row) => {
      const code = normalizeCode(row.wbs_code);
      const activeWbsNorm = findActiveWbsPrefix(code, allActiveWbsNorms);
      if (activeWbsNorm) {
        const existing = wbsActualCostMap.get(activeWbsNorm) || 0;
        wbsActualCostMap.set(activeWbsNorm, existing + Number(row.amount || 0));
      }
    });

    const periodUpdates = filteredUpdates.filter((up) => getPeriodKey(up.update_date) === p);
    periodUpdates.forEach((up) => {
      const code = normalizeCode(resolveWbsCode(up.revenue_wbs_id, costRows));
      const activeWbsNorm = findActiveWbsPrefix(code, allActiveWbsNorms);
      if (activeWbsNorm) {
        const existing = wbsPendingCostMap.get(activeWbsNorm) || 0;
        wbsPendingCostMap.set(activeWbsNorm, existing + getEffectivePendingCost(up));
      }
    });

    // Compute cumulative cost at period end (across all active cost WBS elements)
    let cumulativeActualCost = 0;
    let cumulativeForecastCost = 0;

    activeCostWbs.forEach((row) => {
      const norm = normalizeCode(row.wbs_code);
      const actual = wbsActualCostMap.get(norm) || 0;
      const pending = wbsPendingCostMap.get(norm) || 0;

      cumulativeActualCost += (actual + pending);
      cumulativeForecastCost += (actual + pending);
    });

    let cumulativeRecognizedRevenue = 0;
    let cumulativeForecastRevenue = 0;
    let recognizedRevenue = 0;
    let forecastRevenue = 0;
    const wbsRevenue = new Map<string, number>();

    if (p < currentPeriod) {
      // Historical period: Revenue is sum of postings for that period
      postedRevenueByPeriodWbs.get(p)?.forEach((value, norm) => {
        wbsRevenue.set(norm, value);
      });
      recognizedRevenue = getPostedRevenueForPeriod(p);
      forecastRevenue = recognizedRevenue;
      cumulativeRecognizedRevenue = prevCumulativeRecognizedRevenue + recognizedRevenue;
      cumulativeForecastRevenue = prevCumulativeForecastRevenue + forecastRevenue;
    } else {
      // Current Period (Current Month): Revenue is calculated using the POC method
      const pocRevenueByWbs = new Map<string, number>();

      activeRevenueWbs.forEach((row) => {
        const norm = normalizeCode(row.wbs_code);
        const actual = wbsActualCostMap.get(norm) || 0;
        const pending = wbsPendingCostMap.get(norm) || 0;

        const plannedCostWbs = row.planned_cost;
        const plannedRevenueWbs = row.planned_revenue;

        const poc = plannedCostWbs > 0 ? Math.min(100, ((actual + pending) / plannedCostWbs) * 100) : 0;
        const recognized = (poc / 100) * plannedRevenueWbs;
        cumulativeRecognizedRevenue += recognized;
        // Accumulate rather than set: if two costRows normalize to the same code the
        // cumulative total above counts both, so the breakdown must too.
        pocRevenueByWbs.set(norm, (pocRevenueByWbs.get(norm) ?? 0) + recognized);

        const forecastPoc = plannedCostWbs > 0 ? Math.min(100, ((actual + pending) / plannedCostWbs) * 100) : 0;
        const forecastRecognized = (forecastPoc / 100) * plannedRevenueWbs;
        cumulativeForecastRevenue += forecastRecognized;
      });

      // In-period revenue per WBS = its cumulative POC revenue less what it already billed.
      // Union the key sets so a WBS with prior postings but no POC row still surfaces as a
      // negative reversal instead of silently unbalancing the column.
      const norms = new Set<string>([...pocRevenueByWbs.keys(), ...priorPostedByWbs.keys()]);
      norms.forEach((norm) => {
        wbsRevenue.set(norm, (pocRevenueByWbs.get(norm) ?? 0) - (priorPostedByWbs.get(norm) ?? 0));
      });

      recognizedRevenue = cumulativeRecognizedRevenue - prevCumulativeRecognizedRevenue;
      forecastRevenue = cumulativeForecastRevenue - prevCumulativeForecastRevenue;
    }

    // Extract periodic values for cost
    const actualCost = cumulativeActualCost - prevCumulativeActualCost;
    const forecastCost = cumulativeForecastCost - prevCumulativeForecastCost;

    // Period growths
    let costGrowthPercent = 0;
    let revenueGrowthPercent = 0;

    if (i > 0) {
      const prevPoint = trendData[i - 1]!;
      if (prevPoint.actualCost > 0) {
        costGrowthPercent = ((actualCost - prevPoint.actualCost) / prevPoint.actualCost) * 100;
      } else if (actualCost > 0) {
        costGrowthPercent = 100;
      }

      if (prevPoint.recognizedRevenue > 0) {
        revenueGrowthPercent = ((recognizedRevenue - prevPoint.recognizedRevenue) / prevPoint.recognizedRevenue) * 100;
      } else if (recognizedRevenue > 0) {
        revenueGrowthPercent = 100;
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      let breakdownSum = 0;
      wbsRevenue.forEach((value) => {
        breakdownSum += value;
      });
      if (Math.abs(breakdownSum - recognizedRevenue) > 0.01) {
        console.warn(
          `[trends] wbsRevenue decomposition does not partition the period total @ ${p}: ` +
            `breakdown=${breakdownSum} vs recognized=${recognizedRevenue}`,
        );
      }
    }

    trendData.push({
      period: p,
      actualCost,
      cumulativeActualCost,
      recognizedRevenue,
      cumulativeRecognizedRevenue,
      forecastCost,
      cumulativeForecastCost,
      forecastRevenue,
      cumulativeForecastRevenue,
      plannedCost,
      plannedRevenue,
      costGrowthPercent,
      revenueGrowthPercent,
      wbsRevenue,
    });

    // Past periods feed the prior-postings baseline that the current period subtracts.
    if (p < currentPeriod) {
      wbsRevenue.forEach((value, norm) => {
        priorPostedByWbs.set(norm, (priorPostedByWbs.get(norm) ?? 0) + value);
      });
    }

    prevCumulativeActualCost = cumulativeActualCost;
    prevCumulativeRecognizedRevenue = cumulativeRecognizedRevenue;
    prevCumulativeForecastCost = cumulativeForecastCost;
    prevCumulativeForecastRevenue = cumulativeForecastRevenue;
  }

  return trendData;
}
