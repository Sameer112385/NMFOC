import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { buildFinancialRowsFromSources } from '@/lib/financial-engine';

const envLocal = fs.readFileSync('d:/Antigravity/NMFOC Dashboard/.env.local', 'utf8');
const env: Record<string, string> = {};
envLocal.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/\r/g, '');
  }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const projectId = 'fa8d7d22-2e29-4abc-8739-881ba4370924';

async function fetchAllRows(table: string) {
  let allRows: any[] = [];
  let start = 0;
  const size = 1000;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('project_id', projectId)
      .range(start, start + size - 1);
    if (error) {
      console.error(error);
      break;
    }
    if (!data || data.length === 0) break;
    allRows.push(...data);
    start += size;
  }
  return allRows;
}

async function main() {
  const cn41Rows = await fetchAllRows('cn41_rows');
  const gr55Rows = await fetchAllRows('gr55_rows');
  const salesOrderRows = await fetchAllRows('sales_order_rows');
  const updates = await fetchAllRows('pm_daily_updates');
  const existingRows = await fetchAllRows('revenue_wbs');
  const projectWbsMaster = await fetchAllRows('project_wbs_master');
  const projectCostElements = await fetchAllRows('project_cost_element_control');
  const historicalRevenueRows = await fetchAllRows('historical_revenue_rows');

  const financialRows = buildFinancialRowsFromSources({
    projectId,
    cn41Rows,
    gr55Rows,
    historicalRevenueRows,
    salesOrderRows,
    updates,
    existingRows,
    projectWbsMaster,
    projectCostElements,
  });

  let recToDateSum = 0;
  let openingSum = 0;
  let mtdSum = 0;

  financialRows.forEach(r => {
    // Only sum active revenue generating WBS
    const plannedRev = Number(r.planned_revenue || 0);
    const rec = Number(r.recognized_revenue_to_date || 0);
    const opening = Number(r.opening_recognized_revenue || 0);
    const mtd = Number(r.mtd_revenue_recognition || 0);

    if (plannedRev > 0 || rec > 0) {
      recToDateSum += rec;
      openingSum += opening;
      mtdSum += mtd;
    }
  });

  console.log(`\nNew Recalculated Totals:`);
  console.log(`- Sum of Cumulative POC (recognized_revenue_to_date): SAR ${recToDateSum.toLocaleString()}`);
  console.log(`- Sum of June Baseline (opening_recognized_revenue): SAR ${openingSum.toLocaleString()}`);
  console.log(`- Sum of July In-Month (mtd_revenue_recognition): SAR ${mtdSum.toLocaleString()}`);
}

main().catch(console.error);
