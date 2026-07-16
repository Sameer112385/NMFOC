"use client";

import { useEffect, useState, type FormEvent } from 'react';
import { Badge, surfaceCard } from '@/components/ui';
import { cn } from '@/lib/utils';

type SupabaseStatus = {
  configured: boolean;
  supabaseUrl: string;
  hasAnonKey: boolean;
  hasServiceRoleKey: boolean;
  savedAt: string | null;
};

export function SupabaseConnectionPanel() {
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState('');
  const [supabaseServiceRoleKey, setSupabaseServiceRoleKey] = useState('');
  const [status, setStatus] = useState<SupabaseStatus | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const response = await fetch('/api/settings/supabase');
      const data = (await response.json()) as SupabaseStatus;
      setStatus(data);
      setSupabaseUrl(data.supabaseUrl ?? '');
    })();
  }, []);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/settings/supabase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supabaseUrl,
          supabaseAnonKey,
          supabaseServiceRoleKey,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? 'Unable to save Supabase settings.');
      }

      if (supabaseUrl) {
        localStorage.setItem('sap-cn41-supabase-url', supabaseUrl);
      }
      if (supabaseAnonKey) {
        localStorage.setItem('sap-cn41-supabase-anon-key', supabaseAnonKey);
      }

      setStatus({
        configured: true,
        supabaseUrl,
        hasAnonKey: true,
        hasServiceRoleKey: Boolean(supabaseServiceRoleKey),
        savedAt: data.savedAt ?? new Date().toISOString(),
      });
      setMessage(data.warning ? `Saved. Connection warning: ${data.warning}` : 'Supabase connection saved and tested.');
      setSupabaseAnonKey('');
      setSupabaseServiceRoleKey('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save Supabase settings.');
    } finally {
      setLoading(false);
    }
  }

  async function handleClear() {
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/settings/supabase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? 'Unable to clear Supabase settings.');
      }
      localStorage.removeItem('sap-cn41-supabase-url');
      localStorage.removeItem('sap-cn41-supabase-anon-key');
      setSupabaseUrl('');
      setSupabaseAnonKey('');
      setSupabaseServiceRoleKey('');
      setStatus({
        configured: false,
        supabaseUrl: '',
        hasAnonKey: false,
        hasServiceRoleKey: false,
        savedAt: null,
      });
      setMessage('Saved Supabase connection cleared.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to clear Supabase settings.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-end">
        <Badge tone={status?.configured ? 'success' : 'warning'}>
          {status?.configured ? 'Connected' : 'Disconnected'}
        </Badge>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-muted">Supabase URL</span>
          <input
            value={supabaseUrl}
            onChange={(event) => setSupabaseUrl(event.target.value)}
            placeholder="https://xxxxx.supabase.co"
            className="w-full rounded-lg border border-line bg-panel px-3 py-2.5 text-xs text-text outline-none placeholder:text-muted/60 focus:border-accent focus:ring-1 focus:ring-accent transition shadow-sm"
          />
        </label>
        
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-muted">Anon Key</span>
            <input
              value={supabaseAnonKey}
              onChange={(event) => setSupabaseAnonKey(event.target.value)}
              placeholder={status?.hasAnonKey ? 'Already saved — leave blank to keep' : 'Paste anon key'}
              className="w-full rounded-lg border border-line bg-panel px-3 py-2.5 text-xs text-text outline-none placeholder:text-muted/60 focus:border-accent focus:ring-1 focus:ring-accent transition shadow-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-muted">Service Role Key</span>
            <input
              value={supabaseServiceRoleKey}
              onChange={(event) => setSupabaseServiceRoleKey(event.target.value)}
              placeholder={status?.hasServiceRoleKey ? 'Already saved — leave blank to keep' : 'Optional for admin workflows'}
              className="w-full rounded-lg border border-line bg-panel px-3 py-2.5 text-xs text-text outline-none placeholder:text-muted/60 focus:border-accent focus:ring-1 focus:ring-accent transition shadow-sm"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-accent text-white px-4 py-2.5 text-xs font-semibold shadow hover:bg-accent-hover active:scale-[0.98] transition disabled:opacity-60"
          >
            {loading ? 'Saving...' : 'Save & Test Connection'}
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={loading}
            className="rounded-lg border border-line bg-panel/60 px-4 py-2.5 text-xs font-semibold text-text hover:bg-panel2/80 active:scale-[0.98] transition disabled:opacity-60"
          >
            Clear saved connection
          </button>
          {message ? (
            <span className="text-xs font-semibold text-accent/90 bg-accent/5 border border-accent/10 px-3.5 py-2.5 rounded-lg ml-2">
              {message}
            </span>
          ) : null}
        </div>
      </form>

      <div className="mt-5 rounded-lg border border-line bg-panel2/10 p-4 text-xs">
        <div className="grid gap-4 sm:grid-cols-3">
          <div><span className="font-semibold text-muted">Configured:</span> <span className="font-bold text-text">{status?.configured ? 'Yes' : 'No'}</span></div>
          <div><span className="font-semibold text-muted">Anon key:</span> <span className="font-bold text-text">{status?.hasAnonKey ? 'Saved' : 'Missing'}</span></div>
          <div><span className="font-semibold text-muted">Service role:</span> <span className="font-bold text-text">{status?.hasServiceRoleKey ? 'Saved' : 'Missing'}</span></div>
        </div>
        {status?.savedAt ? <div className="mt-3 text-[11px] text-muted font-medium">Last saved: {new Date(status.savedAt).toLocaleString()}</div> : null}
      </div>
    </div>
  );
}

