export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { fetchAllSupabaseRows } from '@/lib/supabase/pagination';
import { buildFinancialRowsFromSources } from '@/lib/financial-engine';
import { truncateFinancialOutput } from '@/lib/financial-format';
import { parseCn41File, parseGr55File, parseSalesOrderFile } from '@/lib/financial-imports';
import { createSnapshot, buildRiskAlerts } from '@/lib/calculations';
import {
  isLocalDbMode,
  readProjects as readLocalProjects,
  readLatestSourceUploads,
  saveCn41Upload,
  saveGr55Upload,
  saveSalesOrderUpload,
} from '@/lib/local-db';

type SourceType = 'cn41' | 'gr55' | 'sales_order';

export async function POST(request: Request) {
  const formData = await request.formData();
  const projectId = String(formData.get('project_id') ?? '').trim();
  const sourceTypes = formData
    .getAll('source_type')
    .map((value) => String(value ?? '').trim().toLowerCase())
    .filter((value): value is SourceType => ['cn41', 'gr55', 'sales_order'].includes(value));
  const files = formData.getAll('file').filter((entry): entry is File => entry instanceof File);

  if (!projectId) {
    return NextResponse.json({ error: 'Project is required.' }, { status: 400 });
  }
  if (!files.length) {
    return NextResponse.json({ error: 'Excel file is required.' }, { status: 400 });
  }
  if (sourceTypes.length !== files.length) {
    return NextResponse.json({ error: 'Each file must have a source type.' }, { status: 400 });
  }

  const localMode = await isLocalDbMode();
  if (localMode) {
    const projects = await readLocalProjects();
    if (!projects.find((project) => project.id === projectId)) {
      return NextResponse.json({ error: 'Selected project was not found. Create the project first.' }, { status: 400 });
    }
  }

  try {
    const results = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const sourceType = sourceTypes[index];
      const supabase = localMode ? null : await createSupabaseServerClient();
      const versionNo = await getNextVersionNo({ sourceType, projectId, localMode, supabase });
      if (sourceType === 'cn41') {
        results.push(await handleCn41Upload({ file, projectId, localMode, versionNo }));
        continue;
      }
      if (sourceType === 'gr55') {
        results.push(await handleGr55Upload({ file, projectId, localMode, versionNo }));
        continue;
      }
      results.push(await handleSalesOrderUpload({ file, projectId, localMode, versionNo }));
    }

    return NextResponse.json({ ok: true, projectId, results });
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error, 'Unable to process financial source upload.') },
      { status: 500 },
    );
  }
}

async function handleCn41Upload({ file, projectId, localMode, versionNo }: { file: File; projectId: string; localMode: boolean; versionNo: number }) {
  const parsed = await parseCn41File(file);
  if (localMode) {
    const upload = await saveCn41Upload({
      project_id: projectId,
      file_name: file.name,
      file_url: `local://${projectId}/${Date.now()}-${file.name}`,
      version_no: versionNo,
      rows: parsed.rows.map((row) => ({
        project_id: projectId,
        level: row.level,
        object_type: row.object_type,
        wbs_code: row.wbs_code ?? null,
        wbs_description: row.wbs_description ?? null,
        network: row.network ?? null,
        activity: row.activity ?? null,
        status: row.status ?? null,
        actual_cost: Number(row.actual_cost ?? 0),
        planned_cost: Number(row.planned_cost ?? 0),
        balance_cost: Number(row.balance_cost ?? 0),
        actual_work: Number(row.actual_work ?? 0),
        remaining_work: Number(row.remaining_work ?? 0),
        prrevpl000: row.prrevpl000,
        raw_data_json: row.raw_data_json,
      })),
    });

    return {
      sourceType: 'cn41',
      upload,
      projectCode: parsed.projectCode,
      projectName: parsed.projectName,
      rowCount: parsed.rows.length,
      revenueRowCount: parsed.level03Rows.length,
    };
  }

  const supabase = await createSupabaseAdminClient();
  const buffer = await file.arrayBuffer();
  const storagePath = `cn41/${projectId}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from('cn41-files').upload(storagePath, new Uint8Array(buffer), {
    contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    upsert: true,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { data: publicUrlData } = supabase.storage.from('cn41-files').getPublicUrl(storagePath);
  const fileUrl = publicUrlData.publicUrl;

  // Clear previous CN41 rows and upload records to avoid calculations carrying legacy data
  await supabase.from('cn41_rows').delete().eq('project_id', projectId);
  await supabase.from('cn41_uploads').delete().eq('project_id', projectId);

  const { data: uploadRow, error: uploadRowError } = await supabase
    .from('cn41_uploads')
    .insert({
      project_id: projectId,
      file_name: file.name,
      file_url: fileUrl,
      upload_date: new Date().toISOString(),
      version_no: versionNo,
      is_latest: true,
    })
    .select()
    .single();
  if (uploadRowError) throw new Error(uploadRowError.message);

  // Chunk insertions for CN41 rows (2000 rows per batch) to prevent gateway timeouts
  const cn41ChunkSize = 2000;
  for (let i = 0; i < parsed.rows.length; i += cn41ChunkSize) {
    const chunk = parsed.rows.slice(i, i + cn41ChunkSize).map((row) => ({
      upload_id: uploadRow.id,
      project_id: projectId,
      level: row.level,
      object_type: row.object_type,
      wbs_code: row.wbs_code ?? null,
      wbs_description: row.wbs_description ?? null,
      network: row.network ?? null,
      activity: row.activity ?? null,
      status: row.status ?? null,
      actual_cost: Number(row.actual_cost ?? 0),
      planned_cost: Number(row.planned_cost ?? 0),
      balance_cost: Number(row.balance_cost ?? 0),
      actual_work: Number(row.actual_work ?? 0),
      remaining_work: Number(row.remaining_work ?? 0),
      prrevpl000: row.prrevpl000,
      raw_data_json: row.raw_data_json ?? {},
    }));
    const { error: insertError } = await supabase.from('cn41_rows').insert(chunk);
    if (insertError) {
      throw new Error(`Failed to insert CN41 rows chunk at index ${i}: ${insertError.message}`);
    }
  }

  const financialRows = await buildFinancialRowsFromSourcesForSupabase(supabase, projectId, uploadRow.id);
  return {
    sourceType: 'cn41',
    upload: uploadRow,
    projectCode: parsed.projectCode,
    projectName: parsed.projectName,
    rowCount: parsed.rows.length,
    revenueRowCount: financialRows.length,
  };
}

async function handleGr55Upload({ file, projectId, localMode, versionNo }: { file: File; projectId: string; localMode: boolean; versionNo: number }) {
  const parsed = await parseGr55File(file);
  if (localMode) {
    const upload = await saveGr55Upload({
      project_id: projectId,
      file_name: file.name,
      file_url: `local://${projectId}/${Date.now()}-${file.name}`,
      version_no: versionNo,
      rows: parsed.rows,
    });
    return { sourceType: 'gr55', upload, projectId, rowCount: parsed.rows.length };
  }

  const supabase = await createSupabaseAdminClient();
  const buffer = await file.arrayBuffer();
  const storagePath = `gr55/${projectId}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from('cn41-files').upload(storagePath, new Uint8Array(buffer), {
    contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    upsert: true,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { data: publicUrlData } = supabase.storage.from('cn41-files').getPublicUrl(storagePath);
  const fileUrl = publicUrlData.publicUrl;

  // Clear previous GR55 rows and upload records to avoid double counting costs
  await supabase.from('gr55_rows').delete().eq('project_id', projectId);
  await supabase.from('gr55_uploads').delete().eq('project_id', projectId);

  const { data: uploadRow, error: uploadRowError } = await supabase
    .from('gr55_uploads')
    .insert({
      project_id: projectId,
      file_name: file.name,
      file_url: fileUrl,
      upload_date: new Date().toISOString(),
      version_no: versionNo,
      is_latest: true,
    })
    .select()
    .single();
  if (uploadRowError) throw new Error(uploadRowError.message);

  // Compact GR55 rows can be inserted in larger chunks; run a few chunks in parallel to keep uploads responsive.
  const chunkSize = 2000;
  const parallelChunks = 4;
  for (let i = 0; i < parsed.rows.length; i += chunkSize * parallelChunks) {
    const batch = [];
    for (let offset = 0; offset < parallelChunks; offset += 1) {
      const start = i + offset * chunkSize;
      const chunk = parsed.rows.slice(start, start + chunkSize).map((row) => ({
        ...row,
        upload_id: uploadRow.id,
        project_id: projectId,
      }));
      if (chunk.length) {
        batch.push(
          supabase
            .from('gr55_rows')
            .insert(chunk)
            .then(({ error }) => ({ start, error })),
        );
      }
    }

    const results = await Promise.all(batch);
    const failed = results.find((result) => result.error);
    if (failed?.error) {
      throw new Error(`Failed to insert GR55 rows chunk at index ${failed.start}: ${failed.error.message}`);
    }
  }

  await syncProjectCostElementsFromGr55Rows(supabase, projectId, parsed.rows);

  const financialRows = await buildFinancialRowsFromSourcesForSupabase(supabase, projectId, uploadRow.id);
  return { sourceType: 'gr55', upload: uploadRow, projectId, rowCount: parsed.rows.length, revenueRowCount: financialRows.length };
}

async function handleSalesOrderUpload({ file, projectId, localMode, versionNo }: { file: File; projectId: string; localMode: boolean; versionNo: number }) {
  const parsed = await parseSalesOrderFile(file);
  if (localMode) {
    const upload = await saveSalesOrderUpload({
      project_id: projectId,
      file_name: file.name,
      file_url: `local://${projectId}/${Date.now()}-${file.name}`,
      version_no: versionNo,
      rows: parsed.rows,
    });
    return { sourceType: 'sales_order', upload, projectId, rowCount: parsed.rows.length };
  }

  const supabase = await createSupabaseAdminClient();
  const buffer = await file.arrayBuffer();
  const storagePath = `sales-order/${projectId}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from('cn41-files').upload(storagePath, new Uint8Array(buffer), {
    contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    upsert: true,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { data: publicUrlData } = supabase.storage.from('cn41-files').getPublicUrl(storagePath);
  const fileUrl = publicUrlData.publicUrl;

  // Clear previous Sales Order rows and upload records to avoid duplicate revenue accumulation
  await supabase.from('sales_order_rows').delete().eq('project_id', projectId);
  await supabase.from('sales_order_uploads').delete().eq('project_id', projectId);

  const { data: uploadRow, error: uploadRowError } = await supabase
    .from('sales_order_uploads')
    .insert({
      project_id: projectId,
      file_name: file.name,
      file_url: fileUrl,
      upload_date: new Date().toISOString(),
      version_no: versionNo,
      is_latest: true,
    })
    .select()
    .single();
  if (uploadRowError) throw new Error(uploadRowError.message);

  await supabase.from('sales_order_rows').insert(
    parsed.rows.map((row) => ({
      ...row,
      upload_id: uploadRow.id,
      project_id: projectId,
    })),
  );

  const financialRows = await buildFinancialRowsFromSourcesForSupabase(supabase, projectId, uploadRow.id);
  return { sourceType: 'sales_order', upload: uploadRow, projectId, rowCount: parsed.rows.length, revenueRowCount: financialRows.length };
}

async function syncProjectCostElementsFromGr55Rows(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  projectId: string,
  rows: Awaited<ReturnType<typeof parseGr55File>>['rows'],
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

async function buildFinancialRowsFromSourcesForSupabase(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, projectId: string, uploadId: string) {
  const [
    cn41Rows,
    gr55Rows,
    salesRows,
    updates,
    existingRows,
    projectWbsMaster,
    projectCostElements,
  ] = await Promise.all([
    fetchAllSupabaseRows<any>(() => supabase.from('cn41_rows').select('*').eq('project_id', projectId)),
    fetchAllSupabaseRows<any>(() => supabase.from('gr55_rows').select('*').eq('project_id', projectId)),
    fetchAllSupabaseRows<any>(() => supabase.from('sales_order_rows').select('*').eq('project_id', projectId)),
    fetchAllSupabaseRows<any>(() => supabase.from('pm_daily_updates').select('*').eq('project_id', projectId)),
    fetchAllSupabaseRows<any>(() => supabase.from('revenue_wbs').select('*').eq('project_id', projectId)),
    fetchAllSupabaseRows<any>(() => supabase.from('project_wbs_master').select('*').eq('project_id', projectId)),
    fetchAllSupabaseRows<any>(() => supabase.from('project_cost_element_control').select('*').eq('project_id', projectId)),
  ]);

  const financialRows = buildFinancialRowsFromSources({
    projectId,
    cn41Rows: cn41Rows as any,
    gr55Rows: gr55Rows as any,
    salesOrderRows: salesRows as any,
    updates: updates as any,
    existingRows: existingRows as any,
    projectWbsMaster: projectWbsMaster as any,
    projectCostElements: projectCostElements as any,
  });

  if (financialRows.length) {
    const { error: upsertRevenueError } = await supabase.from('revenue_wbs').upsert(
      financialRows.map((row) => toRevenueWbsDbRow(row, null)),
      { onConflict: 'project_id,wbs_code' },
    );
    if (upsertRevenueError) throw upsertRevenueError;
  }

  const { error: deleteRiskError } = await supabase.from('risk_alerts').delete().eq('project_id', projectId);
  if (deleteRiskError) throw deleteRiskError;

  const risks = buildRiskAlerts(financialRows);
  if (risks.length) {
    const { error: insertRiskError } = await supabase.from('risk_alerts').insert(risks);
    if (insertRiskError) throw insertRiskError;
  }

  const { error: deleteSnapshotError } = await supabase.from('simulation_snapshots').delete().eq('project_id', projectId);
  if (deleteSnapshotError) throw deleteSnapshotError;

  const { error: insertSnapshotError } = await supabase.from('simulation_snapshots').insert(createSnapshot(projectId, financialRows));
  if (insertSnapshotError) throw insertSnapshotError;

  return financialRows;
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

async function getNextVersionNo({
  sourceType,
  projectId,
  localMode,
  supabase,
}: {
  sourceType: SourceType;
  projectId: string;
  localMode: boolean;
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> | null;
}) {
  if (localMode) {
    const latest = await readLatestSourceUploads(projectId);
    const upload = latest[sourceType];
    return Number(upload?.version_no ?? 0) + 1;
  }

  if (!supabase) return 1;
  const tableName =
    sourceType === 'cn41' ? 'cn41_uploads' : sourceType === 'gr55' ? 'gr55_uploads' : 'sales_order_uploads';
  const { data } = await supabase
    .from(tableName)
    .select('version_no')
    .eq('project_id', projectId)
    .order('version_no', { ascending: false })
    .limit(1)
    .maybeSingle();
  return Number(data?.version_no ?? 0) + 1;
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
