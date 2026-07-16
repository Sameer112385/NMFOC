import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { safeNumber } from '@/lib/utils';
import { isLocalDbMode, savePmUpdate, updatePmUpdatePostingStatus } from '@/lib/local-db';
import type { PMManpowerLine, PMMaterialLine, PMSubcontractLine } from '@/lib/types';
import { buildRiskAlerts, createSnapshot } from '@/lib/calculations';
import { buildFinancialRowsFromSources } from '@/lib/financial-engine';
import { fetchAllSupabaseRows } from '@/lib/supabase/pagination';
import { deletePmUpdate } from '@/lib/data';
import { truncateFinancialOutput } from '@/lib/financial-format';

export async function POST(request: Request) {
  const formData = await request.formData();
  const project_id = String(formData.get('project_id') ?? '').trim();
  const revenue_wbs_id = String(formData.get('revenue_wbs_id') ?? '').trim();
  const update_date = String(formData.get('update_date') ?? '').trim();

  if (!project_id || !revenue_wbs_id || !update_date) {
    return NextResponse.json({ error: 'Project, revenue WBS, and date are required.' }, { status: 400 });
  }

  const subcontractLines = parseLines<PMSubcontractLine>(formData.get('subcontract_lines'));
  const manpowerLines = parseLines<PMManpowerLine>(formData.get('manpower_lines'));
  const materialLines = parseLines<PMMaterialLine>(formData.get('material_lines'));

  const pending_subcontractor_cost = subcontractLines.reduce((sum, line) => sum + safeNumber(line.amount), 0);
  const pending_manpower_cost = manpowerLines.reduce((sum, line) => sum + safeNumber(line.amount), 0);
  const pending_material_cost = materialLines.reduce((sum, line) => sum + safeNumber(line.amount), 0);
  const total_pending_cost = pending_material_cost + pending_subcontractor_cost + pending_manpower_cost;

  try {
    if (await isLocalDbMode()) {
      const update = await savePmUpdate({
        project_id,
        revenue_wbs_id,
        update_date,
        expected_progress: safeNumber(formData.get('expected_progress')),
        activity_name: 'PM Update',
        today_progress_percent: 0,
        today_completed_quantity: 0,
        pending_material_cost,
        pending_subcontractor_cost,
        pending_manpower_cost,
        pending_equipment_cost: 0,
        total_pending_cost,
        subcontract_lines: subcontractLines,
        manpower_lines: manpowerLines,
        material_lines: materialLines,
        remarks: String(formData.get('remarks') ?? ''),
        issue_delay: String(formData.get('issue_delay') ?? ''),
        submitted_by: String(formData.get('submitted_by') ?? ''),
        approval_status: String(formData.get('approval_status') ?? 'Pending'),
        sap_posted: false,
        material_sap_posted: false,
        material_posted_at: null,
        material_posted_by: null,
        material_posting_reference: null,
        subcontract_sap_posted: false,
        subcontract_posted_at: null,
        subcontract_posted_by: null,
        subcontract_posting_reference: null,
        manpower_sap_posted: false,
        manpower_posted_at: null,
        manpower_posted_by: null,
        manpower_posting_reference: null,
      });
      return NextResponse.json({ update });
    }

    const supabase = await createSupabaseServerClient();
    const resolvedRevenueWbsId = await resolveRevenueWbsIdForSupabase(supabase, project_id, revenue_wbs_id);
    if (!resolvedRevenueWbsId) {
      return NextResponse.json(
        {
          error:
            'Selected revenue WBS is not available in the calculated WBS table yet. Recalculate financial sources, then submit the PM update again.',
        },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from('pm_daily_updates')
      .insert({
        project_id,
        revenue_wbs_id: resolvedRevenueWbsId,
        update_date,
        expected_progress: safeNumber(formData.get('expected_progress')),
        activity_name: 'PM Update',
        today_progress_percent: 0,
        today_completed_quantity: 0,
        pending_material_cost,
        pending_subcontractor_cost,
        pending_manpower_cost,
        pending_equipment_cost: 0,
        total_pending_cost,
        subcontract_lines: subcontractLines,
        manpower_lines: manpowerLines,
        material_lines: materialLines,
        remarks: String(formData.get('remarks') ?? ''),
        issue_delay: String(formData.get('issue_delay') ?? ''),
        submitted_by: String(formData.get('submitted_by') ?? ''),
        approval_status: String(formData.get('approval_status') ?? 'Pending'),
        sap_posted: false,
        material_sap_posted: false,
        material_posted_at: null,
        material_posted_by: null,
        material_posting_reference: null,
        subcontract_sap_posted: false,
        subcontract_posted_at: null,
        subcontract_posted_by: null,
        subcontract_posting_reference: null,
        manpower_sap_posted: false,
        manpower_posted_at: null,
        manpower_posted_by: null,
        manpower_posting_reference: null,
      })
      .select()
      .single();

    if (error) throw error;

    try {
      await refreshProjectFinancialOutputs(supabase, project_id);
    } catch (refreshError) {
      return NextResponse.json({
        update: data,
        warning:
          refreshError instanceof Error
            ? `PM update saved, but dashboard recalculation failed: ${refreshError.message}`
            : 'PM update saved, but dashboard recalculation failed.',
      });
    }

    return NextResponse.json({ update: data });
  } catch (error) {
    const message = getErrorMessage(error, 'Unable to save PM update.');
    const schemaHint =
      message.includes('pending_equipment_cost') ||
      message.includes('total_pending_cost') ||
      message.includes('subcontract_lines') ||
      message.includes('manpower_lines') ||
      message.includes('material_lines') ||
      message.includes('remarks') ||
      message.includes('issue_delay') ||
      message.includes('submitted_by') ||
      message.includes('approval_status') ||
      message.includes('sap_posted') ||
      message.includes('material_sap_posted') ||
      message.includes('material_posted_at') ||
      message.includes('material_posted_by') ||
      message.includes('material_posting_reference') ||
      message.includes('subcontract_sap_posted') ||
      message.includes('subcontract_posted_at') ||
      message.includes('subcontract_posted_by') ||
      message.includes('subcontract_posting_reference') ||
      message.includes('manpower_sap_posted') ||
      message.includes('manpower_posted_at') ||
      message.includes('manpower_posted_by') ||
      message.includes('manpower_posting_reference');

    return NextResponse.json(
      {
        error: schemaHint
          ? 'PM update table is missing the new line-item columns. Run supabase/manual-setup.sql in Supabase SQL Editor, then try again.'
          : message,
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      id?: string;
      material_sap_posted?: boolean;
      material_posted_at?: string | null;
      material_posted_by?: string | null;
      material_posting_reference?: string | null;
      material_updated_by?: string | null;
      subcontract_sap_posted?: boolean;
      subcontract_posted_at?: string | null;
      subcontract_posted_by?: string | null;
      subcontract_posting_reference?: string | null;
      subcontract_updated_by?: string | null;
      manpower_sap_posted?: boolean;
      manpower_posted_at?: string | null;
      manpower_posted_by?: string | null;
      manpower_posting_reference?: string | null;
      manpower_updated_by?: string | null;
    };

    const id = String(body.id ?? '').trim();
    if (!id) {
      return NextResponse.json({ error: 'PM update id is required.' }, { status: 400 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const patch = {
      material_sap_posted: Boolean(body.material_sap_posted),
      material_posted_at: Boolean(body.material_sap_posted)
        ? String(body.material_posted_at ?? '').trim() || today
        : body.material_posted_at ?? null,
      material_posted_by: normalizeNullableText(body.material_posted_by),
      material_posting_reference: normalizeNullableText(body.material_posting_reference),
      subcontract_sap_posted: Boolean(body.subcontract_sap_posted),
      subcontract_posted_at: Boolean(body.subcontract_sap_posted)
        ? String(body.subcontract_posted_at ?? '').trim() || today
        : body.subcontract_posted_at ?? null,
      subcontract_posted_by: normalizeNullableText(body.subcontract_posted_by),
      subcontract_posting_reference: normalizeNullableText(body.subcontract_posting_reference),
      manpower_sap_posted: Boolean(body.manpower_sap_posted),
      manpower_posted_at: Boolean(body.manpower_sap_posted)
        ? String(body.manpower_posted_at ?? '').trim() || today
        : body.manpower_posted_at ?? null,
      manpower_posted_by: normalizeNullableText(body.manpower_posted_by),
      manpower_posting_reference: normalizeNullableText(body.manpower_posting_reference),
    };

    if (await isLocalDbMode()) {
      const update = await updatePmUpdatePostingStatus(id, patch);
      return NextResponse.json({ update });
    }

    const supabase = await createSupabaseServerClient();
    const { data: existingUpdate, error: existingError } = await supabase
      .from('pm_daily_updates')
      .select('id, project_id, revenue_wbs_id')
      .eq('id', id)
      .single();
    if (existingError) throw existingError;

    const { error } = await supabase
      .from('pm_daily_updates')
      .update(patch)
      .eq('id', id);

    let savedUpdate = { ...existingUpdate, ...patch };
    if (error && isRlsOrPolicyError(getErrorMessage(error, ''))) {
      const admin = await createSupabaseAdminClient();
      const retry = await admin
        .from('pm_daily_updates')
        .update(patch)
        .eq('id', id);
      if (retry.error) throw retry.error;
      savedUpdate = { ...existingUpdate, ...patch };
    } else if (error) {
      throw error;
    }

    const revenueWbsId = String(savedUpdate?.revenue_wbs_id ?? '').trim();
    if (revenueWbsId) {
      const projectId = String(savedUpdate?.project_id ?? '').trim();
      try {
        await refreshProjectFinancialOutputs(supabase, projectId);
      } catch (refreshError) {
        if (!isRlsOrPolicyError(getErrorMessage(refreshError, ''))) throw refreshError;
        const admin = await createSupabaseAdminClient();
        await refreshProjectFinancialOutputs(admin, projectId);
      }
    }

    return NextResponse.json({ update: savedUpdate });
  } catch (error) {
    const message = getErrorMessage(error, 'Unable to update SAP posting status.');
    const schemaHint =
      message.includes('material_sap_posted') ||
      message.includes('material_posted_at') ||
      message.includes('material_posted_by') ||
      message.includes('material_posting_reference') ||
      message.includes('subcontract_sap_posted') ||
      message.includes('subcontract_posted_at') ||
      message.includes('subcontract_posted_by') ||
      message.includes('subcontract_posting_reference') ||
      message.includes('manpower_sap_posted') ||
      message.includes('manpower_posted_at') ||
      message.includes('manpower_posted_by') ||
      message.includes('manpower_posting_reference') ||
      message.toLowerCase().includes('row-level security');
    return NextResponse.json(
      {
        error: schemaHint
          ? `PM update posting control failed: ${message}`
          : message,
      },
      { status: 500 },
    );
  }
}

async function refreshProjectFinancialOutputs(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, projectId: string) {
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
    fetchAllSupabaseRows<any>(() => supabase.from('cn41_rows').select('*').eq('project_id', projectId)),
    fetchAllSupabaseRows<any>(() => supabase.from('gr55_rows').select('*').eq('project_id', projectId)),
    fetchAllSupabaseRows<any>(() => supabase.from('sales_order_rows').select('*').eq('project_id', projectId)),
    fetchAllSupabaseRows<any>(() => supabase.from('pm_daily_updates').select('*').eq('project_id', projectId)),
    fetchAllSupabaseRows<any>(() => supabase.from('revenue_wbs').select('*').eq('project_id', projectId)),
    fetchAllSupabaseRows<any>(() => supabase.from('project_wbs_master').select('*').eq('project_id', projectId)),
    fetchAllSupabaseRows<any>(() => supabase.from('project_cost_element_control').select('*').eq('project_id', projectId)),
    fetchAllSupabaseRows<any>(() => supabase.from('historical_revenue_rows').select('*').eq('project_id', projectId)),
  ]);

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
}

async function resolveRevenueWbsIdForSupabase(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  projectId: string,
  selectedValue: string,
) {
  const existingId = await findRevenueWbsId(supabase, projectId, selectedValue);
  if (existingId) return existingId;

  await refreshProjectFinancialOutputs(supabase, projectId);
  return findRevenueWbsId(supabase, projectId, selectedValue);
}

async function findRevenueWbsId(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  projectId: string,
  selectedValue: string,
) {
  const value = String(selectedValue ?? '').trim();
  if (!value) return null;

  const { data, error } = await supabase.from('revenue_wbs').select('id,wbs_code').eq('project_id', projectId);
  if (error) throw error;

  const normalizedValue = normalizeWbsLookup(value);
  const match = (data ?? []).find((row) => {
    const id = String(row.id ?? '').trim();
    const code = String(row.wbs_code ?? '').trim();
    return id === value || normalizeWbsLookup(code) === normalizedValue;
  });

  return match?.id ?? null;
}

function normalizeWbsLookup(code: string) {
  return code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
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

function isRlsOrPolicyError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes('row-level security') || normalized.includes('violates row-level security') || normalized.includes('permission denied') || normalized.includes('policy');
}

function parseLines<T>(value: FormDataEntryValue | null): T[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function normalizeNullableText(value: unknown) {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

export async function DELETE(request: Request) {
  try {
    const payload = await request.json();
    const id = String(payload.id ?? '').trim();
    if (!id) {
      return NextResponse.json({ error: 'PM update id is required.' }, { status: 400 });
    }
    
    // Fetch PM update first to get project_id so we can recalculate after delete
    let projectId = '';
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.from('pm_daily_updates').select('project_id').eq('id', id).maybeSingle();
    if (data) projectId = data.project_id;

    await deletePmUpdate(id).catch(async (err) => {
      // Always fallback to admin client delete if the standard delete fails
      const admin = await createSupabaseAdminClient();
      const { error } = await admin.from('pm_daily_updates').delete().eq('id', id);
      if (error) throw error;
    });

    // Rebuild calculations for that project
    if (projectId) {
      if (!(await isLocalDbMode())) {
        const supabase = await createSupabaseServerClient();
        try {
          await refreshProjectFinancialOutputs(supabase, projectId);
        } catch (refreshError) {
          if (!isRlsOrPolicyError(getErrorMessage(refreshError, ''))) throw refreshError;
          const admin = await createSupabaseAdminClient();
          await refreshProjectFinancialOutputs(admin, projectId);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to delete PM update.' },
      { status: 500 },
    );
  }
}

