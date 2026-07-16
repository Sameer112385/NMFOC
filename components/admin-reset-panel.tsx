"use client";

import { useState } from 'react';
import { surfaceCard, Badge } from '@/components/ui';
import { cn } from '@/lib/utils';

type AdminAction = 'backup' | 'app_data' | 'full_reset';

export function AdminResetPanel({ canReset }: { canReset: boolean }) {
  const [loading, setLoading] = useState<AdminAction | null>(null);
  const [message, setMessage] = useState('');

  async function downloadBackup() {
    setMessage('');
    if (!canReset) {
      setMessage('Admin access is required.');
      return;
    }

    try {
      setLoading('backup');
      const response = await fetch('/api/admin/backup', { method: 'GET' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({} as { error?: string }));
        throw new Error(payload.error ?? 'Unable to create backup.');
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get('content-disposition') ?? '';
      const fileName = getDownloadFileName(contentDisposition) ?? 'nmfoc-backup.xlsx';
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(downloadUrl), 1000);
      setMessage('Backup download started.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create backup.');
    } finally {
      setLoading(null);
    }
  }

  async function runReset(action: 'app_data' | 'full_reset') {
    setMessage('');
    if (!canReset) {
      setMessage('Admin access is required.');
      return;
    }

    const confirmText =
      action === 'app_data'
        ? 'This will delete all project data, uploads, revenue outputs, PM updates, risks, and charts. User accounts will stay. Continue?'
        : 'This will delete all app data and all user records. Continue?';

    if (!window.confirm(confirmText)) return;

    if (
      action === 'full_reset' &&
      !window.confirm('Final warning: this removes users too. Type confirmation is not available here, so only continue if you are sure.')
    ) {
      return;
    }

    try {
      setLoading(action);
      const response = await fetch('/api/admin/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to reset data.');
      }
      setMessage(action === 'app_data' ? 'App data reset completed.' : 'Full reset completed.');
      window.location.href = '/projects';
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to reset data.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-end">
        <Badge tone={canReset ? 'warning' : 'default'}>{canReset ? 'Admin Only' : 'No Access'}</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <button
          type="button"
          onClick={downloadBackup}
          disabled={!canReset || loading !== null}
          className="group relative rounded-xl border border-accent/20 bg-gradient-to-br from-accent/5 via-panel to-panel p-5 text-left transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-accent/40 via-accent to-accent/40 rounded-t-xl" />
          <div className="text-sm font-bold text-accent">Backup All Data (Excel)</div>
          <p className="mt-3 text-xs leading-relaxed text-muted/90 font-medium">
            Exports projects, uploads, users, calculations, and admin data into one workbook before you reset anything.
          </p>
          <div className="mt-4 text-xs font-bold text-accent transition-all group-hover:translate-x-0.5">
            {loading === 'backup' ? 'Preparing backup...' : 'Download workbook →'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => runReset('app_data')}
          disabled={!canReset || loading !== null}
          className="group relative rounded-xl border border-warning/20 bg-gradient-to-br from-warning/5 via-panel to-panel p-5 text-left transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-warning/40 via-warning to-warning/40 rounded-t-xl" />
          <div className="text-sm font-bold text-warning">Reset App Data</div>
          <p className="mt-3 text-xs leading-relaxed text-muted/90 font-medium">
            Deletes projects, uploads, revenue outputs, PM updates, risks, snapshots, and storage files. Keeps user accounts intact.
          </p>
          <div className="mt-4 text-xs font-bold text-warning transition-all group-hover:translate-x-0.5">
            {loading === 'app_data' ? 'Resetting...' : 'Run reset →'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => runReset('full_reset')}
          disabled={!canReset || loading !== null}
          className="group relative rounded-xl border border-danger/20 bg-gradient-to-br from-danger/5 via-panel to-panel p-5 text-left transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-danger/40 via-danger to-danger/40 rounded-t-xl" />
          <div className="text-sm font-bold text-danger">Full Reset</div>
          <p className="mt-3 text-xs leading-relaxed text-muted/90 font-medium">
            Deletes app data, user profiles, and Supabase auth users, then clears storage objects in the main bucket.
          </p>
          <div className="mt-4 text-xs font-bold text-danger transition-all group-hover:translate-x-0.5">
            {loading === 'full_reset' ? 'Resetting...' : 'Run full reset →'}
          </div>
        </button>
      </div>

      {message ? (
        <div className="mt-5 rounded-lg border border-line bg-panel2/30 px-4 py-3 text-xs font-semibold text-text">
          {message}
        </div>
      ) : null}
    </div>
  );
}
function getDownloadFileName(contentDisposition: string) {
  const match = contentDisposition.match(/filename="?([^"]+)"?/i);
  return match?.[1] ?? null;
}
