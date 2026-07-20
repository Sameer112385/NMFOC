"use client";

import { ArrowDownUp, Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Badge, surfaceCard } from '@/components/ui';
import { DarkSelect } from '@/components/dark-select';
import { MultiWbsSelect } from '@/components/multi-wbs-select';
import { formatCurrency, formatPercent } from '@/lib/utils';

type RevenueRow = {
  project_id: string;
  wbs_code: string;
  wbs_description: string;
  status: string;
  sap_actual_cost?: number;
  sap_earned_revenue?: number;
  pm_pending_cost?: number;
  planned_cost: number;
  actual_cost_to_date: number;
  planned_revenue: number;
  recognized_revenue_to_date: number;
  remaining_revenue: number;
  remaining_cost: number;
  forecast_margin: number;
  forecast_margin_percent: number;
  mtd_actual_cost: number;
  mtd_revenue_recognition: number;
  ytd_actual_cost: number;
  ytd_revenue_recognition: number;
  poc_percent: number;
  mtd_margin: number;
  ytd_margin: number;
  current_month_revenue_recognition?: number;
  opening_recognized_revenue?: number;
};

type SortKey = 'wbs_code' | 'wbs_description' | 'planned_cost' | 'actual_cost_to_date' | 'planned_revenue' | 'recognized_revenue_to_date' | 'mtd_revenue_recognition' | 'remaining_revenue' | 'remaining_cost' | 'poc_percent' | 'forecast_margin';

function getStatusTone(row: RevenueRow): 'default' | 'success' | 'warning' | 'danger' {
  if (row.status.toLowerCase() === 'overrun' || row.forecast_margin < 0) return 'danger';
  if (row.poc_percent >= 90) return 'warning';
  if (row.poc_percent > 0) return 'success';
  return 'default';
}

export function DashboardWbsFilter({
  rows,
  selectedPos = [],
  setSelectedPos = () => {},
  poOptions = [],
  gr55Rows = [],
  historicalRevenueRows = [],
  updates = [],
  projectWbsMaster = [],
  costElementControl = [],
}: {
  rows: RevenueRow[];
  selectedPos?: string[];
  setSelectedPos?: (val: string[]) => void;
  poOptions?: string[];
  gr55Rows?: any[];
  historicalRevenueRows?: any[];
  updates?: any[];
  projectWbsMaster?: any[];
  costElementControl?: any[];
}) {
  const [selectedWbs, setSelectedWbs] = useState<string[]>([]);
  const [descriptionQuery, setDescriptionQuery] = useState('');
  const [statusQuery, setStatusQuery] = useState('');
  const [percentageQuery, setPercentageQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('recognized_revenue_to_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedMonth, setSelectedMonth] = useState<string>('');

  const normalizeCode = (val: string) => String(val || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

  // Find all available months in history
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    gr55Rows.forEach((r) => {
      if (r.posting_date) {
        months.add(r.posting_date.slice(0, 7)); // YYYY-MM
      }
    });
    historicalRevenueRows.forEach((r) => {
      if (r.posting_date) {
        months.add(r.posting_date.slice(0, 7));
      }
    });
    return Array.from(months).sort().reverse(); // Newest first
  }, [gr55Rows, historicalRevenueRows]);

  // Dynamically compute monthly performance states if a month is selected
  const processedRows = useMemo(() => {
    if (!selectedMonth) return rows;

    const currentPeriod = selectedMonth;
    const startOfMonth = `${currentPeriod}-01`;
    const endOfMonth = `${currentPeriod}-31`;
    const selectedYear = currentPeriod.slice(0, 4);

    const costElementMap = new Map(
      costElementControl
        .map((r) => [normalizeCode(r.cost_element), r] as const)
        .filter(([c]) => Boolean(c))
    );

    const wbsMasterMap = new Map(
      projectWbsMaster
        .map((w) => [normalizeCode(w.wbs_code), w] as const)
        .filter(([c]) => Boolean(c))
    );
    const hasWbsMaster = projectWbsMaster.length > 0;

    return rows.map((wbsRow) => {
      const code = normalizeCode(wbsRow.wbs_code);
      const plannedCost = wbsRow.planned_cost;
      const plannedRevenue = wbsRow.planned_revenue;

      const config = wbsMasterMap.get(code);
      const isRevenueGenerating = hasWbsMaster
        ? Boolean(config?.is_active !== false && config?.is_revenue_generating)
        : (plannedRevenue > 0);

      // Filter GR55 actual costs for this WBS up to the selected month
      const wbsGr55 = gr55Rows.filter((r) => {
        const rCode = normalizeCode(r.wbs_code);
        if (rCode !== code) return false;
        if (!r.posting_date || r.posting_date > endOfMonth) return false;

        // Exclude revenue GLs
        const costEl = normalizeCode(r.cost_element);
        if (['400110', '400119', '400210', '400310'].includes(costEl)) return false;

        // Filter by cost element control
        if (costElementMap.size > 0) {
          const ctrl = costElementMap.get(costEl);
          if (ctrl && ctrl.include_in_cost === false) return false;
        }
        return true;
      });

      // Filter PM updates for this WBS up to the selected month
      const wbsUpdates = updates.filter((u) => {
        const uWbs = u.revenue_wbs_id ? normalizeCode(u.revenue_wbs_id) : '';
        const rawWbs = u.wbs_code ? normalizeCode(u.wbs_code) : '';
        if (uWbs !== code && rawWbs !== code) return false;
        return u.update_date && u.update_date <= endOfMonth;
      });

      // Helper to compute pending cost from a daily update
      const getPendingCost = (u: any) => {
        const mat = u.material_sap_posted ? 0 : Number(u.pending_material_cost || 0);
        const sub = u.subcontract_sap_posted ? 0 : Number(u.pending_subcontractor_cost || 0);
        const man = u.manpower_sap_posted ? 0 : Number(u.pending_manpower_cost || 0);
        return mat + sub + man;
      };

      // SAP actual cost to date for selected month
      const sapActualCost = wbsGr55.reduce((sum, r) => sum + Number(r.amount || 0), 0);
      const sapMtdActualCost = wbsGr55
        .filter((r) => r.posting_date.slice(0, 7) === currentPeriod)
        .reduce((sum, r) => sum + Number(r.amount || 0), 0);
      const sapYtdActualCost = wbsGr55
        .filter((r) => r.posting_date.slice(0, 4) === selectedYear)
        .reduce((sum, r) => sum + Number(r.amount || 0), 0);

      // PM Simulated costs
      const pmSimulatedCost = wbsUpdates.reduce((sum, r) => sum + getPendingCost(r), 0);
      const mtdPmSimulatedCost = wbsUpdates
        .filter((u) => u.update_date.slice(0, 7) === currentPeriod)
        .reduce((sum, u) => sum + getPendingCost(u), 0);
      const ytdPmSimulatedCost = wbsUpdates
        .filter((u) => u.update_date.slice(0, 4) === selectedYear)
        .reduce((sum, u) => sum + getPendingCost(u), 0);

      const actual_cost_to_date = sapActualCost + pmSimulatedCost;
      const mtd_actual_cost = sapMtdActualCost + mtdPmSimulatedCost;
      const ytd_actual_cost = sapYtdActualCost + ytdPmSimulatedCost;

      const poc_percent = plannedCost > 0 ? Math.min(100, (actual_cost_to_date / plannedCost) * 100) : 0;
      const recognized_revenue_to_date = (poc_percent / 100) * plannedRevenue;

      // Calculate previous months' actual posted revenue in SAP + historical
      const wbsGr55Revenue = isRevenueGenerating ? gr55Rows.filter((r) => {
        const rCode = normalizeCode(r.wbs_code);
        if (rCode !== code) return false;
        if (!r.posting_date) return false;
        const costEl = normalizeCode(r.cost_element);
        return ['400110', '400119', '400210', '400310'].includes(costEl);
      }) : [];

      const wbsHistRev = isRevenueGenerating ? historicalRevenueRows.filter((r) => {
        const rCode = normalizeCode(r.wbs_code);
        if (rCode !== code) return false;
        return !!r.posting_date;
      }) : [];

      const prevMonthsSet = new Set<string>();
      wbsHistRev.forEach((row) => {
        const m = row.posting_date ? row.posting_date.slice(0, 7) : '';
        if (m && m < currentPeriod) prevMonthsSet.add(m);
      });
      wbsGr55Revenue.forEach((row) => {
        const m = row.posting_date ? row.posting_date.slice(0, 7) : '';
        if (m && m >= '2026-01' && m < currentPeriod) prevMonthsSet.add(m);
      });
      const prevMonthsList = Array.from(prevMonthsSet).sort();

      const getPostedRevForMonthLocal = (monthStr: string): number => {
        const isPre2026 = monthStr < '2026-01';
        if (isPre2026) {
          return wbsHistRev
            .filter((row) => row.posting_date.slice(0, 7) === monthStr)
            .reduce((sum, row) => sum + Number(row.amount || 0), 0);
        } else {
          return -wbsGr55Revenue
            .filter((row) => row.posting_date.slice(0, 7) === monthStr)
            .reduce((sum, row) => sum + Number(row.amount || 0), 0);
        }
      };

      const cumulativePostedRevenuePrevMonths = prevMonthsList.reduce((sum, month) => sum + getPostedRevForMonthLocal(month), 0);
      const mtd_revenue_recognition = recognized_revenue_to_date - cumulativePostedRevenuePrevMonths;

      // YTD Revenue
      let ytd_revenue_recognition = 0;
      if (selectedYear) {
        const currentMonthInt = parseInt(currentPeriod.slice(5, 7), 10);
        for (let mVal = 1; mVal <= currentMonthInt; mVal++) {
          const monthStr = `${selectedYear}-${mVal < 10 ? '0' + mVal : mVal}`;
          if (monthStr < currentPeriod) {
            ytd_revenue_recognition += getPostedRevForMonthLocal(monthStr);
          } else if (monthStr === currentPeriod) {
            ytd_revenue_recognition += mtd_revenue_recognition;
          }
        }
      }

      const remaining_revenue = plannedRevenue - recognized_revenue_to_date;
      const remaining_cost = plannedCost - actual_cost_to_date;
      const forecast_margin = plannedRevenue - actual_cost_to_date;

      const status = actual_cost_to_date > plannedCost
        ? 'Overrun'
        : actual_cost_to_date > 0 ? 'In Progress' : 'Stable';

      return {
        ...wbsRow,
        actual_cost_to_date,
        mtd_actual_cost,
        ytd_actual_cost,
        recognized_revenue_to_date,
        mtd_revenue_recognition,
        ytd_revenue_recognition,
        remaining_revenue,
        remaining_cost,
        forecast_margin,
        poc_percent,
        status,
        sap_actual_cost: sapActualCost,
        pm_pending_cost: pmSimulatedCost,
      };
    });
  }, [rows, selectedMonth, gr55Rows, updates, costElementControl]);

  const wbsOptions = useMemo(() => {
    return processedRows.map((r) => ({
      value: r.wbs_code,
      label: r.wbs_description ? `${r.wbs_code} - ${r.wbs_description}` : r.wbs_code,
    })).sort((a, b) => a.value.localeCompare(b.value));
  }, [processedRows]);

  const descriptionOptions = useMemo(() => Array.from(new Set(processedRows.map((row) => row.wbs_description).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [processedRows]);
  const descriptionChoices = useMemo(() => [{ value: '', label: 'All descriptions' }, ...descriptionOptions.map((description) => ({ value: description, label: description }))], [descriptionOptions]);
  const statusChoices = useMemo(() => [{ value: '', label: 'All statuses' }, ...Array.from(new Set(processedRows.map((row) => row.status).filter(Boolean))).sort((a, b) => a.localeCompare(b)).map((status) => ({ value: status, label: status }))], [processedRows]);
  const percentageChoices = useMemo(() => [
    { value: '', label: 'All percentages' },
    { value: '0-25', label: '0% - 25%' },
    { value: '25-50', label: '25% - 50%' },
    { value: '50-75', label: '50% - 75%' },
    { value: '75-100', label: '75% - 100%' },
    { value: '100+', label: '100%+' },
  ], []);

  const filteredRows = useMemo(() => {
    const desc = descriptionQuery.trim().toLowerCase();
    const status = statusQuery.trim().toLowerCase();
    
    return processedRows.filter((row) => {
      // WBS filter: support multiple selection (match by hierarchical startsWith prefix)
      const matchesWbs =
        selectedWbs.length === 0 ||
        selectedWbs.some((f) => row.wbs_code.toLowerCase().startsWith(f.toLowerCase()));
        
      const matchesDesc = !desc || row.wbs_description.toLowerCase().includes(desc);
      const matchesStatus = !status || row.status.toLowerCase() === status;
      const p = row.poc_percent;
      const matchesPercentage =
        !percentageQuery ||
        (percentageQuery === '0-25' && p >= 0 && p < 25) ||
        (percentageQuery === '25-50' && p >= 25 && p < 50) ||
        (percentageQuery === '50-75' && p >= 50 && p < 75) ||
        (percentageQuery === '75-100' && p >= 75 && p <= 100) ||
        (percentageQuery === '100+' && p > 100);
      return matchesWbs && matchesDesc && matchesStatus && matchesPercentage;
    });
  }, [processedRows, selectedWbs, descriptionQuery, statusQuery, percentageQuery]);

  const sortedRows = useMemo(() => {
    const ordered = [...filteredRows].sort((a, b) => {
      const left = a[sortKey];
      const right = b[sortKey];
      if (typeof left === 'string' && typeof right === 'string') return left.localeCompare(right);
      return Number(left) - Number(right);
    });
    return sortDirection === 'asc' ? ordered : ordered.reverse();
  }, [filteredRows, sortDirection, sortKey]);

  const totals = {
    sapActualCost: filteredRows.reduce((sum, row) => sum + (row.sap_actual_cost ?? 0), 0),
    pmSimulatedCost: filteredRows.reduce((sum, row) => sum + (row.pm_pending_cost ?? 0), 0),
    actualCost: filteredRows.reduce((sum, row) => sum + row.actual_cost_to_date, 0),
    plannedCost: filteredRows.reduce((sum, row) => sum + row.planned_cost, 0),
    plannedRevenue: filteredRows.reduce((sum, row) => sum + row.planned_revenue, 0),
    recognizedRevenue: filteredRows.reduce((sum, row) => sum + row.recognized_revenue_to_date, 0),
    remainingRevenue: filteredRows.reduce((sum, row) => sum + row.remaining_revenue, 0),
    remainingCost: filteredRows.reduce((sum, row) => sum + row.remaining_cost, 0),
    forecastMargin: filteredRows.reduce((sum, row) => sum + row.forecast_margin, 0),
    mtdRecognition: filteredRows.reduce((sum, row) => sum + row.mtd_revenue_recognition, 0),
    ytdRecognition: filteredRows.reduce((sum, row) => sum + row.ytd_revenue_recognition, 0),
  };

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === 'wbs_code' || nextKey === 'wbs_description' ? 'asc' : 'desc');
  }

  function exportToExcel() {
    const dataToExport = sortedRows.map((row) => ({
      'WBS Code': row.wbs_code,
      'WBS Description': row.wbs_description,
      'Planned Cost': row.planned_cost,
      'Actual Cost': row.actual_cost_to_date,
      'Planned Revenue': row.planned_revenue,
      'Recognized Revenue': row.recognized_revenue_to_date,
      'In Month Revenue': row.mtd_revenue_recognition,
      'Remaining Revenue': row.remaining_revenue,
      'Remaining Cost': row.remaining_cost,
      'POC %': row.poc_percent,
      'Forecast Margin': row.forecast_margin,
      'Status': row.status,
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'WBS Analysis');
    XLSX.writeFile(workbook, `wbs_financial_analysis_${sortedRows[0]?.project_id ?? 'project'}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const headerButton = (label: string, key: SortKey, align: 'left' | 'right' = 'left') => (
    <button type="button" onClick={() => toggleSort(key)} className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted hover:text-text transition ${align === 'right' ? 'justify-end w-full' : ''}`}>
      {label}
      <ArrowDownUp className="h-3 w-3" />
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Filters Pane */}
      <div className="rounded-xl border border-line/50 bg-panel/30 p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1.1fr_0.9fr_1fr_0.8fr_0.8fr_0.8fr_0.8fr_auto] xl:items-end">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-muted">WBS Elements (Multi-select)</span>
            <MultiWbsSelect
              selectedValues={selectedWbs}
              onChange={setSelectedWbs}
              options={wbsOptions}
              placeholder="All WBS Elements"
            />
          </label>
          {poOptions.length > 1 && (
            <label className="block">
              <span className="mb-2 block text-xs font-semibold text-muted">PO Number</span>
              <MultiWbsSelect
                selectedValues={selectedPos}
                onChange={setSelectedPos}
                options={poOptions.filter(Boolean).map((po) => ({ value: po, label: po }))}
                placeholder="All POs"
              />
            </label>
          )}
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-muted">WBS Description</span>
            <DarkSelect value={descriptionQuery} onChange={setDescriptionQuery} options={descriptionChoices} placeholder="All descriptions" />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-muted">Status</span>
            <DarkSelect value={statusQuery} onChange={setStatusQuery} options={statusChoices} placeholder="All statuses" />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-muted">POC Band</span>
            <DarkSelect value={percentageQuery} onChange={setPercentageQuery} options={percentageChoices} placeholder="All percentages" />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-muted">Reporting Month</span>
            <DarkSelect
              value={selectedMonth}
              onChange={setSelectedMonth}
              options={[
                { value: '', label: 'Current Month' },
                ...availableMonths.map((m) => {
                  const date = new Date(`${m}-02`);
                  const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                  return { value: m, label };
                })
              ]}
              placeholder="Current Month"
            />
          </label>
          <button
            type="button"
            onClick={() => { setSelectedWbs([]); setDescriptionQuery(''); setStatusQuery(''); setPercentageQuery(''); setSelectedPos([]); setSelectedMonth(''); }}
            className="rounded-lg border border-line bg-panel px-5 py-2.5 text-xs font-bold text-text hover:bg-panel2 hover:border-line/80 transition shadow-sm h-[38px] xl:h-auto"
          >
            Reset Filters
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
        {[
          { label: 'SAP Actual Cost', value: formatCurrency(totals.sapActualCost) },
          { label: 'PM Simulated Cost', value: formatCurrency(totals.pmSimulatedCost) },
          { label: 'Management Actual', value: formatCurrency(totals.actualCost) },
          { label: 'Planned Revenue', value: formatCurrency(totals.plannedRevenue) },
          { label: 'Recognized Revenue', value: formatCurrency(totals.recognizedRevenue) },
          { label: 'Remaining Revenue', value: formatCurrency(totals.remainingRevenue) },
          { label: 'MTD Recognition', value: formatCurrency(totals.mtdRecognition) },
          { label: 'YTD Recognition', value: formatCurrency(totals.ytdRecognition) },
        ].map((item, idx) => (
          <div key={idx} className="rounded-xl border border-line/45 bg-panel p-4 shadow-card">
            <div className="section-kicker text-muted/70 font-semibold tracking-wider">{item.label}</div>
            <div className="data-value mt-2.5 text-right text-[14px] font-extrabold text-text tracking-tight">{item.value}</div>
          </div>
        ))}
      </div>

      {/* WBS Details Table */}
      <div className={`overflow-hidden border border-line/40 bg-panel/30 shadow-card ${surfaceCard}`}>
        <div className="border-b border-line/30 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-text">WBS Financial Breakdown</div>
            <div className="mt-1 text-xs text-muted/75 font-medium font-sans">Filtered WBS performance details. Sorting and status badges match live configuration.</div>
          </div>
          <button
            type="button"
            onClick={exportToExcel}
            disabled={!sortedRows.length}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent text-white px-4 py-2 text-xs font-bold shadow hover:bg-accent-hover active:scale-[0.98] transition disabled:opacity-65 shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export to Excel</span>
          </button>
        </div>
        <div className="overflow-x-auto overflow-y-auto max-h-[580px] scrollbar-thin">
          <table className="min-w-[1320px] w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-panel2/95 backdrop-blur-sm border-b border-line/45 text-left text-muted/80 shadow-[0_1px_0_rgba(0,0,0,0.05)]">
              <tr>
                <th className="px-4 py-3.5">{headerButton('WBS Code', 'wbs_code')}</th>
                <th className="px-4 py-3.5">{headerButton('WBS Description', 'wbs_description')}</th>
                <th className="px-4 py-3.5 text-right">{headerButton('Planned Cost', 'planned_cost', 'right')}</th>
                <th className="px-4 py-3.5 text-right">{headerButton('Actual Cost', 'actual_cost_to_date', 'right')}</th>
                <th className="px-4 py-3.5 text-right">{headerButton('Planned Revenue', 'planned_revenue', 'right')}</th>
                <th className="px-4 py-3.5 text-right">{headerButton('Recognized Rev', 'recognized_revenue_to_date', 'right')}</th>
                <th className="px-4 py-3.5 text-right">{headerButton('Remaining Rev', 'remaining_revenue', 'right')}</th>
                <th className="px-4 py-3.5 text-right">{headerButton('Remaining Cost', 'remaining_cost', 'right')}</th>
                <th className="px-4 py-3.5 text-right">{headerButton('POC %', 'poc_percent', 'right')}</th>
                <th className="px-4 py-3.5 text-right">{headerButton('Forecast Margin', 'forecast_margin', 'right')}</th>
                <th className="px-4 py-3.5 text-right">{headerButton('In Month Rev', 'mtd_revenue_recognition', 'right')}</th>
                <th className="px-4 py-3.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/30 text-text font-medium">
              {sortedRows.map((row) => (
                <tr key={row.wbs_code} className="hover:bg-panel2/40 transition">
                  <td className="px-4 py-3 font-mono text-accent">{row.wbs_code}</td>
                  <td className="px-4 py-3 truncate max-w-[280px]" title={row.wbs_description}>{row.wbs_description}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(row.planned_cost)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(row.actual_cost_to_date)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(row.planned_revenue)}</td>
                  <td className="px-4 py-3 text-right font-mono text-success">{formatCurrency(row.recognized_revenue_to_date)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(row.remaining_revenue)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(row.remaining_cost)}</td>
                  <td className="px-4 py-3 text-right font-mono text-success">{formatPercent(row.poc_percent)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(row.forecast_margin)}</td>
                  <td className="px-4 py-3 text-right font-mono text-success">{formatCurrency(row.mtd_revenue_recognition)}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge tone={getStatusTone(row)}>{row.status}</Badge>
                  </td>
                </tr>
              ))}
              {!sortedRows.length && (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-muted">No WBS records found.</td>
                </tr>
              )}
            </tbody>
            {sortedRows.length > 0 && (() => {
              const totalPlannedCost = sortedRows.reduce((sum, r) => sum + r.planned_cost, 0);
              const totalActualCost = sortedRows.reduce((sum, r) => sum + r.actual_cost_to_date, 0);
              const totalPlannedRevenue = sortedRows.reduce((sum, r) => sum + r.planned_revenue, 0);
              const totalRecognizedRevenue = sortedRows.reduce((sum, r) => sum + r.recognized_revenue_to_date, 0);
              const totalRemainingRevenue = sortedRows.reduce((sum, r) => sum + r.remaining_revenue, 0);
              const totalRemainingCost = sortedRows.reduce((sum, r) => sum + r.remaining_cost, 0);
              const totalForecastMargin = sortedRows.reduce((sum, r) => sum + r.forecast_margin, 0);
              const totalMtdRevenue = sortedRows.reduce((sum, r) => sum + r.mtd_revenue_recognition, 0);
              
              // Overall POC = (Total Recognized Revenue / Total Planned Revenue) * 100
              const overallPoc = totalPlannedRevenue > 0 ? (totalRecognizedRevenue / totalPlannedRevenue) * 100 : 0;
              
              return (
                <tfoot className="sticky bottom-0 z-10 bg-panel2/95 backdrop-blur-sm border-t-2 border-line/65 font-bold text-text shadow-[0_-2px_6px_rgba(0,0,0,0.06)]">
                  <tr>
                    <td className="px-4 py-3.5 text-accent font-extrabold text-[11px] uppercase tracking-wider">TOTAL</td>
                    <td className="px-4 py-3.5 text-muted/95 truncate max-w-[280px]">Summary ({sortedRows.length} WBS items)</td>
                    <td className="px-4 py-3.5 text-right font-mono">{formatCurrency(totalPlannedCost)}</td>
                    <td className="px-4 py-3.5 text-right font-mono">{formatCurrency(totalActualCost)}</td>
                    <td className="px-4 py-3.5 text-right font-mono">{formatCurrency(totalPlannedRevenue)}</td>
                    <td className="px-4 py-3.5 text-right font-mono text-success">{formatCurrency(totalRecognizedRevenue)}</td>
                    <td className="px-4 py-3.5 text-right font-mono">{formatCurrency(totalRemainingRevenue)}</td>
                    <td className="px-4 py-3.5 text-right font-mono">{formatCurrency(totalRemainingCost)}</td>
                    <td className="px-4 py-3.5 text-right font-mono text-success">{formatPercent(overallPoc)}</td>
                    <td className="px-4 py-3.5 text-right font-mono">{formatCurrency(totalForecastMargin)}</td>
                    <td className="px-4 py-3.5 text-right font-mono text-success">{formatCurrency(totalMtdRevenue)}</td>
                    <td className="px-4 py-3.5 text-center">
                      <Badge tone={totalActualCost > totalPlannedCost ? "danger" : "success"}>
                        {totalActualCost > totalPlannedCost ? "Overrun" : "Stable"}
                      </Badge>
                    </td>
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        </div>
      </div>
      {/* Charts removed — they are rendered once as standalone summary widgets (Recognized
          vs Remaining, POC % by WBS, Revenue vs Simulation, Cost Comparison, Top Links). */}
    </div>
  );
}
