"use client";

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, RefreshCw, ShieldCheck, Upload } from 'lucide-react';

type VendorSummary = { total: number; uploadedAt: string | null; uploadedBy: string | null; fileName: string | null };

export function VendorMasterPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<VendorSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const loadSummary = async () => { setLoading(true); try { const response = await fetch('/api/vendor-master', { cache: 'no-store' }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Unable to load vendor master status.'); setSummary(payload); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load vendor master status.'); } finally { setLoading(false); } };
  useEffect(() => { void loadSummary(); }, []);
  const upload = async (file: File) => { setError(null); setSuccess(null); if (!/\.(xlsx|xls)$/i.test(file.name)) { setError('Please choose an Excel file (.xlsx or .xls).'); return; } setUploading(true); try { const form = new FormData(); form.append('file', file); const response = await fetch('/api/vendor-master', { method: 'POST', body: form }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Vendor master upload failed.'); setSummary(payload); setSuccess(`${payload.imported} vendor records imported. This global master is visible only to Admins.`); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Vendor master upload failed.'); } finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; } };
  return <div className="space-y-4">
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm text-emerald-900"><div className="flex items-center gap-2 font-bold"><ShieldCheck className="h-4 w-4" /> Confidential global master</div><p className="mt-1 text-xs leading-5">Vendor IDs are mapped to names across every project. Only Admins can upload or view this master; other roles cannot access this page or its data.</p></div>
    <div className="grid gap-3 sm:grid-cols-3"><Info label="Vendor records" value={loading ? 'Loading…' : String(summary?.total ?? 0)} /><Info label="Last upload" value={summary?.uploadedAt ? new Date(summary.uploadedAt).toLocaleString() : 'Not uploaded'} /><Info label="Source file" value={summary?.fileName || '—'} /></div>
    <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-line bg-panel/30 p-6 text-center transition hover:border-accent/50">{uploading ? <RefreshCw className="h-6 w-6 animate-spin text-accent" /> : <Upload className="h-6 w-6 text-accent" />}<span className="mt-2 text-sm font-bold text-text">{uploading ? 'Importing Vendor Master…' : 'Choose Vendor / Supplier / Subcontractor Master'}</span><span className="mt-1 text-xs text-muted">Excel only. Required columns: Vendor ID and Vendor/Supplier/Sub Con Name.</span><input ref={fileInputRef} className="hidden" type="file" accept=".xlsx,.xls" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /></label>
    <button type="button" onClick={() => void loadSummary()} disabled={loading || uploading} className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs font-bold text-text hover:bg-panel2 disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" /> Refresh status</button>
    {error ? <Notice tone="error" message={error} /> : null}{success ? <Notice tone="success" message={success} /> : null}
  </div>;
}
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-line bg-panel/30 px-3 py-3"><div className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</div><div className="mt-1 truncate text-sm font-bold text-text" title={value}>{value}</div></div>; }
function Notice({ tone, message }: { tone: 'error' | 'success'; message: string }) { const Icon = tone === 'error' ? AlertCircle : CheckCircle2; return <div className={tone === 'error' ? 'flex gap-2 text-xs font-medium text-danger' : 'flex gap-2 text-xs font-medium text-success'}><Icon className="mt-0.5 h-4 w-4 shrink-0" />{message}</div>; }
