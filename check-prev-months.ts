import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

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
const wbsCode = 'SIS-NGS.FOC.W.JD.00392';

function normalizeCode(c: string) {
  return String(c || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

async function main() {
  const normTarget = normalizeCode(wbsCode);
  const currentPeriod = '2026-07';

  // 1. Fetch matching historical revenue rows
  const { data: hist } = await supabase
    .from('historical_revenue_rows')
    .select('*')
    .eq('project_id', projectId);
  const historicalRevenueRows = (hist || []).filter(r => normalizeCode(r.wbs_code) === normTarget);

  // 2. Fetch matching GR55 revenue rows
  const revenueGls = ['400110', '400119', '400210', '400310'];
  const { data: gr55 } = await supabase
    .from('gr55_rows')
    .select('*')
    .eq('project_id', projectId)
    .in('cost_element', revenueGls);
  const gr55RawRowsForRevenue = (gr55 || []).filter(r => normalizeCode(r.wbs_code) === normTarget);

  // Simulation
  const prevMonthsSet = new Set<string>();
  historicalRevenueRows.forEach((row) => {
    const m = row.posting_date ? row.posting_date.slice(0, 7) : '';
    if (m && m < currentPeriod) prevMonthsSet.add(m);
  });
  gr55RawRowsForRevenue.forEach((row) => {
    const m = row.posting_date ? row.posting_date.slice(0, 7) : '';
    if (m && m >= '2026-01' && m < currentPeriod) prevMonthsSet.add(m);
  });

  const prevMonthsList = Array.from(prevMonthsSet).sort();
  console.log("Prev Months Found:", prevMonthsList);

  const getPostedRevenueForMonth = (monthStr: string): number => {
    const isPre2026 = monthStr < '2026-01';
    if (isPre2026) {
      const sum = historicalRevenueRows
        .filter((row) => {
          const m = row.posting_date ? row.posting_date.slice(0, 7) : '';
          return m === monthStr;
        })
        .reduce((sum, row) => sum + Number(row.amount || 0), 0);
      console.log(`- Month ${monthStr} (Hist): SAR ${sum.toLocaleString()}`);
      return sum;
    } else {
      const sum = gr55RawRowsForRevenue
        .filter((row) => {
          const m = row.posting_date ? row.posting_date.slice(0, 7) : '';
          return m === monthStr;
        })
        .reduce((sum, row) => sum + Number(row.amount || 0), 0);
      console.log(`- Month ${monthStr} (GR55 Raw Sum): SAR ${sum.toLocaleString()} (Negated: SAR ${(-sum).toLocaleString()}`);
      return -sum;
    }
  };

  const cumulativePostedRevenuePrevMonths = prevMonthsList.reduce((sum, month) => sum + getPostedRevenueForMonth(month), 0);
  console.log(`\nFinal Cumulative Posted Revenue: SAR ${cumulativePostedRevenuePrevMonths.toLocaleString()}`);
}

main().catch(console.error);
