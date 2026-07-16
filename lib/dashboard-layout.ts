import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import type { DashboardLayout, WidgetStatus } from '@/lib/dashboard-widgets';
import { DASHBOARD_WIDGETS } from '@/lib/dashboard-widgets';

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

type StoredLayout = {
  global: DashboardLayout;
  projects: Record<string, DashboardLayout>;
};

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

// Accepts both the current nested shape and the original flat map (treated as global).
function sanitizeStored(raw: unknown): StoredLayout {
  if (!raw || typeof raw !== 'object') return { global: {}, projects: {} };
  const obj = raw as Record<string, unknown>;
  const looksNested = 'global' in obj || 'projects' in obj;
  if (!looksNested) {
    return { global: sanitizeMap(obj), projects: {} };
  }
  const projectsRaw = (obj.projects ?? {}) as Record<string, unknown>;
  const projects: Record<string, DashboardLayout> = {};
  for (const [projectId, map] of Object.entries(projectsRaw)) {
    const clean = sanitizeMap(map);
    if (Object.keys(clean).length) projects[projectId] = clean;
  }
  return { global: sanitizeMap(obj.global), projects };
}

async function readStored(): Promise<StoredLayout> {
  try {
    const raw = await readFile(configFile, 'utf8');
    return sanitizeStored(JSON.parse(raw));
  } catch {
    return { global: {}, projects: {} };
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
}> {
  const stored = await readStored();
  const project = stored.projects[projectId] ?? {};
  return { global: stored.global, project, effective: { ...stored.global, ...project } };
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
