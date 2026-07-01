import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { fetchAllSupabaseRows } from '@/lib/supabase/pagination';
import { buildFinancialRowsFromSources } from '@/lib/financial-engine';
import {
  createProjectManpowerRate as createLocalProjectManpowerRate,
  createProjectMaterialMaster as createLocalProjectMaterialMaster,
  createProject as createLocalProject,
  deleteProjectManpowerRate as deleteLocalProjectManpowerRate,
  deleteProjectMaterialMaster as deleteLocalProjectMaterialMaster,
  deleteProject as deleteLocalProject,
  isLocalDbMode,
  readComments as readLocalComments,
  readLatestCn41Rows as readLocalLatestCn41Rows,
  readDailyUpdates as readLocalDailyUpdates,
  readLatestUploadDate as readLocalLatestUploadDate,
  readLatestSourceUploads as readLocalLatestSourceUploads,
  readProjectManpowerRates as readLocalProjectManpowerRates,
  readProjectMaterialMaster as readLocalProjectMaterialMaster,
  readProjectCostElementControl as readLocalProjectCostElementControl,
  readProjectSubcontracts as readLocalProjectSubcontracts,
  readProjectWbsMaster as readLocalProjectWbsMaster,
  readProjects as readLocalProjects,
  readRevenueRows as readLocalRevenueRows,
  updateLocalProjectMaterialMaster,
  updateLocalProjectManpowerRate,
  deleteLocalPmUpdate,
  updateLocalPmUpdate,
  readRiskAlerts as readLocalRiskAlerts,
  readSalesOrderRows as readLocalSalesOrderRows,
  readGr55Rows as readLocalGr55Rows,
  readLocalUsers,
  replaceProjectSubcontracts as replaceLocalProjectSubcontracts,
  replaceProjectWbsMaster as replaceLocalProjectWbsMaster,
  replaceProjectCostElementControl as replaceLocalProjectCostElementControl,
  updateProject as updateLocalProject,
} from '@/lib/local-db';
import type {
  DailyUpdate,
  Gr55CostRow,
  Project,
  ProjectManpowerRate,
  ProjectMaterialMaster,
  ProjectCostElementControl,
  ProjectSubcontract,
  ProjectWbsMaster,
  RevenueWBS,
  RiskAlert,
  SalesOrderRevenueRow,
  UserProfile,
} from '@/lib/types';
import { isWbsElementObjectType } from '@/lib/cn41';
import { safeNumber } from '@/lib/utils';

type StoredCn41Row = {
  upload_id?: string | null;
  project_id: string;
  level: number;
  object_type?: string | null;
  wbs_code?: string | null;
  wbs_description?: string | null;
  actual_cost?: number | null;
  planned_cost?: number | null;
  raw_data_json?: Record<string, string | number | boolean | null> | null;
};

const PROJECT_SELECT_BASE = 'id, project_code, project_name, client_name, status, created_at';
const PROJECT_SELECT_EXTENDED =
  'id, project_code, project_name, client_name, project_manager_user_id, project_manager_name, project_manager_email, project_manager_phone, site_location, subcontractor_name, subcontract_po_number, subcontract_po_amount, subcontract_scope, status, created_at';

export async function getProjects(): Promise<Project[]> {
  if (await isLocalDbMode()) return readLocalProjects();
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('projects')
      .select(PROJECT_SELECT_EXTENDED)
      .order('created_at', { ascending: false });

    if (!error && data) return data as Project[];

    if (error && isMissingProjectExtendedColumnError(error.message)) {
      const fallback = await supabase
        .from('projects')
        .select(PROJECT_SELECT_BASE)
        .order('created_at', { ascending: false });
      if (!fallback.error && fallback.data) return fallback.data as Project[];
    }
  } catch {
    // ignore and return empty
  }
  return [];
}

export async function getProjectManagerUsers(): Promise<UserProfile[]> {
  if (await isLocalDbMode()) {
    return (await readLocalUsers())
      .filter((user) => user.role === 'Project Manager')
      .map((user) => ({
        id: user.id,
        user_id: user.user_id,
        full_name: user.full_name ?? null,
        phone: user.phone ?? null,
        role: user.role as UserProfile['role'],
        created_at: user.created_at,
        email: user.email,
      }));
  }

  try {
    const supabase = await createSupabaseAdminClient();
    const [{ data: authData, error: authError }, { data: profileRows, error: profileError }] = await Promise.all([
      supabase.auth.admin.listUsers(),
      supabase.from('users_profile').select('*'),
    ]);
    if (authError) throw authError;
    if (profileError) throw profileError;

    const profileMap = new Map((profileRows ?? []).map((row) => [row.user_id, row]));
    return (authData.users ?? [])
      .map((user) => {
        const profile = profileMap.get(user.id);
        const role = String(profile?.role ?? user.user_metadata?.role ?? 'Viewer');
        if (role !== 'Project Manager') return null;
        return {
          id: profile?.id ?? user.id,
          user_id: user.id,
          full_name: profile?.full_name ?? user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
          phone: profile?.phone ?? user.user_metadata?.phone ?? null,
          role,
          created_at: profile?.created_at ?? user.created_at,
          email: user.email ?? '',
        } satisfies UserProfile;
      })
      .filter(Boolean)
      .sort((a, b) => (a?.full_name ?? '').localeCompare(b?.full_name ?? '')) as UserProfile[];
  } catch {
    return [];
  }
}

export async function getProjectById(projectId: string): Promise<Project | undefined> {
  const projects = await getProjects();
  return projects.find((project) => project.id === projectId);
}

export async function getRevenueRows(projectId?: string): Promise<RevenueWBS[]> {
  if (await isLocalDbMode()) return readLocalRevenueRows(projectId);
  try {
    const supabase = await createSupabaseServerClient();
    const data = await fetchAllSupabaseRows<RevenueWBS>(() => {
      let query = supabase.from('revenue_wbs').select('*').order('wbs_code', { ascending: true });
      if (projectId) query = query.eq('project_id', projectId);
      return query;
    });
    return data;
  } catch {
    return [];
  }
}

export async function getRevenueGeneratingRows(projectId?: string): Promise<RevenueWBS[]> {
  const rows = await getRevenueRows(projectId);
  if (!rows.length) return [];

  if (projectId) {
    const masterRows = await getProjectWbsMaster(projectId);
    return filterRevenueGeneratingRows(rows, masterRows);
  }

  const projectIds = Array.from(new Set(rows.map((row) => row.project_id).filter(Boolean)));
  const masterRowsByProject = new Map<string, ProjectWbsMaster[]>();
  await Promise.all(
    projectIds.map(async (id) => {
      masterRowsByProject.set(id, await getProjectWbsMaster(id));
    }),
  );

  return rows.filter((row) => {
    const masterRows = masterRowsByProject.get(row.project_id) ?? [];
    return filterRevenueGeneratingRows([row], masterRows).length > 0;
  });
}

export async function getSalesOrderRevenueRows(projectId?: string): Promise<SalesOrderRevenueRow[]> {
  if (await isLocalDbMode()) return readLocalSalesOrderRows(projectId);
  try {
    const supabase = await createSupabaseServerClient();
    
    let uploadId: string | null = null;
    if (projectId) {
      const { data: latestUpload } = await supabase
        .from('sales_order_uploads')
        .select('id')
        .eq('project_id', projectId)
        .eq('is_latest', true)
        .order('upload_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestUpload) {
        uploadId = latestUpload.id;
      } else {
        return []; // No uploads found
      }
    }

    const data = await fetchAllSupabaseRows<SalesOrderRevenueRow>(() => {
      let query = supabase.from('sales_order_rows').select('*').order('wbs_code', { ascending: true });
      if (projectId) {
        query = query.eq('project_id', projectId);
        if (uploadId) {
          query = query.eq('upload_id', uploadId);
        }
      }
      return query;
    });
    if (data.length) return data;
  } catch {
    // ignore and return empty
  }
  return [];
}

export async function getDailyUpdates(projectId?: string): Promise<DailyUpdate[]> {
  if (await isLocalDbMode()) return readLocalDailyUpdates(projectId);
  try {
    const supabase = await createSupabaseServerClient();
    const data = await fetchAllSupabaseRows<DailyUpdate>(() => {
      let query = supabase
        .from('pm_daily_updates')
        .select('*')
        .order('update_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (projectId) query = query.eq('project_id', projectId);
      return query;
    });
    if (data.length) return data;
  } catch {
    // ignore and return empty
  }
  return [];
}

export async function getGr55Rows(projectId?: string): Promise<Gr55CostRow[]> {
  if (await isLocalDbMode()) return readLocalGr55Rows(projectId);
  try {
    const supabase = await createSupabaseServerClient();
    
    let uploadId: string | null = null;
    if (projectId) {
      const { data: latestUpload } = await supabase
        .from('gr55_uploads')
        .select('id')
        .eq('project_id', projectId)
        .eq('is_latest', true)
        .order('upload_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestUpload) {
        uploadId = latestUpload.id;
      } else {
        return []; // No uploads found
      }
    }

    const data = await fetchAllSupabaseRows<any>(() => {
      let query = supabase
        .from('gr55_rows')
        .select('posting_date, wbs_code, cost_category, cost_element, purchasing_document, amount, raw_data_json')
        .order('posting_date', { ascending: true });
      if (projectId) {
        query = query.eq('project_id', projectId);
        if (uploadId) {
          query = query.eq('upload_id', uploadId);
        }
      }
      return query;
    });
    return data.map((row: any) => ({
      ...row,
      raw_data_json: row.raw_data_json || {},
    })) as Gr55CostRow[];
  } catch {
    return [];
  }
}

export async function getProjectManpowerRates(projectId?: string): Promise<ProjectManpowerRate[]> {
  if (await isLocalDbMode()) return readLocalProjectManpowerRates(projectId);
  try {
    const supabase = await createSupabaseServerClient();
    let query = supabase.from('project_manpower_rates').select('*').order('created_at', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (!error && data?.length) return data as ProjectManpowerRate[];
  } catch {
    // ignore and return empty
  }
  return [];
}

export async function getProjectSubcontracts(projectId?: string): Promise<ProjectSubcontract[]> {
  if (await isLocalDbMode()) return readLocalProjectSubcontracts(projectId);
  try {
    const supabase = await createSupabaseServerClient();
    let query = supabase.from('project_subcontracts').select('*').order('created_at', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (!error && data?.length) return data as ProjectSubcontract[];
    if (!error) {
      if (!projectId) return [];
      const legacyProject = await getProjectById(projectId);
      return buildLegacySubcontractRows(legacyProject);
    }
  } catch {
    // ignore and return empty
  }
  if (!projectId) return [];
  const legacyProject = await getProjectById(projectId);
  return buildLegacySubcontractRows(legacyProject);
}

export async function getProjectMaterialMaster(projectId?: string): Promise<ProjectMaterialMaster[]> {
  if (await isLocalDbMode()) return readLocalProjectMaterialMaster(projectId);
  try {
    const supabase = await createSupabaseServerClient();
    let query = supabase.from('project_material_master').select('*').order('created_at', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (!error && data?.length) return data as ProjectMaterialMaster[];
  } catch {
    // ignore and return empty
  }
  return [];
}

export async function getProjectCostElementControl(projectId: string): Promise<ProjectCostElementControl[]> {
  if (await isLocalDbMode()) return readLocalProjectCostElementControl(projectId);

  try {
    const supabase = await createSupabaseServerClient();
    const data = await fetchAllSupabaseRows<ProjectCostElementControl>(() =>
      supabase
        .from('project_cost_element_control')
        .select('*')
        .eq('project_id', projectId)
        .order('cost_element', { ascending: true }),
    );
    return data;
  } catch {
    return [];
  }
}
export async function getProjectWbsMaster(projectId: string): Promise<ProjectWbsMaster[]> {
  const revenueRows = await getRevenueRows(projectId);
  const latestCn41Rows = await getLatestCn41Rows(projectId);

  if (await isLocalDbMode()) {
    const stored = await readLocalProjectWbsMaster(projectId);
    return mergeProjectWbsMasterRows(projectId, latestCn41Rows, revenueRows, stored);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('project_wbs_master')
      .select('*')
      .eq('project_id', projectId)
      .order('wbs_code', { ascending: true });

    if (!error) {
      return mergeProjectWbsMasterRows(projectId, latestCn41Rows, revenueRows, (data ?? []) as ProjectWbsMaster[]);
    }
  } catch {
    // ignore and fall back to inferred rows
  }

  return mergeProjectWbsMasterRows(projectId, latestCn41Rows, revenueRows, []);
}

export async function getRiskAlerts(projectId?: string): Promise<RiskAlert[]> {
  if (await isLocalDbMode()) return readLocalRiskAlerts(projectId);
  try {
    const supabase = await createSupabaseServerClient();
    let query = supabase.from('risk_alerts').select('*').order('created_at', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (!error && data?.length) return data as RiskAlert[];
  } catch {
    // ignore and return empty
  }
  return [];
}

export async function getComments(projectId?: string) {
  if (await isLocalDbMode()) return readLocalComments(projectId);
  try {
    const supabase = await createSupabaseServerClient();
    let query = supabase.from('comments').select('*').order('created_at', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (!error && data?.length) return data;
  } catch {
    // ignore and return empty
  }
  return [];
}

export async function getLatestUploadDate(projectId: string) {
  if (await isLocalDbMode()) return readLocalLatestUploadDate(projectId);
  try {
    const supabase = await createSupabaseServerClient();
    const [cn41, gr55, sales] = await Promise.all([
      supabase.from('cn41_uploads').select('upload_date').eq('project_id', projectId).order('upload_date', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('gr55_uploads').select('upload_date').eq('project_id', projectId).order('upload_date', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('sales_order_uploads').select('upload_date').eq('project_id', projectId).order('upload_date', { ascending: false }).limit(1).maybeSingle(),
    ]);
    const dates = [cn41.data?.upload_date, gr55.data?.upload_date, sales.data?.upload_date].filter(Boolean) as string[];
    if (!dates.length) return null;
    return dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
  } catch {
    return null;
  }
}

export type LatestSourceUpload = {
  id: string;
  project_id: string;
  file_name: string;
  file_url: string;
  upload_date: string;
  version_no: number;
  is_latest: boolean;
} | null;

export async function getLatestSourceUploads(projectId: string) {
  if (await isLocalDbMode()) return readLocalLatestSourceUploads(projectId);

  try {
    const supabase = await createSupabaseServerClient();
    const [cn41, gr55, sales] = await Promise.all([
      supabase
        .from('cn41_uploads')
        .select('id, project_id, file_name, file_url, upload_date, version_no, is_latest')
        .eq('project_id', projectId)
        .eq('is_latest', true)
        .order('upload_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('gr55_uploads')
        .select('id, project_id, file_name, file_url, upload_date, version_no, is_latest')
        .eq('project_id', projectId)
        .eq('is_latest', true)
        .order('upload_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('sales_order_uploads')
        .select('id, project_id, file_name, file_url, upload_date, version_no, is_latest')
        .eq('project_id', projectId)
        .eq('is_latest', true)
        .order('upload_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    return {
      cn41: (cn41.data ?? null) as LatestSourceUpload,
      gr55: (gr55.data ?? null) as LatestSourceUpload,
      sales_order: (sales.data ?? null) as LatestSourceUpload,
    };
  } catch {
    return {
      cn41: null,
      gr55: null,
      sales_order: null,
    };
  }
}

export async function getLatestCn41Rows(projectId: string): Promise<StoredCn41Row[]> {
  if (await isLocalDbMode()) return (await readLocalLatestCn41Rows(projectId)) as StoredCn41Row[];
  try {
    const supabase = await createSupabaseServerClient();
    const { data: latestUpload } = await supabase
      .from('cn41_uploads')
      .select('id')
      .eq('project_id', projectId)
      .eq('is_latest', true)
      .order('upload_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestUpload?.id) return [];

    const data = await fetchAllSupabaseRows<StoredCn41Row>(() =>
      supabase
        .from('cn41_rows')
        .select('upload_id, project_id, level, object_type, wbs_code, wbs_description, actual_cost, planned_cost, raw_data_json')
        .eq('project_id', projectId)
        .eq('upload_id', latestUpload.id),
    );
    return data;
  } catch {
    // ignore and return empty
  }
  return [];
}

export function summarizeProjectCosts(rows: StoredCn41Row[], revenueRows: RevenueWBS[]) {
  const revenueBaseActual = revenueRows.reduce((sum, row) => sum + safeNumber(row.sap_actual_cost), 0);
  const revenueBasePlanned = revenueRows.reduce((sum, row) => sum + safeNumber(row.sap_planned_cost), 0);

  const revenueCodes = new Set(revenueRows.map((row) => normalizeWbsHierarchyCode(row.wbs_code)).filter(Boolean));

  const wbsRows = rows
    .filter((row) => String(row.wbs_code ?? '').trim())
    .filter((row) => isWbsElementObjectType(String(row.object_type ?? '')));

  const uniqueRows = wbsRows.filter((row, index, array) => {
    const code = normalizeWbsHierarchyCode(String(row.wbs_code ?? '').trim());
    return array.findIndex((item) => normalizeWbsHierarchyCode(String(item.wbs_code ?? '').trim()) === code) === index;
  });

  const nonRevenueRows = uniqueRows.filter((row) => {
    const code = normalizeWbsHierarchyCode(String(row.wbs_code ?? '').trim());
    if (!code) return false;
    if (revenueCodes.has(code)) return false;
    return !Array.from(revenueCodes).some((revenueCode) => revenueCode.startsWith(code));
  });

  const nonRevenueLeaves = nonRevenueRows.filter((row) => {
    const code = normalizeWbsHierarchyCode(String(row.wbs_code ?? '').trim());
    const level = safeNumber(row.level);
    return !nonRevenueRows.some((candidate) => {
      const candidateCode = normalizeWbsHierarchyCode(String(candidate.wbs_code ?? '').trim());
      if (!candidateCode || candidateCode === code) return false;
      return safeNumber(candidate.level) > level && candidateCode.startsWith(code);
    });
  });

  const extras = nonRevenueLeaves.length ? nonRevenueLeaves : nonRevenueRows;

  return {
    actualCost: revenueBaseActual + extras.reduce((sum, row) => sum + safeNumber(row.actual_cost), 0),
    plannedCost: revenueBasePlanned + extras.reduce((sum, row) => sum + safeNumber(row.planned_cost), 0),
    extraBranchCount: extras.length,
  };
}

export function summarizeSapRevenueValidation(rows: StoredCn41Row[], revenueRows: RevenueWBS[]) {
  const validatedSapRevenue = rows
    .filter((row) => isLevel03WbsRow(row))
    .reduce((sum, row) => sum + safeNumber(extractActualRevenue(row)), 0);

  const derivedSapRevenue = revenueRows.reduce((sum, row) => sum + safeNumber(row.sap_earned_revenue), 0);

  return {
    sapRevenue: validatedSapRevenue > 0 ? validatedSapRevenue : derivedSapRevenue,
    validatedSapRevenue,
    derivedSapRevenue,
    usesValidatedRevenue: validatedSapRevenue > 0,
  };
}

function normalizeWbsHierarchyCode(code: string) {
  return code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function isLevel03WbsRow(row: StoredCn41Row) {
  const raw = row.raw_data_json ?? {};
  const levelValue = String(row.level ?? raw.level ?? raw.lev ?? '').trim();
  const objectType = String(row.object_type ?? raw.object_type ?? raw.objecttype ?? '').trim().toLowerCase();
  return (levelValue === '03' || levelValue === '3' || Number(levelValue) === 3) && isWbsElementObjectType(objectType);
}

function extractActualRevenue(row: StoredCn41Row) {
  const raw = row.raw_data_json ?? {};
  return (
    raw.actual_revenue ??
    raw.act_rev ??
    raw.act_revenue ??
    raw.actual_rev ??
    raw.actrev ??
    raw['act. rev'] ??
    raw['act rev'] ??
    null
  );
}

export async function createProject(project: Omit<Project, 'id' | 'created_at'>) {
  if (await isLocalDbMode()) return createLocalProject(project);
  const supabase = await createSupabaseServerClient();
  const payload = {
    project_code: project.project_code,
    project_name: project.project_name,
    client_name: project.client_name ?? null,
    project_manager_user_id: project.project_manager_user_id ?? null,
    project_manager_name: project.project_manager_name ?? null,
    project_manager_email: project.project_manager_email ?? null,
    project_manager_phone: project.project_manager_phone ?? null,
    site_location: project.site_location ?? null,
    subcontractor_name: project.subcontractor_name ?? null,
    subcontract_po_number: project.subcontract_po_number ?? null,
    subcontract_po_amount: project.subcontract_po_amount ?? null,
    subcontract_scope: project.subcontract_scope ?? null,
    status: project.status ?? 'Active',
  };

  const { data, error } = await supabase
    .from('projects')
    .insert(payload)
    .select()
    .single();

  if (error && isMissingProjectExtendedColumnError(error.message)) {
    const fallback = await supabase
      .from('projects')
      .insert({
        project_code: project.project_code,
        project_name: project.project_name,
        client_name: project.client_name ?? null,
        project_manager_name: project.project_manager_name ?? null,
        project_manager_email: project.project_manager_email ?? null,
        project_manager_phone: project.project_manager_phone ?? null,
        status: project.status ?? 'Active',
      })
      .select(PROJECT_SELECT_BASE)
      .single();
    if (fallback.error) throw fallback.error;
    return fallback.data as Project;
  }

  if (error) throw error;
  return data as Project;
}

export async function deleteProject(projectId: string) {
  if (await isLocalDbMode()) return deleteLocalProject(projectId);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('projects').delete().eq('id', projectId);
  if (error) throw error;
}

export async function updateProject(projectId: string, patch: Partial<Omit<Project, 'id' | 'created_at'>>) {
  if (await isLocalDbMode()) return updateLocalProject(projectId, patch);
  const supabase = await createSupabaseServerClient();
  const payload = {
    project_code: patch.project_code,
    project_name: patch.project_name,
    client_name: patch.client_name,
    project_manager_user_id: patch.project_manager_user_id,
    project_manager_name: patch.project_manager_name,
    project_manager_email: patch.project_manager_email,
    project_manager_phone: patch.project_manager_phone,
    site_location: patch.site_location,
    subcontractor_name: patch.subcontractor_name,
    subcontract_po_number: patch.subcontract_po_number,
    subcontract_po_amount: patch.subcontract_po_amount,
    subcontract_scope: patch.subcontract_scope,
    status: patch.status,
  };

  const { data, error } = await supabase
    .from('projects')
    .update(payload)
    .eq('id', projectId)
    .select()
    .single();

  if (error && isMissingProjectExtendedColumnError(error.message)) {
    const fallback = await supabase
      .from('projects')
      .update({
        project_code: patch.project_code,
        project_name: patch.project_name,
        client_name: patch.client_name,
        project_manager_name: patch.project_manager_name,
        project_manager_email: patch.project_manager_email,
        project_manager_phone: patch.project_manager_phone,
        status: patch.status,
      })
      .eq('id', projectId)
      .select(PROJECT_SELECT_BASE)
      .single();
    if (fallback.error) throw fallback.error;
    return fallback.data as Project;
  }

  if (error) throw error;
  return data as Project;
}

export async function replaceProjectSubcontracts(
  projectId: string,
  rows: Array<Omit<ProjectSubcontract, 'id' | 'project_id' | 'created_at'>>
) {
  if (await isLocalDbMode()) return replaceLocalProjectSubcontracts(projectId, rows);

  const supabase = await createSupabaseServerClient();

  const { error: deleteError } = await supabase.from('project_subcontracts').delete().eq('project_id', projectId);
  if (deleteError) throw deleteError;

  if (!rows.length) return [];

  const { data, error } = await supabase
    .from('project_subcontracts')
    .insert(
      rows.map((row) => ({
        project_id: projectId,
        package_name: row.package_name,
        subcontractor_name: row.subcontractor_name,
        po_number: row.po_number ?? null,
        po_amount: row.po_amount ?? null,
        scope: row.scope ?? null,
        status: row.status ?? 'Active',
      }))
    )
    .select()
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as ProjectSubcontract[];
}

export async function replaceProjectCostElementControl(
  projectId: string,
  rows: Array<Omit<ProjectCostElementControl, 'id' | 'project_id' | 'created_at'>>
) {
  if (await isLocalDbMode()) return replaceLocalProjectCostElementControl(projectId, rows);

  const supabase = await createSupabaseServerClient();
  const { error: deleteError } = await supabase.from('project_cost_element_control').delete().eq('project_id', projectId);
  if (deleteError) throw deleteError;

  if (!rows.length) return [];

  const { data, error } = await supabase
    .from('project_cost_element_control')
    .insert(
      rows.map((row) => ({
        project_id: projectId,
        cost_element: row.cost_element,
        cost_element_name: row.cost_element_name,
        include_in_cost: row.include_in_cost,
        remarks: row.remarks ?? null,
      })),
    )
    .select()
    .order('cost_element', { ascending: true });

  if (error) throw error;
  return (data ?? []) as ProjectCostElementControl[];
}
export async function replaceProjectWbsMaster(
  projectId: string,
  rows: Array<Omit<ProjectWbsMaster, 'id' | 'project_id' | 'created_at'>>
) {
  if (await isLocalDbMode()) return replaceLocalProjectWbsMaster(projectId, rows);

  const supabase = await createSupabaseServerClient();
  const { error: deleteError } = await supabase.from('project_wbs_master').delete().eq('project_id', projectId);
  if (deleteError) throw deleteError;

  if (!rows.length) return [];

  const { data, error } = await supabase
    .from('project_wbs_master')
    .insert(
      rows.map((row) => ({
        project_id: projectId,
        wbs_code: row.wbs_code,
        wbs_description: row.wbs_description,
        is_revenue_generating: row.is_revenue_generating,
        include_in_cost: row.include_in_cost,
        is_active: row.is_active,
        remarks: row.remarks ?? null,
      })),
    )
    .select()
    .order('wbs_code', { ascending: true });

  if (error) throw error;
  return (data ?? []) as ProjectWbsMaster[];
}

function isMissingProjectExtendedColumnError(message: string) {
  const normalized = message.toLowerCase();
  return [
      'project_manager_name',
      'project_manager_email',
      'project_manager_phone',
      'project_manager_user_id',
      'site_location',
    'subcontractor_name',
    'subcontract_po_number',
    'subcontract_po_amount',
    'subcontract_scope',
  ].some((column) => normalized.includes(column));
}

function buildLegacySubcontractRows(project?: Project) {
  if (!project?.subcontractor_name && !project?.subcontract_po_number && !project?.subcontract_po_amount && !project?.subcontract_scope) {
    return [];
  }

  return [
    {
      id: `legacy-${project.id}`,
      project_id: project.id,
      package_name: 'Main Package',
      subcontractor_name: project.subcontractor_name ?? '',
      po_number: project.subcontract_po_number ?? null,
      po_amount: project.subcontract_po_amount ?? null,
      scope: project.subcontract_scope ?? null,
      status: project.status ?? 'Active',
    },
  ] satisfies ProjectSubcontract[];
}

function mergeProjectCostElementControl(
  projectId: string,
  gr55Rows: Array<{ cost_element?: string | null; cost_category?: string | null }>,
  storedRows: ProjectCostElementControl[],
) {
  const storedMap = new Map(storedRows.map((row) => [normalizeCostElement(row.cost_element), row] as const));
  const inferred = new Map<string, { cost_element: string; cost_element_name: string }>();

  for (const row of gr55Rows) {
    const costElement = String(row.cost_element ?? '').trim();
    if (!costElement) continue;
    const key = normalizeCostElement(costElement);
    if (!key || inferred.has(key)) continue;
    inferred.set(key, {
      cost_element: costElement,
      cost_element_name: String(row.cost_category ?? '').trim() || costElement,
    });
  }

  for (const row of storedRows) {
    const key = normalizeCostElement(row.cost_element);
    if (!key || inferred.has(key)) continue;
    inferred.set(key, {
      cost_element: row.cost_element,
      cost_element_name: row.cost_element_name,
    });
  }

  return Array.from(inferred.values())
    .map((row) => {
      const stored = storedMap.get(normalizeCostElement(row.cost_element));
      return {
        id: stored?.id,
        project_id: projectId,
        cost_element: stored?.cost_element ?? row.cost_element,
        cost_element_name: row.cost_element_name || stored?.cost_element_name || row.cost_element,
        include_in_cost: stored?.include_in_cost ?? true,
        remarks: stored?.remarks ?? '',
        created_at: stored?.created_at,
      } satisfies ProjectCostElementControl;
    })
    .sort((a, b) => a.cost_element.localeCompare(b.cost_element));
}

function normalizeCostElement(code: string) {
  return String(code ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}
function mergeProjectWbsMasterRows(
  projectId: string,
  latestCn41Rows: StoredCn41Row[],
  revenueRows: RevenueWBS[],
  storedRows: ProjectWbsMaster[],
) {
  const storedMap = new Map(storedRows.map((row) => [normalizeWbsHierarchyCode(row.wbs_code), row] as const));
  const cn41Rows = latestCn41Rows
    .map((row) => {
      const raw = row.raw_data_json ?? {};
      const rawCode = String(
        row.wbs_code ??
          raw.projectitem ??
          raw.project_item ??
          raw.projektelm ??
          raw.projectelm ??
          raw['Projektelm'] ??
          raw['WBS Element'] ??
          '',
      ).trim();
      const objectType = String(row.object_type ?? raw.object_type ?? raw.objecttype ?? '').trim().toLowerCase();
      if (!rawCode) return null;
      if (!isWbsElementObjectType(objectType)) return null;

      return {
        wbs_code: rawCode,
        wbs_description: pickFirstNonEmpty(
          String(row.wbs_description ?? '').trim(),
          String(raw.wbs_description ?? '').trim(),
          String(raw.project_object ?? raw['Project object'] ?? '').trim(),
        ),
      };
    })
    .filter((row): row is { wbs_code: string; wbs_description: string } => Boolean(row));

  const uniqueCodes = new Set<string>();
  const mergedCandidates = [...cn41Rows].filter((row) => {
    const code = normalizeWbsHierarchyCode(String(row.wbs_code ?? '').trim());
    if (!code || uniqueCodes.has(code)) return false;
    uniqueCodes.add(code);
    return true;
  });

  return mergedCandidates
    .map((row) => {
      const normalizedCode = normalizeWbsHierarchyCode(String(row.wbs_code ?? '').trim());
      const stored = storedMap.get(normalizedCode);
      const rawCode = String(stored?.wbs_code ?? row.wbs_code ?? '').trim();
      return {
        id: stored?.id,
        project_id: projectId,
        wbs_code: rawCode,
        wbs_description: pickFirstNonEmpty(
          row.wbs_description ?? '',
          stored?.wbs_description ?? '',
        ),
        is_revenue_generating: stored?.is_revenue_generating ?? false,
        include_in_cost: stored?.include_in_cost ?? true,
        is_active: stored?.is_active ?? true,
        remarks: stored?.remarks ?? '',
        created_at: stored?.created_at,
      } satisfies ProjectWbsMaster;
    })
    .sort((a, b) => a.wbs_code.localeCompare(b.wbs_code));
}

function filterRevenueGeneratingRows(rows: RevenueWBS[], masterRows: ProjectWbsMaster[]) {
  if (!masterRows.length) {
    return rows.filter((row) => safeNumber(row.planned_revenue) !== 0);
  }

  const revenueCodes = new Set(
    masterRows
      .filter((row) => row.is_active !== false && row.is_revenue_generating)
      .map((row) => normalizeWbsHierarchyCode(row.wbs_code))
      .filter(Boolean),
  );

  return rows.filter((row) => {
    const code = normalizeWbsHierarchyCode(row.wbs_code);
    return revenueCodes.has(code);
  });
}

function pickFirstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

export async function createProjectManpowerRate(input: Omit<ProjectManpowerRate, 'id' | 'created_at'>) {
  if (await isLocalDbMode()) return createLocalProjectManpowerRate(input);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('project_manpower_rates')
    .insert({
      project_id: input.project_id,
      revenue_wbs_code: input.revenue_wbs_code,
      work_center: input.work_center ?? null,
      cost_center: input.cost_center ?? null,
      labor_category: input.labor_category,
      hourly_rate: input.hourly_rate,
      is_active: input.is_active ?? true,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ProjectManpowerRate;
}

export async function deleteProjectManpowerRate(id: string) {
  if (await isLocalDbMode()) return deleteLocalProjectManpowerRate(id);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('project_manpower_rates').delete().eq('id', id);
  if (error) throw error;
}

export async function createProjectMaterialMaster(input: Omit<ProjectMaterialMaster, 'id' | 'created_at'>) {
  if (await isLocalDbMode()) return createLocalProjectMaterialMaster(input);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('project_material_master')
    .insert({
      project_id: input.project_id,
      revenue_wbs_code: input.revenue_wbs_code,
      material_code: input.material_code,
      material_description: input.material_description,
      unit_of_measure: input.unit_of_measure ?? null,
      planned_quantity: input.planned_quantity,
      unit_price: input.unit_price,
      is_active: input.is_active ?? true,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ProjectMaterialMaster;
}

export async function deleteProjectMaterialMaster(id: string) {
  if (await isLocalDbMode()) return deleteLocalProjectMaterialMaster(id);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('project_material_master').delete().eq('id', id);
  if (error) throw error;
}

export async function updateProjectMaterialMaster(id: string, patch: Partial<Omit<ProjectMaterialMaster, 'id' | 'created_at'>>) {
  if (await isLocalDbMode()) return updateLocalProjectMaterialMaster(id, patch);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('project_material_master')
    .update({
      revenue_wbs_code: patch.revenue_wbs_code,
      material_code: patch.material_code,
      material_description: patch.material_description,
      unit_of_measure: patch.unit_of_measure ?? null,
      planned_quantity: patch.planned_quantity,
      unit_price: patch.unit_price,
      is_active: patch.is_active,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as ProjectMaterialMaster;
}

export async function updateProjectManpowerRate(id: string, patch: Partial<Omit<ProjectManpowerRate, 'id' | 'created_at'>>) {
  if (await isLocalDbMode()) return updateLocalProjectManpowerRate(id, patch);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('project_manpower_rates')
    .update({
      revenue_wbs_code: patch.revenue_wbs_code,
      work_center: patch.work_center ?? null,
      cost_center: patch.cost_center ?? null,
      labor_category: patch.labor_category,
      hourly_rate: patch.hourly_rate,
      is_active: patch.is_active,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as ProjectManpowerRate;
}

export async function deletePmUpdate(id: string) {
  if (await isLocalDbMode()) return deleteLocalPmUpdate(id);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('pm_daily_updates').delete().eq('id', id);
  if (error) throw error;
}

export async function updatePmUpdate(id: string, patch: Partial<DailyUpdate>) {
  if (await isLocalDbMode()) return updateLocalPmUpdate(id, patch);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('pm_daily_updates')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as DailyUpdate;
}


