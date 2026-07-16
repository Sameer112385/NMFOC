import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { fetchAllSupabaseRows } from '@/lib/supabase/pagination';
import { buildFinancialRowsFromSources, syncGr55Summaries } from '@/lib/financial-engine';
import { truncateFinancialOutput } from '@/lib/financial-format';
import { createSnapshot, buildRiskAlerts } from '@/lib/calculations';
import { isLocalDbMode, readProjects as readLocalProjects, recalculateLocalFinancials } from '@/lib/local-db';

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as { project_id?: string; projectId?: string };
    const projectId = String(payload.project_id ?? payload.projectId ?? '').trim();

    if (!projectId) {
      return NextResponse.json({ error: 'Project is required.' }, { status: 400 });
    }

    if (await isLocalDbMode()) {
      const projects = await readLocalProjects();
      if (!projects.find((project) => project.id === projectId)) {
        return NextResponse.json({ error: 'Selected project was not found.' }, { status: 400 });
      }

      const result = await recalculateLocalFinancials(projectId);
      return NextResponse.json({ ok: true, mode: 'local', ...result });
    }

    const supabase = await createSupabaseServerClient();

    const [latestCn41, latestGr55, latestSales] = await Promise.all([
      supabase.from('cn41_uploads').select('id').eq('project_id', projectId).eq('is_latest', true).order('upload_date', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('gr55_uploads').select('id').eq('project_id', projectId).eq('is_latest', true).order('upload_date', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('sales_order_uploads').select('id').eq('project_id', projectId).eq('is_latest', true).order('upload_date', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const cn41UploadId = latestCn41.data?.id;
    const gr55UploadId = latestGr55.data?.id;
    const salesUploadId = latestSales.data?.id;

    const [
      cn41Rows,
      gr55Rows,
      salesRows,
      updates,
      existingRows,
      projectWbsMaster,
      projectCostElements,
      historicalRevenueRows,
    ] = await Promise.all([
      cn41UploadId
        ? fetchAllSupabaseRows<any>(() => supabase.from('cn41_rows').select('*').eq('project_id', projectId).eq('upload_id', cn41UploadId))
        : Promise.resolve([]),
      gr55UploadId
        ? fetchAllSupabaseRows<any>(() => supabase.from('gr55_rows').select('*').eq('project_id', projectId).eq('upload_id', gr55UploadId))
        : Promise.resolve([]),
      salesUploadId
        ? fetchAllSupabaseRows<any>(() => supabase.from('sales_order_rows').select('*').eq('project_id', projectId).eq('upload_id', salesUploadId))
        : Promise.resolve([]),
      fetchAllSupabaseRows<any>(() => supabase.from('pm_daily_updates').select('*').eq('project_id', projectId)),
      fetchAllSupabaseRows<any>(() => supabase.from('revenue_wbs').select('*').eq('project_id', projectId)),
      fetchAllSupabaseRows<any>(() => supabase.from('project_wbs_master').select('*').eq('project_id', projectId)),
      fetchAllSupabaseRows<any>(() => supabase.from('project_cost_element_control').select('*').eq('project_id', projectId)),
      fetchAllSupabaseRows<any>(() => supabase.from('historical_revenue_rows').select('*').eq('project_id', projectId)),
    ]);

    await syncProjectCostElementsFromGr55Rows(supabase, projectId, gr55Rows as any);
    await syncGr55Summaries(supabase, projectId, gr55Rows as any);

    const financialRows = buildFinancialRowsFromSources({
      projectId,
      cn41Rows: cn41Rows as any,
      gr55Rows: gr55Rows as any,
      historicalRevenueRows: historicalRevenueRows as any,
      salesOrderRows: salesRows as any,
      updates: updates as any,
      existingRows: existingRows as any,
      projectWbsMaster: projectWbsMaster as any,
      projectCostElements: projectCostElements as any,
    });

    if (financialRows.length) {
      const { error: upsertRevenueError } = await supabase.from('revenue_wbs').upsert(
        financialRows.map((row) => toRevenueWbsDbRow(row, row.upload_id ?? null)),
        { onConflict: 'project_id,wbs_code' },
      );
      if (upsertRevenueError) throw upsertRevenueError;
    }

    const { error: deleteRiskError } = await supabase.from('risk_alerts').delete().eq('project_id', projectId);
    if (deleteRiskError) throw deleteRiskError;

    if (financialRows.length) {
      const risks = buildRiskAlerts(financialRows);
      if (risks.length) {
        const { error: insertRiskError } = await supabase.from('risk_alerts').insert(risks);
        if (insertRiskError) throw insertRiskError;
      }
    }

    const { error: deleteSnapshotError } = await supabase.from('simulation_snapshots').delete().eq('project_id', projectId);
    if (deleteSnapshotError) throw deleteSnapshotError;

    const { error: insertSnapshotError } = await supabase.from('simulation_snapshots').insert(createSnapshot(projectId, financialRows));
    if (insertSnapshotError) throw insertSnapshotError;

    return NextResponse.json({ ok: true, mode: 'supabase', projectId, rowCount: financialRows.length });
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error, 'Unable to recalculate financial data.') },
      { status: 500 },
    );
  }
}

async function syncProjectCostElementsFromGr55Rows(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  projectId: string,
  rows: Array<{ cost_element?: string | null; cost_category?: string | null }>,
) {
  const inferred = new Map<string, { cost_element: string; cost_element_name: string }>();
  for (const row of rows) {
    const costElement = String(row.cost_element ?? '').trim();
    if (!costElement) continue;
    const key = normalizeCostElement(costElement);
    if (!key || inferred.has(key)) continue;
    inferred.set(key, {
      cost_element: costElement,
      cost_element_name: String(row.cost_category ?? '').trim() || costElement,
    });
  }

  if (!inferred.size) return;

  const existingRows = await fetchAllSupabaseRows<{ cost_element: string }>(() =>
    supabase.from('project_cost_element_control').select('cost_element').eq('project_id', projectId),
  );
  const existingKeys = new Set(existingRows.map((row) => normalizeCostElement(row.cost_element)).filter(Boolean));
  const missingRows = [...inferred.values()]
    .filter((row) => !existingKeys.has(normalizeCostElement(row.cost_element)))
    .map((row) => ({
      project_id: projectId,
      cost_element: row.cost_element,
      cost_element_name: row.cost_element_name,
      include_in_cost: true,
      remarks: null,
    }));

  if (!missingRows.length) return;
  const { error } = await supabase.from('project_cost_element_control').insert(missingRows);
  if (error) throw new Error(`Failed to sync GR55 cost elements: ${error.message}`);
}

function normalizeCostElement(code: string) {
  return String(code ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function toRevenueWbsDbRow(row: ReturnType<typeof buildFinancialRowsFromSources>[number], uploadId: string | null) {
  const { actual_cost_categories: _actualCostCategories, ...dbRow } = row;
  if (!dbRow.id) {
    delete dbRow.id;
  }
  return truncateFinancialOutput({
    ...dbRow,
    upload_id: uploadId,
  });
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint, record.code]
      .map((value) => String(value ?? '').trim())
      .filter(Boolean);
    if (parts.length) return parts.join(' ');
    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== '{}') return serialized;
    } catch {
      return fallback;
    }
  }
  return fallback;
}
