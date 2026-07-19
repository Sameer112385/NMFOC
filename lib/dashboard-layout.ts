import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import type { DashboardLayout, DashboardTab, WidgetStatus } from '@/lib/dashboard-widgets';
import { DASHBOARD_WIDGETS, defaultOrder } from '@/lib/dashboard-widgets';

// Global dashboard layout config, persisted server-side as a JSON file. Mirrors
// lib/supabase/runtime-config.ts — the app's established pattern for global settings.
//
// Shape:
//   { global: { <id>: status }, projects: { <projectId>: { <id>: status } } }
//
// The effective layout for a project is `global` merged with that project's overrides
// (project keys win — a project can re-show a globally hidden visual with an explicit
// "active", or hide one the global keeps). Swappable to a Supabase table later behind
// this same read/write interface.

const configDir = path.join(process.cwd(), '.local-db');
const configFile = path.join(configDir, 'dashboard-layout.json');

const VALID_IDS = new Set(DASHBOARD_WIDGETS.map((w) => w.id));
const VALID_STATUSES: WidgetStatus[] = ['active', 'hidden', 'archived'];

// Order is a SEPARATE axis from status: per scope, a per-tab ordered list of ids.
// An empty/absent array for a tab means "use the registry default order".
type TabOrder = Partial<Record<DashboardTab, string[]>>;

type StoredLayout = {
  global: DashboardLayout;
  projects: Record<string, DashboardLayout>;
  order: {
    global: TabOrder;
    projects: Record<string, TabOrder>;
  };
};

function seqEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// Drop unknown/duplicate ids for the tab. Does NOT append — an empty result stays empty
// so it can mean "no override".
function sanitizeOrderForStore(raw: unknown, tab: DashboardTab): string[] {
  if (!Array.isArray(raw)) return [];
  const valid = new Set(DASHBOARD_WIDGETS.filter((w) => w.tab === tab).map((w) => w.id));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of raw) {
    if (typeof id === 'string' && valid.has(id) && !seen.has(id)) {
      out.push(id);
      seen.add(id);
    }
  }
  return out;
}

// A render-ready complete order: sanitized, with any registry ids missing from the saved
// order appended at the end — so a widget added to the registry later never disappears.
function completeOrder(raw: unknown, tab: DashboardTab): string[] {
  const base = sanitizeOrderForStore(raw, tab);
  const seen = new Set(base);
  for (const id of defaultOrder(tab)) if (!seen.has(id)) base.push(id);
  return base;
}

function sanitizeTabOrder(raw: unknown): TabOrder {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: TabOrder = {};
  for (const tab of ['summary', 'trends'] as DashboardTab[]) {
    const clean = sanitizeOrderForStore(obj[tab], tab);
    if (clean.length) out[tab] = clean;
  }
  return out;
}

// Drop unknown ids and invalid statuses so a stale/hand-edited file can't break rendering.
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

const EMPTY_STORED: StoredLayout = { global: {}, projects: {}, order: { global: {}, projects: {} } };

// Accepts the flat legacy map, the {global,projects} shape (no order), and the current
// shape (with order). Missing order defaults to empty → legacy files load cleanly.
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
  const orderProjects: Record<string, TabOrder> = {};
  for (const [projectId, tabOrder] of Object.entries(orderProjectsRaw)) {
    const clean = sanitizeTabOrder(tabOrder);
    if (Object.keys(clean).length) orderProjects[projectId] = clean;
  }

  return {
    global: sanitizeMap(obj.global),
    projects,
    order: { global: sanitizeTabOrder(orderRaw.global), projects: orderProjects },
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

// What the dashboard actually renders with: global overlaid by the project's own overrides.
export async function getEffectiveDashboardLayout(projectId: string): Promise<DashboardLayout> {
  const stored = await readStored();
  return { ...stored.global, ...(stored.projects[projectId] ?? {}) };
}

// For the per-project editor: the global base, the project's explicit override, and the
// resulting effective layout — so the UI can show what's inherited vs. overridden.
export async function getProjectLayoutBundle(projectId: string): Promise<{
  global: DashboardLayout;
  project: DashboardLayout;
  effective: DashboardLayout;
  order: {
    global: Record<DashboardTab, string[]>;
    project: TabOrder;
    effective: Record<DashboardTab, string[]>;
  };
}> {
  const stored = await readStored();
  const project = stored.projects[projectId] ?? {};
  const projectOrder = stored.order.projects[projectId] ?? {};
  const resolve = (tab: DashboardTab): string[] => {
    const proj = projectOrder[tab];
    if (proj?.length) return completeOrder(proj, tab);
    const glob = stored.order.global[tab];
    if (glob?.length) return completeOrder(glob, tab);
    return defaultOrder(tab);
  };
  return {
    global: stored.global,
    project,
    effective: { ...stored.global, ...project },
    order: {
      global: { summary: completeOrder(stored.order.global.summary, 'summary'), trends: completeOrder(stored.order.global.trends, 'trends') },
      project: projectOrder,
      effective: { summary: resolve('summary'), trends: resolve('trends') },
    },
  };
}

// Effective render order for a tab: project override ?? global override ?? registry default,
// always completed so newly-registered widgets appear.
export async function getEffectiveOrder(projectId: string, tab: DashboardTab): Promise<string[]> {
  const stored = await readStored();
  const proj = stored.order.projects[projectId]?.[tab];
  if (proj?.length) return completeOrder(proj, tab);
  const glob = stored.order.global[tab];
  if (glob?.length) return completeOrder(glob, tab);
  return defaultOrder(tab);
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
    delete stored.projects[projectId]; // empty override => back to pure global default
  }
  await writeStored(stored);
  return clean;
}

// --- Order writes ---

export async function saveGlobalOrder(tab: DashboardTab, ids: string[]): Promise<string[]> {
  const stored = await readStored();
  const clean = sanitizeOrderForStore(ids, tab);
  // If the saved order matches the registry default, store nothing (no override).
  if (!clean.length || seqEqual(completeOrder(clean, tab), defaultOrder(tab))) {
    delete stored.order.global[tab];
  } else {
    stored.order.global[tab] = clean;
  }
  await writeStored(stored);
  return completeOrder(stored.order.global[tab], tab);
}

export async function saveProjectOrder(
  projectId: string,
  tab: DashboardTab,
  ids: string[],
): Promise<string[]> {
  const stored = await readStored();
  const clean = sanitizeOrderForStore(ids, tab);
  // Effective order without this project's override (global override ?? default).
  const globalBase = stored.order.global[tab]?.length ? stored.order.global[tab]! : defaultOrder(tab);
  const effectiveGlobal = completeOrder(globalBase, tab);

  const projectOrder = stored.order.projects[projectId] ?? {};
  if (!clean.length || seqEqual(completeOrder(clean, tab), effectiveGlobal)) {
    delete projectOrder[tab]; // redundant with global/default => drop the override
  } else {
    projectOrder[tab] = clean;
  }
  if (Object.keys(projectOrder).length) {
    stored.order.projects[projectId] = projectOrder;
  } else {
    delete stored.order.projects[projectId];
  }
  await writeStored(stored);
  return getEffectiveOrder(projectId, tab);
}
