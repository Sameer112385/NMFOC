"use client";

import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import { DarkSelect } from '@/components/dark-select';
import { surfaceCard } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import type { PMManpowerLine, PMMaterialLine, PMSubcontractLine, ProjectManpowerRate, ProjectMaterialMaster, ProjectSubcontract } from '@/lib/types';

type ProjectOption = { id: string; project_name: string };
type RevenueWbsOption = { id: string; project_id: string; wbs_code: string; wbs_description: string };

export function PMUpdateForm({
  projects,
  revenueWbs,
  manpowerRates,
  materialMasters,
  projectSubcontracts,
  submittedBy = '',
}: {
  projects: ProjectOption[];
  revenueWbs: RevenueWbsOption[];
  manpowerRates: ProjectManpowerRate[];
  materialMasters: ProjectMaterialMaster[];
  projectSubcontracts: ProjectSubcontract[];
  submittedBy?: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [revenueWbsId, setRevenueWbsId] = useState('');
  const [subcontractLines, setSubcontractLines] = useState<PMSubcontractLine[]>([createSubcontractLine()]);
  const [manpowerLines, setManpowerLines] = useState<PMManpowerLine[]>([createManpowerLine()]);
  const [materialLines, setMaterialLines] = useState<PMMaterialLine[]>([createMaterialLine()]);

  const projectWbs = useMemo(() => revenueWbs.filter((item) => item.project_id === projectId), [projectId, revenueWbs]);
  const selectedWbs = useMemo(() => projectWbs.find((item) => item.id === revenueWbsId), [projectWbs, revenueWbsId]);
  const projectRateOptions = useMemo(
    () =>
      manpowerRates.filter(
        (item) =>
          item.project_id === projectId &&
          item.is_active !== false,
      ),
    [manpowerRates, projectId],
  );
  const projectSubcontractOptions = useMemo(
    () => projectSubcontracts.filter((item) => item.project_id === projectId && (item.status ?? 'Active') !== 'Closed'),
    [projectId, projectSubcontracts],
  );
  const projectMaterialOptions = useMemo(
    () =>
      materialMasters.filter(
        (item) =>
          item.project_id === projectId &&
          item.is_active !== false &&
          item.revenue_wbs_code === (selectedWbs?.wbs_code ?? ''),
      ),
    [materialMasters, projectId, selectedWbs],
  );

  useEffect(() => {
    if (!projectWbs.length) {
      setRevenueWbsId('');
      return;
    }
    setRevenueWbsId((current) => (projectWbs.some((item) => item.id === current) ? current : projectWbs[0]?.id ?? ''));
  }, [projectWbs]);

  useEffect(() => {
    setSubcontractLines([createSubcontractLine()]);
  }, [projectId]);

  useEffect(() => {
    setManpowerLines([createManpowerLine()]);
  }, [projectId, revenueWbsId]);

  useEffect(() => {
    setMaterialLines([createMaterialLine()]);
  }, [projectId, revenueWbsId]);

  useEffect(() => {
    setManpowerLines((items) => items.map((item) => syncManpowerLineWithMaster(item, projectRateOptions, selectedWbs?.wbs_code ?? '')));
  }, [projectRateOptions, selectedWbs]);

  useEffect(() => {
    setMaterialLines((items) => items.map((item) => syncMaterialLineWithMaster(item, projectMaterialOptions)));
  }, [projectMaterialOptions]);

  const subcontractTotal = subcontractLines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const manpowerTotal = manpowerLines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const materialTotal = materialLines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const totalPendingCost = subcontractTotal + manpowerTotal + materialTotal;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set('project_id', projectId);
    formData.set('revenue_wbs_id', revenueWbsId);
    formData.set('subcontract_lines', JSON.stringify(compactSubcontractLines(subcontractLines)));
    formData.set('manpower_lines', JSON.stringify(compactManpowerLines(manpowerLines)));
    formData.set('material_lines', JSON.stringify(compactMaterialLines(materialLines)));
    setLoading(true);
    const response = await fetch('/api/pm-updates', { method: 'POST', body: formData });
    const payload = await response.json();
    setLoading(false);
    if (!response.ok) {
      setMessage(payload.error ?? 'Unable to submit PM update.');
      return;
    }
    setMessage(payload.warning ? String(payload.warning) : 'PM daily update saved successfully.');
    setSubcontractLines([createSubcontractLine()]);
    setManpowerLines([createManpowerLine()]);
    setMaterialLines([createMaterialLine()]);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className={`space-y-6 p-6 border border-line/40 bg-panel/30 shadow-card ${surfaceCard}`}>
      <div>
        <h3 className="text-base font-bold text-text">PM Daily Operations Entry</h3>
        <p className="mt-1 text-xs text-muted/80 font-medium">
          Submit daily work progress alongside simulated subcontractor, manpower, and material costs.
        </p>
      </div>

      <section className="space-y-3">
        <div className="text-xs font-bold uppercase tracking-wider text-muted/95">Daily Header Info</div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DarkSelect
            value={projectId}
            onChange={setProjectId}
            name="project_id"
            placeholder="Select project"
            options={projects.map((project) => ({ value: project.id, label: project.project_name }))}
          />
          <DarkSelect
            value={revenueWbsId}
            onChange={setRevenueWbsId}
            name="revenue_wbs_id"
            placeholder="Select revenue WBS"
            noTruncate
            options={projectWbs.map((item) => ({ value: item.id, label: `${item.wbs_code} - ${item.wbs_description}` }))}
          />
          <input name="update_date" type="date" className={inputClass} defaultValue={new Date().toISOString().slice(0, 10)} />
          <input name="expected_progress" type="number" step="0.01" placeholder="Expected progress %" className={inputClass} />
        </div>
      </section>

      <section className="rounded-xl border border-line bg-panel/40 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3 border-b border-line/35 pb-2">
          <div>
            <div className="text-xs font-bold text-text">Subcontractor Accruals</div>
            <div className="text-[10px] text-muted font-medium">Select a project subcontract PO, then enter the current simulated amount.</div>
          </div>
          <button type="button" onClick={() => setSubcontractLines((items) => [...items, createSubcontractLine()])} className={secondaryButtonClass}>
            Add Line
          </button>
        </div>
        {!projectSubcontractOptions.length ? <div className="mt-1 text-[11px] font-medium text-warning">No subcontract packages defined. Maintain subcontracts in Project Details.</div> : null}
        <div className="space-y-3">
          {subcontractLines.map((line) => (
            <div key={line.id} className="grid gap-3 items-center xl:grid-cols-[1.4fr,0.9fr,0.9fr,0.8fr,0.8fr,36px]">
              <DarkSelect
                value={line.project_subcontract_id ?? ''}
                onChange={(value) => selectSubcontractMaster(setSubcontractLines, line.id, value, projectSubcontractOptions)}
                options={projectSubcontractOptions.map((item) => ({
                  value: item.id ?? '',
                  label: [item.po_number, item.package_name, item.subcontractor_name].filter(Boolean).join(' | '),
                }))}
                placeholder="Select project PO"
              />
              <div className={`${inputClass} flex items-center text-muted truncate h-9 bg-panel/30`}>{line.package_name || 'Package'}</div>
              <div className={`${inputClass} flex items-center text-muted truncate h-9 bg-panel/30`}>{line.subcontractor_name || 'Vendor'}</div>
              <div className={`${inputClass} flex items-center text-muted truncate h-9 bg-panel/30`}>{line.coc_reference || 'PO number'}</div>
              <input
                value={line.amount || ''}
                onChange={(e) => setSubcontractLines((items) => items.map((item) => item.id === line.id ? { ...item, amount: Number(e.target.value || 0) } : item))}
                type="number"
                step="0.01"
                placeholder="Amount"
                className={inputClass}
              />
              <button type="button" onClick={() => setSubcontractLines((items) => removeLine(items, line.id, createSubcontractLine()))} className={iconButtonClass}>
                &times;
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-line bg-panel/40 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3 border-b border-line/35 pb-2">
          <div>
            <div className="text-xs font-bold text-text">Manpower Hours</div>
            <div className="text-[10px] text-muted font-medium">Record hours worked on this WBS. Cost is calculated from the manpower rate master.</div>
          </div>
          <button type="button" onClick={() => setManpowerLines((items) => [...items, createManpowerLine()])} className={secondaryButtonClass}>
            Add Line
          </button>
        </div>
        {!projectRateOptions.length ? <div className="mt-1 text-[11px] font-medium text-warning">No manpower rates defined. Maintain manpower rates in Project setup.</div> : null}
        <div className="space-y-3">
          {manpowerLines.map((line) => (
            <div key={line.id} className="grid gap-3 items-center xl:grid-cols-[1.5fr,1fr,0.75fr,0.75fr,0.75fr,0.75fr,0.85fr,36px]">
              <DarkSelect
                value={line.master_id ?? ''}
                onChange={(value) => selectManpowerMaster(setManpowerLines, line.id, value, projectRateOptions, selectedWbs?.wbs_code ?? '')}
                options={projectRateOptions.map((item) => ({
                  value: item.id ?? '',
                  label: [item.labor_category, item.work_center, item.cost_center].filter(Boolean).join(' | '),
                }))}
                placeholder="Select manpower rate"
              />
              <div className={`${inputClass} flex items-center text-muted truncate h-9 bg-panel/30`}>{line.revenue_wbs_code || 'Revenue WBS'}</div>
              <input
                value={line.hours_worked || ''}
                onChange={(e) => updateManpowerLine(setManpowerLines, line.id, { hours_worked: Number(e.target.value || 0) })}
                type="number"
                step="0.01"
                placeholder="Hours"
                className={inputClass}
              />
              <div className={`${inputClass} flex items-center text-muted truncate h-9 bg-panel/30`}>{line.work_center || 'Work center'}</div>
              <div className={`${inputClass} flex items-center text-muted truncate h-9 bg-panel/30`}>{line.cost_center || 'Cost center'}</div>
              <div className={`${inputClass} flex items-center justify-end font-bold text-text h-9 bg-panel/30`}>{formatCurrency(line.hourly_rate)}</div>
              <div className={`${inputClass} flex items-center justify-end font-extrabold text-accent h-9 bg-panel/30`}>{formatCurrency(line.amount)}</div>
              <button type="button" onClick={() => setManpowerLines((items) => removeLine(items, line.id, createManpowerLine()))} className={iconButtonClass}>
                &times;
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-line bg-panel/40 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3 border-b border-line/35 pb-2">
          <div>
            <div className="text-xs font-bold text-text">Material Consumption</div>
            <div className="text-[10px] text-muted font-medium">Record materials utilized on this WBS. Cost is calculated from the unit prices.</div>
          </div>
          <button type="button" onClick={() => setMaterialLines((items) => [...items, createMaterialLine()])} className={secondaryButtonClass}>
            Add Line
          </button>
        </div>
        {!projectMaterialOptions.length ? <div className="mt-1 text-[11px] font-medium text-warning">No materials defined. Maintain material master in Project setup.</div> : null}
        <div className="space-y-3">
          {materialLines.map((line) => (
            <div key={line.id} className="grid gap-3 items-center xl:grid-cols-[1.5fr,1.2fr,0.6fr,0.7fr,0.8fr,0.9fr,36px]">
              <DarkSelect
                value={line.master_id ?? ''}
                onChange={(value) => selectMaterialMaster(setMaterialLines, line.id, value, projectMaterialOptions)}
                options={projectMaterialOptions.map((item) => ({
                  value: item.id ?? '',
                  label: `${item.material_code} - ${item.material_description}`,
                }))}
                placeholder="Select planned material"
              />
              <div className={`${inputClass} flex items-center text-muted truncate h-9 bg-panel/30`}>{line.material_description || 'Description'}</div>
              <div className={`${inputClass} flex items-center text-muted truncate h-9 bg-panel/30`}>{line.unit_of_measure || 'UoM'}</div>
              <input
                value={line.quantity || ''}
                onChange={(e) => updateMaterialLine(setMaterialLines, line.id, { quantity: Number(e.target.value || 0) })}
                type="number"
                step="0.01"
                placeholder="Qty"
                className={inputClass}
              />
              <div className={`${inputClass} flex items-center justify-end font-bold text-text h-9 bg-panel/30`}>{formatCurrency(line.unit_price)}</div>
              <div className={`${inputClass} flex items-center justify-end font-extrabold text-accent h-9 bg-panel/30`}>{formatCurrency(line.amount)}</div>
              <button type="button" onClick={() => setMaterialLines((items) => removeLine(items, line.id, createMaterialLine()))} className={iconButtonClass}>
                &times;
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Subcontractor Total" value={subcontractTotal} />
        <SummaryCard label="Manpower Total" value={manpowerTotal} />
        <SummaryCard label="Material Total" value={materialTotal} />
        <SummaryCard label="Total Pending Cost" value={totalPendingCost} emphasize />
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <textarea name="issue_delay" placeholder="Operational issues or delay notes..." className="min-h-[100px] rounded-lg border border-line bg-panel px-4 py-3 text-xs text-text outline-none focus:border-accent shadow-sm" />
        <textarea name="remarks" placeholder="General remarks..." className="min-h-[100px] rounded-lg border border-line bg-panel px-4 py-3 text-xs text-text outline-none focus:border-accent shadow-sm" />
        <select name="approval_status" defaultValue="Pending" className={`${inputClass} font-semibold cursor-pointer`}>
          <option value="Pending">Approval Status: Pending</option>
          <option value="Approved">Approval Status: Approved</option>
          <option value="Rejected">Approval Status: Rejected</option>
        </select>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted/80">Submitted by</span>
          {submittedBy ? (
            <input
              name="submitted_by"
              defaultValue={submittedBy}
              readOnly
              title="Automatically taken from your signed-in account"
              className={`${inputClass} cursor-not-allowed bg-panel/40 text-muted`}
            />
          ) : (
            <input name="submitted_by" placeholder="Submitted by (Username/Email)" className={inputClass} />
          )}
        </label>
      </section>

      <div className="flex items-center gap-3 pt-3 border-t border-line/35">
        <button disabled={loading || !projectId || !revenueWbsId} className="rounded-lg bg-accent px-5 py-3 text-xs font-bold text-white hover:opacity-90 transition disabled:opacity-60 shadow-sm">
          {loading ? 'Submitting...' : 'Submit Operation Update'}
        </button>
        {message ? (
          <span className="text-xs font-bold text-accent bg-accent/5 border border-accent/15 px-3 py-2 rounded-md">
            {message}
          </span>
        ) : null}
      </div>
    </form>
  );
}

function SummaryCard({ label, value, emphasize = false }: { label: string; value: number; emphasize?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 shadow-sm transition-all ${emphasize ? 'border-accent/30 bg-accent/5 shadow-md' : 'border-line/70 bg-panel/50'}`}>
      <div className="section-kicker text-muted/70 font-semibold tracking-wider">{label}</div>
      <div className="mt-2.5 data-value text-right text-base font-extrabold text-text">{formatCurrency(value)}</div>
    </div>
  );
}

const inputClass = 'rounded-lg border border-line bg-panel px-3 py-2 text-xs text-text outline-none focus:border-accent focus:ring-1 focus:ring-accent transition shadow-sm w-full';
const secondaryButtonClass = 'rounded-lg border border-line bg-panel px-3.5 py-1.5 text-[10px] font-bold text-text hover:bg-panel2 transition shadow-sm';
const iconButtonClass = 'rounded-lg border border-danger/30 bg-danger/5 px-2 py-1.5 text-xs font-bold text-danger hover:bg-danger hover:text-white transition w-9 h-9 flex items-center justify-center shrink-0';

function createSubcontractLine(): PMSubcontractLine {
  return { id: crypto.randomUUID(), project_subcontract_id: '', package_name: '', subcontractor_name: '', coc_reference: '', amount: 0, remarks: '' };
}

function createManpowerLine(): PMManpowerLine {
  return { id: crypto.randomUUID(), master_id: '', revenue_wbs_code: '', work_center: '', cost_center: '', labor_category: '', hours_worked: 0, hourly_rate: 0, amount: 0 };
}

function createMaterialLine(): PMMaterialLine {
  return { id: crypto.randomUUID(), master_id: '', material_code: '', material_description: '', unit_of_measure: '', quantity: 0, unit_price: 0, amount: 0 };
}

function removeLine<T extends { id: string }>(items: T[], id: string, fallback: T) {
  const next = items.filter((item) => item.id !== id);
  return next.length ? next : [fallback];
}

function selectSubcontractMaster(
  setLines: Dispatch<SetStateAction<PMSubcontractLine[]>>,
  id: string,
  subcontractId: string,
  subcontracts: ProjectSubcontract[],
) {
  const subcontract = subcontracts.find((item) => item.id === subcontractId);
  setLines((items) =>
    items.map((item) =>
      item.id !== id
        ? item
        : {
            ...item,
            project_subcontract_id: subcontractId,
            package_name: subcontract?.package_name ?? '',
            subcontractor_name: subcontract?.subcontractor_name ?? '',
            coc_reference: subcontract?.po_number ?? '',
          },
    ),
  );
}

function updateManpowerLine(
  setLines: Dispatch<SetStateAction<PMManpowerLine[]>>,
  id: string,
  patch: Partial<PMManpowerLine>,
) {
  setLines((items) =>
    items.map((item) => {
      if (item.id !== id) return item;
      const next = { ...item, ...patch };
      return { ...next, amount: Number(next.hours_worked || 0) * Number(next.hourly_rate || 0) };
    }),
  );
}

// Update material lines quantity / totals
function updateMaterialLine(
  setLines: Dispatch<SetStateAction<PMMaterialLine[]>>,
  id: string,
  patch: Partial<PMMaterialLine>,
) {
  setLines((items) =>
    items.map((item) => {
      if (item.id !== id) return item;
      const next = { ...item, ...patch };
      return { ...next, amount: Number(next.quantity || 0) * Number(next.unit_price || 0) };
    }),
  );
}

function selectManpowerMaster(
  setLines: Dispatch<SetStateAction<PMManpowerLine[]>>,
  id: string,
  masterId: string,
  masters: ProjectManpowerRate[],
  activeWbsCode: string,
) {
  const master = masters.find((item) => item.id === masterId);
  setLines((items) =>
    items.map((item) => {
      if (item.id !== id) return item;
      const next = {
        ...item,
        master_id: masterId,
        revenue_wbs_code: activeWbsCode,
        work_center: master?.work_center ?? '',
        cost_center: master?.cost_center ?? '',
        labor_category: master?.labor_category ?? '',
        hourly_rate: Number(master?.hourly_rate ?? 0),
      };
      return { ...next, amount: Number(next.hours_worked || 0) * Number(next.hourly_rate || 0) };
    }),
  );
}

function selectMaterialMaster(
  setLines: Dispatch<SetStateAction<PMMaterialLine[]>>,
  id: string,
  masterId: string,
  masters: ProjectMaterialMaster[],
) {
  const master = masters.find((item) => item.id === masterId);
  setLines((items) =>
    items.map((item) => {
      if (item.id !== id) return item;
      const next = {
        ...item,
        master_id: masterId,
        material_code: master?.material_code ?? '',
        material_description: master?.material_description ?? '',
        unit_of_measure: master?.unit_of_measure ?? '',
        unit_price: Number(master?.unit_price ?? 0),
      };
      return { ...next, amount: Number(next.quantity || 0) * Number(next.unit_price || 0) };
    }),
  );
}

function syncManpowerLineWithMaster(line: PMManpowerLine, masters: ProjectManpowerRate[], activeWbsCode: string) {
  if (!line.master_id) return line;
  const master = masters.find((item) => item.id === line.master_id);
  if (!master) return { ...line, master_id: '' };
  return {
    ...line,
    revenue_wbs_code: activeWbsCode,
    work_center: master.work_center ?? '',
    cost_center: master.cost_center ?? '',
    labor_category: master.labor_category ?? '',
    hourly_rate: Number(master.hourly_rate ?? 0),
    amount: Number(line.hours_worked || 0) * Number(master.hourly_rate ?? 0),
  };
}

function syncMaterialLineWithMaster(line: PMMaterialLine, masters: ProjectMaterialMaster[]) {
  if (!line.master_id) return line;
  const master = masters.find((item) => item.id === line.master_id);
  if (!master) return { ...line, master_id: '' };
  return {
    ...line,
    material_code: master.material_code ?? '',
    material_description: master.material_description ?? '',
    unit_of_measure: master.unit_of_measure ?? '',
    unit_price: Number(master.unit_price ?? 0),
    amount: Number(line.quantity || 0) * Number(master.unit_price ?? 0),
  };
}

function compactSubcontractLines(lines: PMSubcontractLine[]) {
  return lines.filter((line) => line.package_name.trim() || Number(line.amount || 0) > 0);
}

function compactManpowerLines(lines: PMManpowerLine[]) {
  return lines.filter((line) => (line.master_id ?? '').trim() || Number(line.hours_worked || 0) > 0 || Number(line.amount || 0) > 0);
}

function compactMaterialLines(lines: PMMaterialLine[]) {
  return lines.filter((line) => (line.master_id ?? '').trim() || Number(line.quantity || 0) > 0 || Number(line.amount || 0) > 0);
}

