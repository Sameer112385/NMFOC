import type { CN41Row, DailyUpdate, Gr55CostRow, ProjectCostElementControl, ProjectWbsMaster, RevenueWBS, SalesOrderRevenueRow } from '@/lib/types';
import { buildFinancialWbsRow } from '@/lib/calculations';
import { isWbsElementObjectType } from '@/lib/cn41';
import { safeNumber } from '@/lib/utils';

type BuildFinancialRowsInput = {
  projectId: string;
  cn41Rows: CN41Row[];
  gr55Rows: Gr55CostRow[];
  salesOrderRows: SalesOrderRevenueRow[];
  updates: DailyUpdate[];
  existingRows?: RevenueWBS[];
  projectWbsMaster?: ProjectWbsMaster[];
  projectCostElements?: ProjectCostElementControl[];
};

export function buildFinancialRowsFromSources({
  projectId,
  cn41Rows,
  gr55Rows,
  salesOrderRows,
  updates,
  existingRows = [],
  projectWbsMaster = [],
  projectCostElements = [],
}: BuildFinancialRowsInput): RevenueWBS[] {
  const previousCodeToId = new Map(
    existingRows.map((row) => [normalizeCode(row.wbs_code), row.id] as const).filter(([, id]) => Boolean(id)),
  );
  const previousIdToCode = new Map(
    existingRows.map((row) => [String(row.id ?? '').trim(), normalizeCode(row.wbs_code)] as const).filter(([id]) => Boolean(id)),
  );

  const masterMap = new Map(
    projectWbsMaster.map((row) => [normalizeCode(String(row.wbs_code ?? '').trim()), row] as const).filter(([code]) => Boolean(code)),
  );
  const hasWbsMaster = projectWbsMaster.length > 0;
  const costElementMap = new Map(
    projectCostElements
      .map((row) => [normalizeCostElement(String(row.cost_element ?? '').trim()), row] as const)
      .filter(([code]) => Boolean(code)),
  );

  const plannedCostMap = new Map<
    string,
    { wbs_code: string; wbs_description: string; level?: number | null; planned_cost: number }
  >();
  for (const row of cn41Rows) {
    const displayCode = String(row.wbs_code ?? '').trim();
    const code = normalizeCode(displayCode);
    if (!code) continue;
    if (!isWbsElementObjectType(String(row.object_type ?? ''))) continue;
    const config = masterMap.get(code);
    if (hasWbsMaster) {
      if (!config || config.is_active === false || config.include_in_cost === false) continue;
    } else if (config && config.is_active === false) {
      continue;
    }
    const existing = plannedCostMap.get(code);
    plannedCostMap.set(code, {
      wbs_code: existing?.wbs_code || displayCode,
      wbs_description: existing?.wbs_description || String(row.wbs_description ?? '').trim(),
      level: existing?.level ?? (safeNumber(row.level) || null),
      planned_cost: (existing?.planned_cost ?? 0) + safeNumber(row.planned_cost),
    });
  }

  const actualByCode = groupByCode(
    gr55Rows.filter((row) => {
      const code = normalizeCode(String(row.wbs_code ?? '').trim());
      const config = masterMap.get(code);
      if (hasWbsMaster) {
        if (!config || config.is_active === false || config.include_in_cost === false) return false;
      } else if (config && config.is_active === false) {
        return false;
      }
      if (!isCostElementIncluded(row, costElementMap)) return false;
      return true;
    }),
    (row) => row.wbs_code,
  );
  const salesByCode = groupByCode(
    salesOrderRows.filter((row) => {
      const code = normalizeCode(String(row.wbs_code ?? '').trim());
      const config = masterMap.get(code);
      if (hasWbsMaster) {
        if (config?.is_active === false) return false;
      } else if (config && config.is_active === false) {
        return false;
      }
      return true;
    }),
    (row) => row.wbs_code,
  );
  const codes = new Set<string>([
    ...plannedCostMap.keys(),
    ...actualByCode.keys(),
    ...salesByCode.keys(),
    ...projectWbsMaster.map((row) => normalizeCode(String(row.wbs_code ?? '').trim())),
    ...updates.map((update) => resolveUpdateWbsCode(update.revenue_wbs_id, previousIdToCode)),
  ]);

  return [...codes]
    .filter(Boolean)
    .map((code) => {
      const config = masterMap.get(code);
      const planned = plannedCostMap.get(code);
      const actualRows = actualByCode.get(code) ?? [];
      const salesRows = salesByCode.get(code) ?? [];
      const configDisplayCode = String(config?.wbs_code ?? '').trim();
      const salesDisplayCode = String(salesRows[0]?.wbs_code ?? '').trim();
      const actualDisplayCode = String(actualRows[0]?.wbs_code ?? '').trim();
      const displayCode = planned?.wbs_code || configDisplayCode || salesDisplayCode || actualDisplayCode || code;
      const relatedUpdates = updates.filter((update) => resolveUpdateWbsCode(update.revenue_wbs_id, previousIdToCode) === code);
      const asOfDate = latestDate([
        ...actualRows.map((row) => row.posting_date),
        ...salesRows.map((row) => row.effective_date ?? null),
        ...relatedUpdates.map((update) => update.update_date),
      ]);
      const isActive = config ? config.is_active !== false : true;
      if (!isActive) return null;

      const includeInCost = hasWbsMaster
        ? Boolean(config?.include_in_cost && config?.is_active !== false)
        : config
          ? config.include_in_cost !== false
          : true;

      const isRevenueGenerating = hasWbsMaster
        ? Boolean(config?.is_active !== false && config?.is_revenue_generating)
        : config
          ? config.is_revenue_generating !== false
          : salesRows.length > 0;

      if (!includeInCost && !isRevenueGenerating) return null;

      return buildFinancialWbsRow({
        projectId,
        wbsCode: displayCode,
        wbsDescription: planned?.wbs_description ?? config?.wbs_description ?? salesRows[0]?.wbs_description ?? '',
        plannedCost: includeInCost && isActive ? planned?.planned_cost ?? 0 : 0,
        plannedRevenue: isRevenueGenerating && isActive
          ? salesRows.reduce((sum, row) => sum + safeNumber(row.planned_revenue) + safeNumber(row.amendment_delta), 0)
          : 0,
        actualCostRows: includeInCost && isActive ? actualRows : [],
        salesOrderRows: isRevenueGenerating && isActive ? salesRows : [],
        updates: isActive ? relatedUpdates : [],
        asOfDate,
        reportingWbsLevel: planned?.level ?? null,
        costCategoryBreakdown: (includeInCost && isActive ? actualRows : []).reduce<Record<string, number>>((acc, row) => {
          const btx = String(row.raw_data_json?.business_transaction || "").toUpperCase();
          const category = btx === "COIE" ? "Material" : (String(row.cost_category ?? 'Unassigned').trim() || 'Unassigned');
          acc[category] = (acc[category] ?? 0) + safeNumber(row.amount);
          return acc;
        }, {}),
      });
    })
    .filter((row): row is RevenueWBS => Boolean(row))
    .sort((a, b) => a.wbs_code.localeCompare(b.wbs_code))
    .map((row) => ({
      ...row,
      id: previousCodeToId.get(normalizeCode(row.wbs_code)) ?? row.id,
    }));
}

function groupByCode<T>(rows: T[], getCode: (row: T) => string | null | undefined) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const code = normalizeCode(String(getCode(row) ?? '').trim());
    if (!code) continue;
    const list = map.get(code) ?? [];
    list.push(row);
    map.set(code, list);
  }
  return map;
}

function latestDate(values: Array<string | null | undefined>) {
  const filtered = values.filter(Boolean) as string[];
  if (!filtered.length) return null;
  return filtered.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
}

function normalizeCode(code: string) {
  return code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function normalizeCostElement(code: string) {
  return code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function isCostElementIncluded(row: Gr55CostRow, controlMap: Map<string, ProjectCostElementControl>) {
  if (!controlMap.size) return true;
  const control = controlMap.get(normalizeCostElement(String(row.cost_element ?? '').trim()));
  return control ? control.include_in_cost !== false : true;
}

function resolveUpdateWbsCode(revenueWbsId: string | null | undefined, previousIdToCode: Map<string, string>) {
  const value = String(revenueWbsId ?? '').trim();
  return normalizeCode(previousIdToCode.get(value) ?? value);
}
