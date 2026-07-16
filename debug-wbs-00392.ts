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
  
  // 1. Fetch matching historical revenue rows
  const { data: hist } = await supabase
    .from('historical_revenue_rows')
    .select('*')
    .eq('project_id', projectId);

  const matchedHist = (hist || []).filter(r => normalizeCode(r.wbs_code) === normTarget);
  console.log(`Matched historical rows for ${wbsCode}: ${matchedHist.length}`);
  const histSum = matchedHist.reduce((s, r) => s + Number(r.amount || 0), 0);
  console.log(`Historical Sum: SAR ${histSum.toLocaleString()}`);

  // 2. Fetch matching GR55 revenue rows
  const revenueGls = ['400110', '400119', '400210', '400310'];
  const { data: gr55 } = await supabase
    .from('gr55_rows')
    .select('*')
    .eq('project_id', projectId)
    .in('cost_element', revenueGls);

  const matchedGr55 = (gr55 || []).filter(r => normalizeCode(r.wbs_code) === normTarget);
  console.log(`Matched GR55 revenue rows for ${wbsCode}: ${matchedGr55.length}`);
  const gr55Sum = matchedGr55.reduce((s, r) => s - Number(r.amount || 0), 0);
  console.log(`GR55 Sum (negated): SAR ${gr55Sum.toLocaleString()}`);

  // Print raw samples
  if (matchedHist.length > 0) {
    console.log("\nHistorical Sample:", JSON.stringify(matchedHist.slice(0, 3), null, 2));
  }
  if (matchedGr55.length > 0) {
    console.log("\nGR55 Sample:", JSON.stringify(matchedGr55.slice(0, 3), null, 2));
  }
}

main().catch(console.error);
