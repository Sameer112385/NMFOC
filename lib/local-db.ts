import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { buildFinancialRowsFromSources } from '@/lib/financial-engine';
import { buildRiskAlerts, createSnapshot } from '@/lib/calculations';
import type {
  DailyUpdate,
  Gr55CostRow,
  HistoricalRevenueRow,
  SalesOrderRevenueRow,
  Project,
  ProjectManpowerRate,
  ProjectMaterialMaster,
  ProjectCostElementControl,
  ProjectSubcontract,
  ProjectWbsMaster,
  RevenueWBS,
  RiskAlert,
} from '@/lib/types';
import { hasSupabaseRuntimeConfig } from '@/lib/supabase/runtime-config';

type LocalDb = {
  projects: Project[];
  cn41_uploads: Array<any>;
  cn41_rows: Array<any>;
  gr55_uploads: Array<any>;
  gr55_rows: Gr55CostRow[];
  historical_revenue_uploads: Array<any>;
  historical_revenue_rows: HistoricalRevenueRow[];
  sales_order_uploads: Array<any>;
  sales_order_rows: SalesOrderRevenueRow[];
  revenue_wbs: RevenueWBS[];
  project_wbs_master: ProjectWbsMaster[];
  project_subcontracts: ProjectSubcontract[];
  project_manpower_rates: ProjectManpowerRate[];
  project_material_master: ProjectMaterialMaster[];
  project_cost_element_control: ProjectCostElementControl[];
  pm_daily_updates: DailyUpdate[];
  simulation_snapshots: Array<any>;
  risk_alerts: RiskAlert[];
  comments: Array<any>;
  users: Array<{ id: string; user_id: string; email: string; full_name: string | null; phone: string | null; role: string; created_at: string }>;
};

const dbDir = path.join(process.cwd(), '.local-db');
const dbFile = path.join(dbDir, 'db.json');

let cachedDb: LocalDb | null = null;

async function ensureDb(): Promise<LocalDb> {
  if (cachedDb) {
    return cachedDb;
  }
  try {
    const parsed = JSON.parse(await readFile(dbFile, 'utf8')) as Partial<LocalDb>;
    cachedDb = {
      projects: parsed.projects ?? [],
      cn41_uploads: parsed.cn41_uploads ?? [],
      cn41_rows: parsed.cn41_rows ?? [],
      gr55_uploads: parsed.gr55_uploads ?? [],
      gr55_rows: parsed.gr55_rows ?? [],
      historical_revenue_uploads: parsed.historical_revenue_uploads ?? [],
      historical_revenue_rows: parsed.historical_revenue_rows ?? [],
      sales_order_uploads: parsed.sales_order_uploads ?? [],
      sales_order_rows: parsed.sales_order_rows ?? [],
      revenue_wbs: parsed.revenue_wbs ?? [],
      project_wbs_master: parsed.project_wbs_master ?? [],
      project_subcontracts: parsed.project_subcontracts ?? [],
      project_manpower_rates: parsed.project_manpower_rates ?? [],
      project_material_master: parsed.project_material_master ?? [],
      project_cost_element_control: parsed.project_cost_element_control ?? [],
      pm_daily_updates: (parsed.pm_daily_updates ?? []).map((item) => ({
        ...item,
        material_sap_posted: item.material_sap_posted ?? false,
          material_posted_at: item.material_posted_at ?? null,
          material_posted_by: item.material_posted_by ?? null,
          material_posting_reference: item.material_posting_reference ?? null,
          material_updated_by: item.material_updated_by ?? null,
          material_updated_at: item.material_updated_at ?? null,
          subcontract_sap_posted: item.subcontract_sap_posted ?? false,
          subcontract_posted_at: item.subcontract_posted_at ?? null,
          subcontract_posted_by: item.subcontract_posted_by ?? null,
          subcontract_posting_reference: item.subcontract_posting_reference ?? null,
          subcontract_updated_by: item.subcontract_updated_by ?? null,
          subcontract_updated_at: item.subcontract_updated_at ?? null,
          manpower_sap_posted: item.manpower_sap_posted ?? false,
          manpower_posted_at: item.manpower_posted_at ?? null,
          manpower_posted_by: item.manpower_posted_by ?? null,
          manpower_posting_reference: item.manpower_posting_reference ?? null,
          manpower_updated_by: item.manpower_updated_by ?? null,
          manpower_updated_at: item.manpower_updated_at ?? null,
        })),
      simulation_snapshots: parsed.simulation_snapshots ?? [],
      risk_alerts: parsed.risk_alerts ?? [],
      comments: parsed.comments ?? [],
      users: (parsed.users ?? []).map((user) => ({
        ...user,
        phone: user.phone ?? null,
      })),
    };
    return cachedDb;
  } catch {
    const seed: LocalDb = {
      projects: [],
      cn41_uploads: [],
      cn41_rows: [],
      gr55_uploads: [],
      gr55_rows: [],
      historical_revenue_uploads: [],
      historical_revenue_rows: [],
      sales_order_uploads: [],
      sales_order_rows: [],
      revenue_wbs: [],
      project_wbs_master: [],
      project_subcontracts: [],
      project_manpower_rates: [],
      project_material_master: [],
      project_cost_element_control: [],
      pm_daily_updates: [],
      simulation_snapshots: [],
      risk_alerts: [],
      comments: [],
      users: [],
    };
    cachedDb = seed;
    await saveDb(seed);
    return seed;
  }
}

async function saveDb(db: LocalDb) {
  cachedDb = db;
  await mkdir(dbDir, { recursive: true });
  await writeFile(dbFile, JSON.stringify(db, null, 2), 'utf8');
}

export async function isLocalDbMode() {
  return !(await hasSupabaseRuntimeConfig());
}

export async function readProjects() {
  return (await ensureDb()).projects;
}

export async function createProject(project: Omit<Project, 'id' | 'created_at'>) {
  const db = await ensureDb();
  const row: Project = { ...project, id: crypto.randomUUID(), created_at: new Date().toISOString() };
  db.projects.unshift(row);
  await saveDb(db);
  return row;
}

export async function updateProject(projectId: string, patch: Partial<Omit<Project, 'id' | 'created_at'>>) {
  const db = await ensureDb();
  let updated: Project | null = null;
  db.projects = db.projects.map((project) => {
    if (project.id !== projectId) return project;
    updated = { ...project, ...patch };
    return updated;
  });
  await saveDb(db);
  return updated;
}

export async function deleteProject(projectId: string) {
  const db = await ensureDb();
  db.projects = db.projects.filter((p) => p.id !== projectId);
  db.cn41_uploads = db.cn41_uploads.filter((x) => x.project_id !== projectId);
  db.cn41_rows = db.cn41_rows.filter((x) => x.project_id !== projectId);
  db.gr55_uploads = db.gr55_uploads.filter((x) => x.project_id !== projectId);
  db.gr55_rows = db.gr55_rows.filter((x) => x.project_id !== projectId);
  db.historical_revenue_uploads = db.historical_revenue_uploads.filter((x) => x.project_id !== projectId);
  db.historical_revenue_rows = db.historical_revenue_rows.filter((x) => x.project_id !== projectId);
  db.sales_order_uploads = db.sales_order_uploads.filter((x) => x.project_id !== projectId);
  db.sales_order_rows = db.sales_order_rows.filter((x) => x.project_id !== projectId);
  db.revenue_wbs = db.revenue_wbs.filter((x) => x.project_id !== projectId);
  db.project_subcontracts = db.project_subcontracts.filter((x) => x.project_id !== projectId);
  db.project_wbs_master = db.project_wbs_master.filter((x) => x.project_id !== projectId);
  db.project_manpower_rates = db.project_manpower_rates.filter((x) => x.project_id !== projectId);
  db.project_material_master = db.project_material_master.filter((x) => x.project_id !== projectId);
  db.project_cost_element_control = db.project_cost_element_control.filter((x) => x.project_id !== projectId);
  db.pm_daily_updates = db.pm_daily_updates.filter((x) => x.project_id !== projectId);
  db.simulation_snapshots = db.simulation_snapshots.filter((x) => x.project_id !== projectId);
  db.risk_alerts = db.risk_alerts.filter((x) => x.project_id !== projectId);
  db.comments = db.comments.filter((x) => x.project_id !== projectId);
  await saveDb(db);
}

export async function resetLocalAppData() {
  const db = await ensureDb();
  db.cn41_uploads = [];
  db.cn41_rows = [];
  db.gr55_uploads = [];
  db.gr55_rows = [];
  db.historical_revenue_uploads = [];
  db.historical_revenue_rows = [];
  db.sales_order_uploads = [];
  db.sales_order_rows = [];
  db.revenue_wbs = [];
  db.project_wbs_master = [];
  db.project_subcontracts = [];
  db.project_manpower_rates = [];
  db.project_material_master = [];
  db.project_cost_element_control = [];
  db.pm_daily_updates = [];
  db.simulation_snapshots = [];
  db.risk_alerts = [];
  db.comments = [];
  await saveDb(db);
}

export async function resetLocalEverything() {
  const db = await ensureDb();
  db.projects = [];
  db.cn41_uploads = [];
  db.cn41_rows = [];
  db.gr55_uploads = [];
  db.gr55_rows = [];
  db.historical_revenue_uploads = [];
  db.historical_revenue_rows = [];
  db.sales_order_uploads = [];
  db.sales_order_rows = [];
  db.revenue_wbs = [];
  db.project_wbs_master = [];
  db.project_subcontracts = [];
  db.project_manpower_rates = [];
  db.project_material_master = [];
  db.project_cost_element_control = [];
  db.pm_daily_updates = [];
  db.simulation_snapshots = [];
  db.risk_alerts = [];
  db.comments = [];
  db.users = [];
  await saveDb(db);
}

export async function readRevenueRows(projectId?: string) {
  const db = await ensureDb();
  if (!db.revenue_wbs.length && (db.cn41_rows.length || db.gr55_rows.length || db.sales_order_rows.length)) {
    await rebuildRevenueRows(db);
  }
  return projectId ? db.revenue_wbs.filter((x) => x.project_id === projectId) : db.revenue_wbs;
}

export async function readGr55Rows(projectId?: string) {
  const db = await ensureDb();
  return projectId ? db.gr55_rows.filter((x) => x.project_id === projectId) : db.gr55_rows;
}

export async function readSalesOrderRows(projectId?: string) {
  const db = await ensureDb();
  return projectId ? db.sales_order_rows.filter((x) => x.project_id === projectId) : db.sales_order_rows;
}

export async function readDailyUpdates(projectId?: string) {
  const db = await ensureDb();
  const list = projectId ? db.pm_daily_updates.filter((x) => x.project_id === projectId) : db.pm_daily_updates;
  return [...list].sort((a, b) => {
    const dateCompare = new Date(b.update_date).getTime() - new Date(a.update_date).getTime();
    if (dateCompare !== 0) return dateCompare;
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });
}

export async function readProjectManpowerRates(projectId?: string) {
  const db = await ensureDb();
  return projectId ? db.project_manpower_rates.filter((x) => x.project_id === projectId) : db.project_manpower_rates;
}

export async function readProjectWbsMaster(projectId?: string) {
  const db = await ensureDb();
  return projectId ? db.project_wbs_master.filter((x) => x.project_id === projectId) : db.project_wbs_master;
}

export async function readProjectSubcontracts(projectId?: string) {
  const db = await ensureDb();
  if (!projectId) return db.project_subcontracts;

  const rows = db.project_subcontracts.filter((x) => x.project_id === projectId);
  if (rows.length) return rows;

  const project = db.projects.find((item) => item.id === projectId);
  if (!project?.subcontractor_name && !project?.subcontract_po_number && !project?.subcontract_po_amount && !project?.subcontract_scope) {
    return [];
  }

  return [
    {
      id: `legacy-${projectId}`,
      project_id: projectId,
      package_name: 'Main Package',
      subcontractor_name: project?.subcontractor_name ?? '',
      po_number: project?.subcontract_po_number ?? null,
      po_amount: project?.subcontract_po_amount ?? null,
      scope: project?.subcontract_scope ?? null,
      status: project?.status ?? 'Active',
    },
  ];
}

export async function readProjectCostElementControl(projectId?: string) {
  const db = await ensureDb();
  return projectId ? db.project_cost_element_control.filter((x) => x.project_id === projectId) : db.project_cost_element_control;
}

export async function readProjectMaterialMaster(projectId?: string) {
  const db = await ensureDb();
  return projectId ? db.project_material_master.filter((x) => x.project_id === projectId) : db.project_material_master;
}

export async function readRiskAlerts(projectId?: string) {
  const db = await ensureDb();
  return projectId ? db.risk_alerts.filter((x) => x.project_id === projectId) : db.risk_alerts;
}

export async function readComments(projectId?: string) {
  const db = await ensureDb();
  return projectId ? db.comments.filter((x) => x.project_id === projectId) : db.comments;
}

export async function readLatestUploadDate(projectId: string) {
  const db = await ensureDb();
  const candidates = [
    ...db.cn41_uploads.filter((x) => x.project_id === projectId).map((x) => x.upload_date),
    ...db.gr55_uploads.filter((x) => x.project_id === projectId).map((x) => x.upload_date),
    ...db.historical_revenue_uploads.filter((x) => x.project_id === projectId).map((x) => x.upload_date),
    ...db.sales_order_uploads.filter((x) => x.project_id === projectId).map((x) => x.upload_date),
  ].filter(Boolean) as string[];
  if (!candidates.length) return null;
  return candidates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
}

export async function readLatestSourceUploads(projectId: string) {
  const db = await ensureDb();
  return {
    cn41: db.cn41_uploads
      .filter((row) => row.project_id === projectId)
      .sort((a, b) => new Date(b.upload_date).getTime() - new Date(a.upload_date).getTime())[0] ?? null,
    gr55: db.gr55_uploads
      .filter((row) => row.project_id === projectId)
      .sort((a, b) => new Date(b.upload_date).getTime() - new Date(a.upload_date).getTime())[0] ?? null,
    historical_revenue: db.historical_revenue_uploads
      .filter((row) => row.project_id === projectId)
      .sort((a, b) => new Date(b.upload_date).getTime() - new Date(a.upload_date).getTime())[0] ?? null,
    sales_order: db.sales_order_uploads
      .filter((row) => row.project_id === projectId)
      .sort((a, b) => new Date(b.upload_date).getTime() - new Date(a.upload_date).getTime())[0] ?? null,
  };
}

export async function readHistoricalRevenueRows(projectId?: string) {
  const db = await ensureDb();
  return projectId ? db.historical_revenue_rows.filter((x) => x.project_id === projectId) : db.historical_revenue_rows;
}

export async function readLatestGr55UploadDate(projectId: string) {
  const db = await ensureDb();
  const latest = db.gr55_uploads
    .filter((x) => x.project_id === projectId)
    .sort((a, b) => new Date(b.upload_date).getTime() - new Date(a.upload_date).getTime())[0];
  return latest?.upload_date ?? null;
}

export async function readLatestSalesOrderUploadDate(projectId: string) {
  const db = await ensureDb();
  const latest = db.sales_order_uploads
    .filter((x) => x.project_id === projectId)
    .sort((a, b) => new Date(b.upload_date).getTime() - new Date(a.upload_date).getTime())[0];
  return latest?.upload_date ?? null;
}

export async function readLatestCn41Rows(projectId: string) {
  const db = await ensureDb();
  const latest = db.cn41_uploads
    .filter((x) => x.project_id === projectId)
    .sort((a, b) => new Date(b.upload_date).getTime() - new Date(a.upload_date).getTime())[0];
  if (!latest) return [];
  return db.cn41_rows.filter((row) => row.project_id === projectId && row.upload_id === latest.id);
}

export async function saveCn41Upload(input: {
  project_id: string;
  file_name: string;
  file_url: string;
  version_no: number;
  rows: Array<any>;
}) {
  const db = await ensureDb();
  const upload = {
    id: crypto.randomUUID(),
    project_id: input.project_id,
    file_name: input.file_name,
    file_url: input.file_url,
    upload_date: new Date().toISOString(),
    uploaded_by: null,
    version_no: input.version_no,
    is_latest: true,
  };
  db.cn41_uploads = db.cn41_uploads.filter((x) => x.project_id !== input.project_id);
  db.cn41_uploads.unshift(upload);
  db.cn41_rows = db.cn41_rows.filter((row) => row.project_id !== input.project_id);
  db.cn41_rows.push(...input.rows.map((row) => ({ ...row, upload_id: upload.id, project_id: input.project_id })));
  await rebuildRevenueRows(db);
  await refreshComputedArtifacts(db, input.project_id, upload.id);
  await saveDb(db);
  return upload;
}

export async function saveGr55Upload(input: {
  project_id: string;
  file_name: string;
  file_url: string;
  version_no: number;
  rows: Array<any>;
}) {
  const db = await ensureDb();
  const upload = {
    id: crypto.randomUUID(),
    project_id: input.project_id,
    file_name: input.file_name,
    file_url: input.file_url,
    upload_date: new Date().toISOString(),
    uploaded_by: null,
    version_no: input.version_no,
    is_latest: true,
  };
  db.gr55_uploads = db.gr55_uploads.filter((x) => x.project_id !== input.project_id);
  db.gr55_uploads.unshift(upload);
  db.gr55_rows = db.gr55_rows.filter((row) => row.project_id !== input.project_id);
  db.gr55_rows.push(...input.rows.map((row) => ({ ...row, upload_id: upload.id, project_id: input.project_id })));
  await rebuildRevenueRows(db);
  await refreshComputedArtifacts(db, input.project_id, upload.id);
  await saveDb(db);
  return upload;
}

export async function saveHistoricalRevenueUpload(input: {
  project_id: string;
  file_name: string;
  file_url: string;
  version_no: number;
  rows: Array<any>;
}) {
  const db = await ensureDb();
  const upload = {
    id: crypto.randomUUID(),
    project_id: input.project_id,
    file_name: input.file_name,
    file_url: input.file_url,
    upload_date: new Date().toISOString(),
    uploaded_by: null,
    version_no: input.version_no,
    is_latest: true,
  };
  db.historical_revenue_uploads = db.historical_revenue_uploads.filter((x) => x.project_id !== input.project_id);
  db.historical_revenue_uploads.unshift(upload);
  db.historical_revenue_rows = db.historical_revenue_rows.filter((row) => row.project_id !== input.project_id);
  db.historical_revenue_rows.push(...input.rows.map((row) => ({ ...row, upload_id: upload.id, project_id: input.project_id })));
  await rebuildRevenueRows(db);
  await refreshComputedArtifacts(db, input.project_id, upload.id);
  await saveDb(db);
  return upload;
}

export async function saveSalesOrderUpload(input: {
  project_id: string;
  file_name: string;
  file_url: string;
  version_no: number;
  rows: Array<any>;
}) {
  const db = await ensureDb();
  const upload = {
    id: crypto.randomUUID(),
    project_id: input.project_id,
    file_name: input.file_name,
    file_url: input.file_url,
    upload_date: new Date().toISOString(),
    uploaded_by: null,
    version_no: input.version_no,
    is_latest: true,
  };
  db.sales_order_uploads = db.sales_order_uploads.filter((x) => x.project_id !== input.project_id);
  db.sales_order_uploads.unshift(upload);
  db.sales_order_rows = db.sales_order_rows.filter((row) => row.project_id !== input.project_id);
  db.sales_order_rows.push(...input.rows.map((row) => ({ ...row, upload_id: upload.id, project_id: input.project_id })));
  await rebuildRevenueRows(db);
  await refreshComputedArtifacts(db, input.project_id, upload.id);
  await saveDb(db);
  return upload;
}

export async function recalculateLocalFinancials(projectId: string) {
  const db = await ensureDb();
  await rebuildRevenueRows(db);
  const projectRows = db.revenue_wbs.filter((row) => row.project_id === projectId);
  const latestUploadId = latestUploadIdForProject(db, projectId);

  db.risk_alerts = db.risk_alerts.filter((row) => row.project_id !== projectId);
  db.risk_alerts.push(...buildRiskAlerts(projectRows).map((risk) => ({ ...risk, project_id: projectId })));
  db.simulation_snapshots = db.simulation_snapshots.filter((row) => row.project_id !== projectId);
  db.simulation_snapshots.push({
    ...createSnapshot(projectId, projectRows),
    project_id: projectId,
    upload_id: latestUploadId,
  });
  await saveDb(db);

  return {
    projectId,
    rowCount: projectRows.length,
    uploadId: latestUploadId,
  };
}

async function rebuildRevenueRows(db: LocalDb) {
  const projectIds = new Set([
    ...db.cn41_rows.map((row) => row.project_id),
    ...db.gr55_rows.map((row) => row.project_id),
    ...db.historical_revenue_rows.map((row) => row.project_id),
    ...db.sales_order_rows.map((row) => row.project_id),
    ...db.pm_daily_updates.map((row) => row.project_id),
    ...db.project_wbs_master.map((row) => row.project_id),
  ]);

  const rows: RevenueWBS[] = [];
  for (const projectId of projectIds) {
    const projectCn41Rows = db.cn41_rows.filter((row) => row.project_id === projectId);
    const projectGr55Rows = db.gr55_rows.filter((row) => row.project_id === projectId);
    const projectHistRevRows = db.historical_revenue_rows.filter((row) => row.project_id === projectId);
    const projectSalesRows = db.sales_order_rows.filter((row) => row.project_id === projectId);
    const projectUpdates = db.pm_daily_updates.filter((row) => row.project_id === projectId);
    const projectWbsMaster = db.project_wbs_master.filter((row) => row.project_id === projectId);
    const projectCostElements = db.project_cost_element_control.filter((row) => row.project_id === projectId);
    const previousRows = db.revenue_wbs.filter((row) => row.project_id === projectId);
    const rebuilt = buildFinancialRowsFromSources({
      projectId,
      cn41Rows: projectCn41Rows as any,
      gr55Rows: projectGr55Rows as any,
      historicalRevenueRows: projectHistRevRows as any,
      salesOrderRows: projectSalesRows as any,
      updates: projectUpdates as any,
      existingRows: previousRows as any,
      projectWbsMaster: projectWbsMaster as any,
      projectCostElements: projectCostElements as any,
    });

    rows.push(...rebuilt.map((row) => ({
      ...row,
      project_id: projectId,
      upload_id: null,
    })));
  }

  db.revenue_wbs = rows.sort((a, b) => a.wbs_code.localeCompare(b.wbs_code));
  await saveDb(db);
}

async function refreshComputedArtifacts(db: LocalDb, projectId: string, uploadId: string) {
  const projectRows = db.revenue_wbs.filter((row) => row.project_id === projectId);
  db.risk_alerts = db.risk_alerts.filter((row) => row.project_id !== projectId);
  db.risk_alerts.push(...buildRiskAlerts(projectRows).map((risk) => ({ ...risk, project_id: projectId })));
  db.simulation_snapshots = db.simulation_snapshots.filter((row) => row.project_id !== projectId);
  db.simulation_snapshots.push({
    ...createSnapshot(projectId, projectRows),
    project_id: projectId,
    upload_id: uploadId,
  });
}

function latestUploadIdForProject(db: LocalDb, projectId: string) {
  const candidates = [
    ...(db.cn41_uploads ?? []).filter((row) => row.project_id === projectId),
    ...(db.gr55_uploads ?? []).filter((row) => row.project_id === projectId),
    ...(db.sales_order_uploads ?? []).filter((row) => row.project_id === projectId),
  ].filter(Boolean);

  if (!candidates.length) return null;

  return candidates
    .slice()
    .sort((a, b) => new Date(b.upload_date).getTime() - new Date(a.upload_date).getTime())[0]?.id ?? null;
}

function normalizeCode(code: string) {
  return code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export async function savePmUpdate(input: {
  project_id: string;
  revenue_wbs_id: string;
  update_date: string;
  expected_progress: number;
  activity_name: string;
  today_progress_percent: number;
  today_completed_quantity: number;
  pending_material_cost: number;
  pending_subcontractor_cost: number;
  pending_manpower_cost: number;
  pending_equipment_cost: number;
  total_pending_cost: number;
  subcontract_lines?: Array<any>;
  manpower_lines?: Array<any>;
  material_lines?: Array<any>;
  remarks: string;
  issue_delay: string;
  submitted_by: string;
  approval_status: string;
  sap_posted: boolean;
  material_sap_posted?: boolean;
  material_posted_at?: string | null;
  material_posted_by?: string | null;
  material_posting_reference?: string | null;
  subcontract_sap_posted?: boolean;
  subcontract_posted_at?: string | null;
  subcontract_posted_by?: string | null;
  subcontract_posting_reference?: string | null;
  manpower_sap_posted?: boolean;
  manpower_posted_at?: string | null;
  manpower_posted_by?: string | null;
  manpower_posting_reference?: string | null;
}) {
  const db = await ensureDb();
  const row = { ...input, id: crypto.randomUUID(), created_at: new Date().toISOString() };
  db.pm_daily_updates.unshift(row);
  await rebuildRevenueRows(db);
  await saveDb(db);
  return row;
}

export async function updatePmUpdatePostingStatus(
  id: string,
  patch: Pick<
    DailyUpdate,
    | 'material_sap_posted'
      | 'material_posted_at'
      | 'material_posted_by'
      | 'material_posting_reference'
      | 'material_updated_by'
      | 'material_updated_at'
      | 'subcontract_sap_posted'
      | 'subcontract_posted_at'
      | 'subcontract_posted_by'
      | 'subcontract_posting_reference'
      | 'subcontract_updated_by'
      | 'subcontract_updated_at'
      | 'manpower_sap_posted'
      | 'manpower_posted_at'
      | 'manpower_posted_by'
      | 'manpower_posting_reference'
      | 'manpower_updated_by'
      | 'manpower_updated_at'
    >,
) {
  const db = await ensureDb();
  const targetIndex = db.pm_daily_updates.findIndex((item) => item.id === id);
  if (targetIndex < 0) {
    await saveDb(db);
    return null;
  }

  const updatedRow: DailyUpdate = {
    ...db.pm_daily_updates[targetIndex],
    ...patch,
  };
  db.pm_daily_updates[targetIndex] = updatedRow;
  await rebuildRevenueRows(db);
  await saveDb(db);
  return updatedRow;
}

export async function deleteLocalPmUpdate(id: string) {
  const db = await ensureDb();
  db.pm_daily_updates = db.pm_daily_updates.filter((item) => item.id !== id);
  await rebuildRevenueRows(db);
  await saveDb(db);
}

export async function updateLocalPmUpdate(id: string, patch: Partial<DailyUpdate>) {
  const db = await ensureDb();
  let updated = null;
  db.pm_daily_updates = db.pm_daily_updates.map((item) => {
    if (item.id !== id) return item;
    updated = {
      ...item,
      ...patch,
    };
    return updated;
  });
  await rebuildRevenueRows(db);
  await saveDb(db);
  return updated;
}


export async function createProjectManpowerRate(input: Omit<ProjectManpowerRate, 'id' | 'created_at'>) {
  const db = await ensureDb();
  const row: ProjectManpowerRate = {
    ...input,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    is_active: input.is_active ?? true,
  };
  db.project_manpower_rates.unshift(row);
  await saveDb(db);
  return row;
}

export async function replaceProjectCostElementControl(
  projectId: string,
  rows: Array<Omit<ProjectCostElementControl, 'id' | 'project_id' | 'created_at'>>
) {
  const db = await ensureDb();
  db.project_cost_element_control = db.project_cost_element_control.filter((item) => item.project_id !== projectId);

  const freshRows: ProjectCostElementControl[] = rows.map((row) => ({
    ...row,
    id: crypto.randomUUID(),
    project_id: projectId,
    created_at: new Date().toISOString(),
  }));

  db.project_cost_element_control.unshift(...freshRows);
  await rebuildRevenueRows(db);
  await saveDb(db);
  return freshRows;
}
export async function replaceProjectWbsMaster(
  projectId: string,
  rows: Array<Omit<ProjectWbsMaster, 'id' | 'project_id' | 'created_at'>>
) {
  const db = await ensureDb();
  db.project_wbs_master = db.project_wbs_master.filter((item) => item.project_id !== projectId);

  const freshRows: ProjectWbsMaster[] = rows.map((row) => ({
    ...row,
    id: crypto.randomUUID(),
    project_id: projectId,
    created_at: new Date().toISOString(),
  }));

  db.project_wbs_master.unshift(...freshRows);
  await saveDb(db);
  return freshRows;
}

export async function replaceProjectSubcontracts(
  projectId: string,
  rows: Array<Omit<ProjectSubcontract, 'id' | 'project_id' | 'created_at'>>
) {
  const db = await ensureDb();
  db.project_subcontracts = db.project_subcontracts.filter((item) => item.project_id !== projectId);

  const freshRows: ProjectSubcontract[] = rows.map((row) => ({
    ...row,
    id: crypto.randomUUID(),
    project_id: projectId,
    created_at: new Date().toISOString(),
  }));

  db.project_subcontracts.unshift(...freshRows);
  await saveDb(db);
  return freshRows;
}

export async function deleteProjectManpowerRate(id: string) {
  const db = await ensureDb();
  db.project_manpower_rates = db.project_manpower_rates.filter((item) => item.id !== id);
  await saveDb(db);
}

export async function createProjectMaterialMaster(input: Omit<ProjectMaterialMaster, 'id' | 'created_at'>) {
  const db = await ensureDb();
  const row: ProjectMaterialMaster = {
    ...input,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    is_active: input.is_active ?? true,
  };
  db.project_material_master.unshift(row);
  await saveDb(db);
  return row;
}

export async function deleteProjectMaterialMaster(id: string) {
  const db = await ensureDb();
  db.project_material_master = db.project_material_master.filter((item) => item.id !== id);
  await saveDb(db);
}

export async function updateLocalProjectMaterialMaster(id: string, patch: Partial<Omit<ProjectMaterialMaster, 'id' | 'created_at'>>) {
  const db = await ensureDb();
  let updated = null;
  db.project_material_master = db.project_material_master.map((item) => {
    if (item.id !== id) return item;
    updated = {
      ...item,
      ...patch,
    };
    return updated;
  });
  await rebuildRevenueRows(db);
  await saveDb(db);
  return updated;
}

export async function updateLocalProjectManpowerRate(id: string, patch: Partial<Omit<ProjectManpowerRate, 'id' | 'created_at'>>) {
  const db = await ensureDb();
  let updated = null;
  db.project_manpower_rates = db.project_manpower_rates.map((item) => {
    if (item.id !== id) return item;
    updated = {
      ...item,
      ...patch,
    };
    return updated;
  });
  await rebuildRevenueRows(db);
  await saveDb(db);
  return updated;
}


export async function saveComment(input: { project_id: string; wbs_code: string; comment_text: string; created_by: string | null }) {
  const db = await ensureDb();
  const row = { ...input, id: crypto.randomUUID(), created_at: new Date().toISOString() };
  db.comments.unshift(row);
  await saveDb(db);
  return row;
}

export async function readLocalUsers() {
  const db = await ensureDb();
  return db.users ?? [];
}

export async function readLocalBackupSnapshot() {
  const db = await ensureDb();
  return {
    projects: db.projects ?? [],
    cn41_uploads: db.cn41_uploads ?? [],
    cn41_rows: db.cn41_rows ?? [],
    gr55_uploads: db.gr55_uploads ?? [],
    gr55_rows: db.gr55_rows ?? [],
    sales_order_uploads: db.sales_order_uploads ?? [],
    sales_order_rows: db.sales_order_rows ?? [],
    revenue_wbs: db.revenue_wbs ?? [],
    project_wbs_master: db.project_wbs_master ?? [],
    project_subcontracts: db.project_subcontracts ?? [],
    project_manpower_rates: db.project_manpower_rates ?? [],
    project_material_master: db.project_material_master ?? [],
    project_cost_element_control: db.project_cost_element_control ?? [],
    pm_daily_updates: db.pm_daily_updates ?? [],
    simulation_snapshots: db.simulation_snapshots ?? [],
    risk_alerts: db.risk_alerts ?? [],
    comments: db.comments ?? [],
    users: db.users ?? [],
    users_profile: db.users ?? [],
  };
}

export async function createLocalUser(input: { email: string; full_name: string | null; phone: string | null; role: string }) {
  const db = await ensureDb();
  const id = crypto.randomUUID();
  const row = {
    id,
    user_id: id,
    email: input.email,
    full_name: input.full_name,
    phone: input.phone,
    role: input.role,
    created_at: new Date().toISOString(),
  };
  db.users.unshift(row);
  await saveDb(db);
  return row;
}

export async function deleteLocalUser(id: string) {
  const db = await ensureDb();
  db.users = db.users.filter((u) => u.id !== id && u.user_id !== id);
  await saveDb(db);
}

export async function updateLocalUser(userId: string, patch: { full_name?: string | null; role?: string; email?: string; phone?: string | null }) {
  const db = await ensureDb();
  let updated = null;
  db.users = db.users.map((u) => {
    if (u.id !== userId && u.user_id !== userId) return u;
    updated = {
      ...u,
      full_name: patch.full_name !== undefined ? patch.full_name : u.full_name,
      role: patch.role !== undefined ? patch.role : u.role,
      email: patch.email !== undefined ? patch.email : u.email,
      phone: patch.phone !== undefined ? patch.phone : u.phone,
    };
    return updated;
  });
  await saveDb(db);
  return updated;
}
