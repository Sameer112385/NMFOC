import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import type { DashboardLayout, DashboardTab, WidgetStatus } from '@/lib/dashboard-widgets';
import { DASHBOARD_WIDGETS, defaultOrder, defaultRowLayout, flatOrderToRows } from '@/lib/dashboard-widgets';

const configDir = path.join(process.cwd(), '.local-db');
const configFile = path.join(configDir, 'dashboard-layout.json');

const VALID_IDS = new Set(DASHBOARD_WIDGETS.map((w) => w.id));
const VALID_STATUSES: WidgetStatus[] = ['active', 'hidden', 'archived'];

// Row-based order: each tab maps to an array of rows, each row an array of widget ids.
// An empty/absent entry means "use the registry default row layout".
type TabRowOrder = Partial<Record<DashboardTab, string[][]>>;

type StoredLayout = {
  global: DashboardLayout;
  projects: Record<string, DashboardLayout>;
  order: {
    global: TabRowOrder;
    projects: Record<string, TabRowOrder>;
  };
};

function rowsEqual(a: string[][], b: string[][]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, i) => row.length === b[i].length && row.every((v, j) => v === b[i][j]));
}

// Sanitize a row layout for storage: drop unknown/duplicate ids, drop empty rows.
function sanitizeRowsForStore(raw: unknown, tab: DashboardTab): string[][] {
  if (!Array.isArray(raw)) return [];
  const valid = new Set(DASHBOARD_WIDGETS.filter((w) => w.tab === tab).map((w) => w.id));
  const seen = new Set<string>();
  const rows: string[][] = [];
  for (const row of raw) {
    if (!Array.isArray(row)) continue;
    const cleanRow: string[] = [];
    for (const id of row) {
      if (typeof id === 'string' && valid.has(id) && !seen.has(id)) {
        cleanRow.push(id);
        seen.add(id);
      }
    }
    if (cleanRow.length) rows.push(cleanRow);
  }
  return rows;
}

// Complete a row layout: append any registry ids missing from saved rows into a new final row.
function completeRows(raw: unknown, tab: DashboardTab): string[][] {
  const base = sanitizeRowsForStore(raw, tab);
  const seen = new Set(base.flat());
  const missing: string[] = [];
  for (const id of defaultOrder(tab)) {
    if (!seen.has(id)) missing.push(id);
  }
  if (missing.length) base.push(missing);
  return base;
}

// Migrate legacy flat order (string[]) to row layout using group boundaries.
function migrateToRows(raw: unknown, tab: DashboardTab): string[][] {
  if (!Array.isArray(raw)) return [];
  // Check if it's already a row layout (array of arrays)
  if (raw.length > 0 && Array.isArray(raw[0])) {
    return sanitizeRowsForStore(raw, tab);
  }
  // It's a flat array — convert using group boundaries
  const flat = raw.filter((id): id is string => typeof id === 'string' && VALID_IDS.has(id));
  if (!flat.length) return [];
  return flatOrderToRows(flat);
}

function sanitizeTabRowOrder(raw: unknown): TabRowOrder {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: TabRowOrder = {};
  for (const tab of ['summary', 'trends'] as DashboardTab[]) {
    const clean = migrateToRows(obj[tab], tab);
    if (clean.length) out[tab] = clean;
  }
  return out;
}

function sanitizeMap(raw: unknown): DashboardLayout {
  if (!raw || typeof raw !== 'object') return {};
  const out: DashboardLayout = {};
  for (const [id, status] of Object.entries(raw as Record<string, unknown>)) {
    if (VALID_IDS.has(id) && VALID_STATUSES.includes(status as WidgetStatus)) {
      out[id] = status as WidgetStatus;
    }
  }
  return out;
}

function sanitizeStored(raw: unknown): StoredLayout {
  if (!raw || typeof raw !== 'object') return { global: {}, projects: {}, order: { global: {}, projects: {} } };
  const obj = raw as Record<string, unknown>;
  const looksNested = 'global' in obj || 'projects' in obj || 'order' in obj;
  if (!looksNested) {
    return { global: sanitizeMap(obj), projects: {}, order: { global: {}, projects: {} } };
  }
  const projectsRaw = (obj.projects ?? {}) as Record<string, unknown>;
  const projects: Record<string, DashboardLayout> = {};
  for (const [projectId, map] of Object.entries(projectsRaw)) {
    const clean = sanitizeMap(map);
    if (Object.keys(clean).length) projects[projectId] = clean;
  }

  const orderRaw = (obj.order ?? {}) as Record<string, unknown>;
  const orderProjectsRaw = (orderRaw.projects ?? {}) as Record<string, unknown>;
  const orderProjects: Record<string, TabRowOrder> = {};
  for (const [projectId, tabOrder] of Object.entries(orderProjectsRaw)) {
    const clean = sanitizeTabRowOrder(tabOrder);
    if (Object.keys(clean).length) orderProjects[projectId] = clean;
  }

  return {
    global: sanitizeMap(obj.global),
    projects,
    order: { global: sanitizeTabRowOrder(orderRaw.global), projects: orderProjects },
  };
}

async function readStored(): Promise<StoredLayout> {
  try {
    const raw = await readFile(configFile, 'utf8');
    return sanitizeStored(JSON.parse(raw));
  } catch {
    return { global: {}, projects: {}, order: { global: {}, projects: {} } };
  }
}

async function writeStored(stored: StoredLayout): Promise<void> {
  await mkdir(configDir, { recursive: true });
  await writeFile(configFile, JSON.stringify(stored, null, 2), 'utf8');
}

// --- Reads ---

export async function getGlobalDashboardLayout(): Promise<DashboardLayout> {
  return (await readStored()).global;
}

export async function getProjectDashboardLayout(projectId: string): Promise<DashboardLayout> {
  return (await readStored()).projects[projectId] ?? {};
}

export async function getEffectiveDashboardLayout(projectId: string): Promise<DashboardLayout> {
  const stored = await readStored();
  return { ...stored.global, ...(stored.projects[projectId] ?? {}) };
}

export async function getProjectLayoutBundle(projectId: string): Promise<{
  global: DashboardLayout;
  project: DashboardLayout;
  effective: DashboardLayout;
  order: {
    global: Record<DashboardTab, string[][]>;
    project: TabRowOrder;
    effective: Record<DashboardTab, string[][]>;
  };
}> {
  const stored = await readStored();
  const project = stored.projects[projectId] ?? {};
  const projectOrder = stored.order.projects[projectId] ?? {};
  const resolve = (tab: DashboardTab): string[][] => {
    const proj = projectOrder[tab];
    if (proj?.length) return completeRows(proj, tab);
    const glob = stored.order.global[tab];
    if (glob?.length) return completeRows(glob, tab);
    return defaultRowLayout(tab);
  };
  return {
    global: stored.global,
    project,
    effective: { ...stored.global, ...project },
    order: {
      global: {
        summary: completeRows(stored.order.global.summary, 'summary'),
        trends: completeRows(stored.order.global.trends, 'trends'),
      },
      project: projectOrder,
      effective: { summary: resolve('summary'), trends: resolve('trends') },
    },
  };
}

// Effective row-based render order for a tab.
export async function getEffectiveRowOrder(projectId: string, tab: DashboardTab): Promise<string[][]> {
  const stored = await readStored();
  const proj = stored.order.projects[projectId]?.[tab];
  if (proj?.length) return completeRows(proj, tab);
  const glob = stored.order.global[tab];
  if (glob?.length) return completeRows(glob, tab);
  return defaultRowLayout(tab);
}

// Keep flat version for any callers that still need it (e.g. settings panel).
export async function getEffectiveOrder(projectId: string, tab: DashboardTab): Promise<string[]> {
  const rows = await getEffectiveRowOrder(projectId, tab);
  return rows.flat();
}

// --- Writes ---

export async function saveGlobalDashboardLayout(layout: DashboardLayout): Promise<DashboardLayout> {
  const stored = await readStored();
  stored.global = sanitizeMap(layout);
  await writeStored(stored);
  return stored.global;
}

export async function saveProjectDashboardLayout(
  projectId: string,
  layout: DashboardLayout,
): Promise<DashboardLayout> {
  const stored = await readStored();
  const clean = sanitizeMap(layout);
  if (Object.keys(clean).length) {
    stored.projects[projectId] = clean;
  } else {
    delete stored.projects[projectId];
  }
  await writeStored(stored);
  return clean;
}

// --- Row-based order writes ---

export async function saveGlobalRowOrder(tab: DashboardTab, rows: string[][]): Promise<string[][]> {
  const stored = await readStored();
  const clean = sanitizeRowsForStore(rows, tab);
  if (!clean.length || rowsEqual(completeRows(clean, tab), defaultRowLayout(tab))) {
    delete stored.order.global[tab];
  } else {
    stored.order.global[tab] = clean;
  }
  await writeStored(stored);
  return completeRows(stored.order.global[tab], tab);
}

export async function saveProjectRowOrder(
  projectId: string,
  tab: DashboardTab,
  rows: string[][],
): Promise<string[][]> {
  const stored = await readStored();
  const clean = sanitizeRowsForStore(rows, tab);
  const globalBase = stored.order.global[tab]?.length ? stored.order.global[tab]! : defaultRowLayout(tab);
  const effectiveGlobal = completeRows(globalBase, tab);

  const projectOrder = stored.order.projects[projectId] ?? {};
  if (!clean.length || rowsEqual(completeRows(clean, tab), effectiveGlobal)) {
    delete projectOrder[tab];
  } else {
    projectOrder[tab] = clean;
  }
  if (Object.keys(projectOrder).length) {
    stored.order.projects[projectId] = projectOrder;
  } else {
    delete stored.order.projects[projectId];
  }
  await writeStored(stored);
  return getEffectiveRowOrder(projectId, tab);
}

// Legacy flat-order writes — kept for backward compat with the global settings panel.
export async function saveGlobalOrder(tab: DashboardTab, ids: string[]): Promise<string[]> {
  const rows = flatOrderToRows(ids);
  const result = await saveGlobalRowOrder(tab, rows);
  return result.flat();
}

export async function saveProjectOrder(
  projectId: string,
  tab: DashboardTab,
  ids: string[],
): Promise<string[]> {
  const rows = flatOrderToRows(ids);
  const result = await saveProjectRowOrder(projectId, tab, rows);
  return result.flat();
}
