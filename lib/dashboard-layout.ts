import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import type { DashboardLayout, WidgetStatus } from '@/lib/dashboard-widgets';
import { DASHBOARD_WIDGETS } from '@/lib/dashboard-widgets';

// Global dashboard layout config (which visuals are hidden), persisted server-side as a
// JSON file. This mirrors lib/supabase/runtime-config.ts — the app's established pattern
// for global settings, since there is no settings table. Shared across all users/devices
// (unlike the localStorage-based branding). Swappable to a Supabase table later behind
// this same read/write interface.

const configDir = path.join(process.cwd(), '.local-db');
const configFile = path.join(configDir, 'dashboard-layout.json');

const VALID_IDS = new Set(DASHBOARD_WIDGETS.map((w) => w.id));
const VALID_STATUSES: WidgetStatus[] = ['active', 'hidden', 'archived'];

// Drop unknown ids and invalid statuses so a stale/hand-edited file can't break rendering.
function sanitize(raw: unknown): DashboardLayout {
  if (!raw || typeof raw !== 'object') return {};
  const out: DashboardLayout = {};
  for (const [id, status] of Object.entries(raw as Record<string, unknown>)) {
    if (VALID_IDS.has(id) && VALID_STATUSES.includes(status as WidgetStatus)) {
      out[id] = status as WidgetStatus;
    }
  }
  return out;
}

export async function getDashboardLayout(): Promise<DashboardLayout> {
  try {
    const raw = await readFile(configFile, 'utf8');
    return sanitize(JSON.parse(raw));
  } catch {
    // No file yet (or unreadable) — everything defaults to visible.
    return {};
  }
}

export async function saveDashboardLayout(layout: DashboardLayout): Promise<DashboardLayout> {
  const clean = sanitize(layout);
  await mkdir(configDir, { recursive: true });
  await writeFile(configFile, JSON.stringify(clean, null, 2), 'utf8');
  return clean;
}
