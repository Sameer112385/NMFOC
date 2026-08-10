"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LabelList,
  ResponsiveContainer,
} from "recharts";
import {
  FileSpreadsheet,
  Printer,
  TrendingUp,
  Coins,
  Activity,
  Briefcase,
  Percent,
  Calendar,
  Filter,
  DollarSign,
  Search,
  ChevronLeft,
  ChevronRight,
  Info,
  X,
  LayoutGrid,
  Loader2,
  Download,
} from "lucide-react";
import * as XLSX from "xlsx";
import { buildTrendData, normalizeCode, type TrendDataPoint } from "@/lib/trends";
import { isWidgetHidden, type DashboardLayout, getWidget } from "@/lib/dashboard-widgets";
import { DashboardGrid, type GridItem } from "@/components/dashboard-grid";
import { getEffectivePendingCost } from "@/lib/pm-posting";
import { MultiWbsSelect } from "@/components/multi-wbs-select";
import { DarkSelect } from "@/components/dark-select";
import { formatCurrency, formatPercent, formatCompactNumber } from "@/lib/utils";
import type {
  DailyUpdate,
  Gr55CostRow,
  Project,
  ProjectCostElementControl,
  ProjectWbsMaster,
  RevenueWBS,
  HistoricalRevenueRow,
  PoCommitmentRow,
} from "@/lib/types";

// Design constants matching globals.css
const chartTooltipStyle = {
  backgroundColor: "rgb(var(--color-panel) / 0.95)",
  border: "1px solid rgb(var(--color-line) / 0.7)",
  borderRadius: 10,
  color: "rgb(var(--color-text))",
  boxShadow: "var(--shadow-panel)",
  fontSize: "11px",
  fontFamily: "Inter, sans-serif",
};

const CustomChartTooltip = ({ active, payload, label, formatter, labelFormatter }: any) => {
  if (!active || !payload || !payload.length) return null;

  const activeItems = payload.filter((item: any) => item.value !== undefined && item.value !== null && Number(item.value) !== 0);
  if (activeItems.length === 0) return null;

  const formattedLabel = labelFormatter ? labelFormatter(label) : label;
  const isMultiCol = activeItems.length > 8;

  return (
    <div className="rounded-2xl border border-line bg-panel/95 p-3.5 shadow-xl backdrop-blur-sm font-sans text-xs max-w-[540px]">
      <p className="font-bold text-text mb-2 border-b border-line/45 pb-1">{formattedLabel}</p>
      <div className={isMultiCol ? "grid grid-cols-2 gap-x-6 gap-y-0.5 max-h-[85vh] overflow-y-auto pr-1" : "space-y-1"}>
        {activeItems.map((item: any, index: number) => {
          const formatted = formatter ? formatter(item.value, item.name, item) : null;
          const displayVal = formatted
            ? (Array.isArray(formatted) ? formatted[0] : formatted)
            : (item.value >= 0 || item.value < 0 ? String(item.value) : ""); // Safe fallback

          const nameLabel = formatted && Array.isArray(formatted) && formatted[1] ? formatted[1] : item.name;

          return (
            <div key={index} className="flex items-center gap-3 justify-between font-medium py-0.5 border-b border-line/5 last:border-b-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="inline-block h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: item.color || item.fill }} />
                <span className="text-muted truncate max-w-[150px] text-[10px]" title={nameLabel}>{nameLabel}</span>
              </div>
              <span className="font-mono font-bold text-text text-[10px] shrink-0">{displayVal}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const CATEGORY_COLORS = [
  "#3b82f6", // Blue
  "#10b981", // Emerald Green
  "#f59e0b", // Amber/Yellow
  "#ef4444", // Red
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#f97316", // Orange
  "#14b8a6", // Teal
];

interface TrendAnalysisPanelProps {
  currentProjectId: string;
  projects: Project[];
  costRows: RevenueWBS[];
  gr55Rows: Gr55CostRow[];
  poCommitments?: PoCommitmentRow[];
  updates: DailyUpdate[];
  wbsMaster: ProjectWbsMaster[];
  costElementControl: ProjectCostElementControl[];
  selectedPos: string[];
  setSelectedPos: (val: string[]) => void;
  poOptions: string[];
  historicalRevenueRows?: HistoricalRevenueRow[];
  dashboardLayout?: DashboardLayout;
  canCustomize?: boolean;
  trendsOrder?: string[][];
  editingLayout?: boolean;
  setEditingLayout?: (v: boolean) => void;
  mode?: "revenue" | "cost";
}

// ---- Per-column (period) value filter, Excel-autofilter style ----
type ColumnValueFilter = { pos: boolean; neg: boolean; zero: boolean; min: string; max: string };
const DEFAULT_COLUMN_FILTER: ColumnValueFilter = { pos: true, neg: true, zero: true, min: "", max: "" };

function isColumnFilterActive(f?: ColumnValueFilter): boolean {
  if (!f) return false;
  return !(f.pos && f.neg && f.zero && f.min === "" && f.max === "");
}

// Does a single cell value pass a column's filter?
function cellPassesColumnFilter(value: number, f: ColumnValueFilter): boolean {
  const signOk = (value > 0 && f.pos) || (value < 0 && f.neg) || (value === 0 && f.zero);
  if (!signOk) return false;
  if (f.min !== "" && Number.isFinite(Number(f.min)) && value < Number(f.min)) return false;
  if (f.max !== "" && Number.isFinite(Number(f.max)) && value > Number(f.max)) return false;
  return true;
}

// Funnel button on a column header. Popover is portaled to <body> so the table's
// overflow/scroll container cannot clip it.
function ColumnFilterButton({
  period,
  value,
  onChange,
}: {
  period: string;
  value: ColumnValueFilter;
  onChange: (next: ColumnValueFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const active = isColumnFilterActive(value);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = btnRef.current?.getBoundingClientRect();
      if (rect) setCoords({ top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 236) });
    };
    place();
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScroll = (e: Event) => {
      if (popRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={`Filter rows by their ${period} value`}
        className={`ml-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded transition ${
          active ? "text-accent" : "text-muted/40 hover:text-muted"
        }`}
        aria-label={`Filter ${period} column`}
      >
        <Filter className="h-3 w-3" fill={active ? "currentColor" : "none"} />
      </button>

      {open && coords && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popRef}
              style={{ top: coords.top, left: coords.left }}
              className="fixed z-[100] w-56 rounded-xl border border-line bg-panel p-3 text-xs shadow-lg"
            >
              <div className="mb-2 font-bold text-text">Filter {period}</div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Show values</div>
              {(["pos", "neg", "zero"] as const).map((k) => (
                <label key={k} className="flex cursor-pointer items-center gap-2 py-1 text-text">
                  <input
                    type="checkbox"
                    checked={value[k]}
                    onChange={(e) => onChange({ ...value, [k]: e.target.checked })}
                    className="h-3.5 w-3.5 rounded border-line accent-accent"
                  />
                  {k === "pos" ? "Positive" : k === "neg" ? "Negative" : "Zero / blank"}
                </label>
              ))}
              <div className="mt-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                Amount range
              </div>
              <div className="flex items-center gap-2">
                <input
                  inputMode="decimal"
                  placeholder="Min"
                  value={value.min}
                  onChange={(e) => onChange({ ...value, min: e.target.value })}
                  className="w-full rounded-lg border border-line bg-panel2 px-2 py-1.5 text-text outline-none focus:border-accent"
                />
                <input
                  inputMode="decimal"
                  placeholder="Max"
                  value={value.max}
                  onChange={(e) => onChange({ ...value, max: e.target.value })}
                  className="w-full rounded-lg border border-line bg-panel2 px-2 py-1.5 text-text outline-none focus:border-accent"
                />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onChange(DEFAULT_COLUMN_FILTER)}
                  className="text-[11px] font-bold text-muted transition hover:text-text"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg bg-accent px-3 py-1 text-[11px] font-bold text-white"
                >
                  Done
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

// Searchable WBS row filter, presented as a funnel on the WBS column header.
// Popover is portaled to <body> so the table's scroll container cannot clip it.
function WbsColumnFilter({
  options,
  selected,
  onChange,
}: {
  options: { norm: string; code: string; desc: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const active = selected.length > 0;

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = btnRef.current?.getBoundingClientRect();
      if (rect) setCoords({ top: rect.bottom + 6, left: Math.max(8, rect.left) });
    };
    place();
    window.setTimeout(() => searchRef.current?.focus(), 0);
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScroll = (e: Event) => {
      if (popRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter(
      (o) => o.code.toLowerCase().includes(term) || o.desc.toLowerCase().includes(term),
    );
  }, [options, query]);

  const toggle = (norm: string) =>
    onChange(selected.includes(norm) ? selected.filter((x) => x !== norm) : [...selected, norm]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Filter / search WBS rows"
        className={`ml-1.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded transition ${
          active ? "text-accent" : "text-muted/40 hover:text-muted"
        }`}
        aria-label="Filter WBS rows"
      >
        <Filter className="h-3 w-3" fill={active ? "currentColor" : "none"} />
      </button>

      {open && coords && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popRef}
              style={{ top: coords.top, left: coords.left }}
              className="fixed z-[100] flex max-h-80 w-72 flex-col overflow-hidden rounded-xl border border-line bg-panel text-xs shadow-lg"
            >
              <div className="shrink-0 border-b border-line/70 p-2">
                <div className="flex items-center gap-2 rounded-lg border border-line bg-panel2/60 px-3 py-2">
                  <Search className="h-3.5 w-3.5 shrink-0 text-muted/70" />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search WBS code or link name..."
                    className="w-full bg-transparent text-xs text-text outline-none placeholder:text-muted/60"
                  />
                </div>
                <div className="mt-2 flex justify-between px-1">
                  <button
                    type="button"
                    onClick={() => onChange(filtered.map((o) => o.norm))}
                    className="text-[10px] font-bold uppercase text-accent hover:underline"
                  >
                    Select shown
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange([])}
                    className="text-[10px] font-bold uppercase text-muted hover:text-text hover:underline"
                  >
                    Clear all
                  </button>
                </div>
              </div>
              <ul className="min-h-0 flex-1 divide-y divide-line/35 overflow-y-auto py-1">
                {filtered.map((o) => {
                  const isSel = selected.includes(o.norm);
                  return (
                    <li
                      key={o.norm}
                      onClick={() => toggle(o.norm)}
                      className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 text-text transition hover:bg-panel2/50 ${
                        isSel ? "bg-accent/5" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => {}}
                        className="h-3.5 w-3.5 shrink-0 rounded border-line accent-accent"
                      />
                      <span className="truncate" title={`${o.code}${o.desc ? ` — ${o.desc}` : ""}`}>
                        <span className="font-mono text-accent/85">{o.code}</span>
                        {o.desc ? <span className="ml-1.5 text-muted">{o.desc}</span> : null}
                      </span>
                    </li>
                  );
                })}
                {filtered.length === 0 ? (
                  <li className="px-3 py-6 text-center text-muted/65">No WBS found</li>
                ) : null}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function TrendAnalysisPanel({
  mode = "revenue",
  currentProjectId,
  projects,
  costRows,
  gr55Rows,
  poCommitments = [],
  updates,
  wbsMaster,
  costElementControl,
  selectedPos,
  setSelectedPos,
  poOptions,
  historicalRevenueRows = [],
  dashboardLayout,
  canCustomize = false,
  trendsOrder = [],
  editingLayout: editingTrends = false,
  setEditingLayout: setEditingTrends,
}: TrendAnalysisPanelProps) {
  // Visibility gate. Fail-safe: only an explicit hidden/archived override removes a visual.
  const show = (id: string) => !isWidgetHidden(dashboardLayout, id);
  // Filters State (Project & Customer are removed as they are contextually fixed)
  const [selectedWbs, setSelectedWbs] = useState<string[]>([]);
  const [periodType, setPeriodType] = useState<"month" | "quarter" | "year">("month");
  const [startPeriod, setStartPeriod] = useState<string>("");
  const [costViewMode, setCostViewMode] = useState<"all" | "subcontractor" | "material" | "manpower">("all");
  const [endPeriod, setEndPeriod] = useState<string>("");
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [spendingTableTab, setSpendingTableTab] = useState<"vendor" | "po">("vendor");
  const [spendingSort, setSpendingSort] = useState<"provision" | "actual" | "remaining" | "utilization" | "name" | "poCount">("actual");
  const [spendingSortDirection, setSpendingSortDirection] = useState<"asc" | "desc">("desc");
  const toggleSpendingSort = (key: "provision" | "actual" | "remaining" | "utilization" | "name" | "poCount") => {
    if (spendingSort === key) setSpendingSortDirection((direction) => direction === "asc" ? "desc" : "asc");
    else { setSpendingSort(key); setSpendingSortDirection(key === "name" ? "asc" : "desc"); }
  };

  // Chart Config Toggles
  const [costChartMode, setCostChartMode] = useState<"cumulative" | "period">("cumulative");
  const [revenueChartMode, setRevenueChartMode] = useState<"cumulative" | "period">("cumulative");
  const trendChartScrollRefs = useRef<HTMLDivElement[]>([]);
  const registerTrendChartScroller = (node: HTMLDivElement | null) => {
    if (node && !trendChartScrollRefs.current.includes(node)) trendChartScrollRefs.current.push(node);
  };

  // Interactive Drill-Down State
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  // A single WBS (normalized code) to drill into its actual-cost postings across the range.
  const [drilldownWbs, setDrilldownWbs] = useState<string | null>(null);
  const [drilldownTab, setDrilldownTab] = useState<"sap" | "pm" | "wbs" | "category">("sap");
  const [drilldownSearch, setDrilldownSearch] = useState<string>("");
  const [drilldownPage, setDrilldownPage] = useState<number>(1);
  const itemsPerPage = 8;

  // Revenue by WBS & Period matrix
  const [matrixSort, setMatrixSort] = useState<"code" | "total">("code");
  const [hideZeroMatrixRows, setHideZeroMatrixRows] = useState<boolean>(true);
  // Searchable WBS row filter (normalized codes); empty = all rows.
  const [selectedMatrixWbs, setSelectedMatrixWbs] = useState<string[]>([]);
  // Excel-style per-column value filters, keyed by period.
  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnValueFilter>>({});

  // Drag-and-drop layout editing state (editingTrends/setEditingTrends come from parent props)
  const [editTrendRows, setEditTrendRows] = useState<string[][]>([]);
  const [savingTrendLayout, setSavingTrendLayout] = useState(false);
  const [trendLayoutMsg, setTrendLayoutMsg] = useState("");

  // WBS Lookup Maps
  const wbsIdToCodeMap = useMemo(() => new Map(costRows.map((r) => [r.id || "", r.wbs_code])), [costRows]);
  const wbsCodeToDescMap = useMemo(() => {
    const map = new Map<string, string>();
    wbsMaster.forEach((w) => {
      map.set(w.wbs_code, w.wbs_description || "");
    });
    costRows.forEach((r) => {
      if (!map.has(r.wbs_code)) {
        map.set(r.wbs_code, r.wbs_description || "");
      }
    });
    return map;
  }, [wbsMaster, costRows]);

  // Current Project Info
  const currentProject = useMemo(() => projects.find((p) => p.id === currentProjectId), [projects, currentProjectId]);
  const currentProjectCode = currentProject?.project_code || "";

  // Distinct WBS Options (strictly from WBS Master where available)
  const uniqueWbsOptions = useMemo(() => {
    if (wbsMaster.length > 0) {
      return wbsMaster
        .filter((w) => w.is_active !== false && (w.include_in_cost || w.is_revenue_generating))
        .map((w) => ({
          value: w.wbs_code,
          label: w.wbs_description ? `${w.wbs_code} - ${w.wbs_description}` : w.wbs_code,
        }))
        .sort((a, b) => a.value.localeCompare(b.value));
    }
    return Array.from(new Set(costRows.map((r) => r.wbs_code)))
      .filter(Boolean)
      .map((code) => ({
        value: code,
        label: wbsCodeToDescMap.get(code) ? `${code} - ${wbsCodeToDescMap.get(code)}` : code,
      }))
      .sort((a, b) => a.value.localeCompare(b.value));
  }, [wbsMaster, costRows, wbsCodeToDescMap]);

  // Base Trend Dataset
  const baseTrendData = useMemo(() => {
    return buildTrendData({
      projectId: currentProjectId,
      costRows,
      gr55Rows,
      historicalRevenueRows,
      updates,
      wbsMaster,
      costElementControl,
      filterWbsCodes: selectedWbs.length > 0 ? selectedWbs : undefined,
      periodType,
    });
  }, [currentProjectId, costRows, gr55Rows, historicalRevenueRows, updates, wbsMaster, costElementControl, selectedWbs, periodType]);

  // Distinct periods generated in the base trend data
  const distinctPeriods = useMemo(() => {
    return baseTrendData.map((pt) => pt.period);
  }, [baseTrendData]);

  // Filter Trend Data by selected start and end period
  const trendData = useMemo(() => {
    let result = baseTrendData;
    if (startPeriod) {
      result = result.filter((pt) => pt.period >= startPeriod);
    }
    if (endPeriod) {
      result = result.filter((pt) => pt.period <= endPeriod);
    }
    return result;
  }, [baseTrendData, startPeriod, endPeriod]);

  // Presentation charts open at the current calendar year (or the latest data if it is older).
  useEffect(() => {
    const latestYear = trendData.length ? trendData[trendData.length - 1]!.period.slice(0, 4) : "";
    const currentYearIndex = trendData.findIndex((point) => point.period.startsWith(latestYear));
    const frame = requestAnimationFrame(() => {
      trendChartScrollRefs.current.filter((node) => node.isConnected).forEach((node) => {
        node.scrollLeft = currentYearIndex >= 0 ? Math.max(0, currentYearIndex * 108 - 56) : node.scrollWidth;
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [trendData]);
  // The one period the engine values with POC instead of posted actuals. Taken from the
  // UNFILTERED series: narrowing the start/end range hides this column but does not move it.
  const enginePocPeriod = useMemo(
    () => (baseTrendData.length ? baseTrendData[baseTrendData.length - 1]!.period : null),
    [baseTrendData],
  );

  // All WBS present in the matrix — the searchable WBS filter's option list. Independent of the
  // current selection so the list stays stable while filtering.
  const matrixWbsOptions = useMemo(() => {
    const normToCode = new Map<string, string>();
    costRows.forEach((row) => {
      const norm = normalizeCode(row.wbs_code);
      if (!normToCode.has(norm)) normToCode.set(norm, row.wbs_code);
    });
    const keys = new Set<string>();
    trendData.forEach((pt) => pt.wbsRevenue.forEach((_value, norm) => keys.add(norm)));
    return Array.from(keys)
      .map((norm) => {
        const code = normToCode.get(norm) ?? norm;
        return { norm, code, desc: wbsCodeToDescMap.get(code) ?? "" };
      })
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [trendData, costRows, wbsCodeToDescMap]);

  const matrixCostWbsOptions = useMemo(() => {
    const normToCode = new Map<string, string>();
    costRows.forEach((row) => {
      const norm = normalizeCode(row.wbs_code);
      if (!normToCode.has(norm)) normToCode.set(norm, row.wbs_code);
    });
    const keys = new Set<string>();
    trendData.forEach((pt) => {
      const map = pt.wbsCost || new Map<string, number>();
      map.forEach((_value, norm) => keys.add(norm));
    });
    return Array.from(keys)
      .map((norm) => {
        const code = normToCode.get(norm) ?? norm;
        return { norm, code, desc: wbsCodeToDescMap.get(code) ?? "" };
      })
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [trendData, costRows, wbsCodeToDescMap]);

  // Cost decomposed by WBS (rows) x period (columns).
  const wbsCostMatrix = useMemo(() => {
    const visiblePoints = trendData;
    const periods = visiblePoints.map((pt) => pt.period);

    const normToCode = new Map<string, string>();
    costRows.forEach((row) => {
      const norm = normalizeCode(row.wbs_code);
      if (!normToCode.has(norm)) normToCode.set(norm, row.wbs_code);
    });

    const wbsFilter = new Set(selectedMatrixWbs);
    const rowKeys = new Set<string>();
    visiblePoints.forEach((pt) => {
      const map = pt.wbsCost || new Map<string, number>();
      map.forEach((_value, norm) => {
        if (wbsFilter.size === 0 || wbsFilter.has(norm)) rowKeys.add(norm);
      });
    });

    let rows = Array.from(rowKeys).map((norm) => {
      const code = normToCode.get(norm) ?? norm;
      const cells = visiblePoints.map((pt) => {
        const map = pt.wbsCost || new Map<string, number>();
        return map.get(norm) ?? 0;
      });
      return {
        norm,
        code,
        desc: wbsCodeToDescMap.get(code) ?? "",
        cells,
        total: cells.reduce((sum, value) => sum + value, 0),
        isUnmapped: !normToCode.has(norm),
      };
    });

    // Apply column filters
    const activeColumnFilters = periods
      .map((period, index) => ({ index, filter: columnFilters[period] }))
      .filter((entry): entry is { index: number; filter: ColumnValueFilter } => isColumnFilterActive(entry.filter));
    if (activeColumnFilters.length) {
      rows = rows.filter((row) =>
        activeColumnFilters.every(({ index, filter }) => cellPassesColumnFilter(row.cells[index]!, filter)),
      );
    }

    if (hideZeroMatrixRows) rows = rows.filter((row) => row.cells.some((value) => value !== 0));

    rows.sort((a, b) => (matrixSort === "total" ? b.total - a.total : a.code.localeCompare(b.code)));

    const columnTotals = periods.map((_p, index) => rows.reduce((sum, row) => sum + row.cells[index]!, 0));

    return {
      periods,
      rows,
      columnTotals,
      grandTotal: columnTotals.reduce((sum, value) => sum + value, 0),
      hasRowFilter: activeColumnFilters.length > 0 || selectedMatrixWbs.length > 0,
    };
  }, [trendData, costRows, wbsCodeToDescMap, matrixSort, hideZeroMatrixRows, selectedMatrixWbs, columnFilters]);

  // Revenue decomposed by WBS (rows) x period (columns). Reads the breakdown the engine
  // already computed, so every column total equals that period's revenue by construction.
  const wbsRevenueMatrix = useMemo(() => {
    const visiblePoints = trendData;
    const periods = visiblePoints.map((pt) => pt.period);

    const normToCode = new Map<string, string>();
    costRows.forEach((row) => {
      const norm = normalizeCode(row.wbs_code);
      if (!normToCode.has(norm)) normToCode.set(norm, row.wbs_code);
    });

    const wbsFilter = new Set(selectedMatrixWbs);
    const rowKeys = new Set<string>();
    visiblePoints.forEach((pt) =>
      pt.wbsRevenue.forEach((_value, norm) => {
        if (wbsFilter.size === 0 || wbsFilter.has(norm)) rowKeys.add(norm);
      }),
    );

    let rows = Array.from(rowKeys).map((norm) => {
      const code = normToCode.get(norm) ?? norm;
      const cells = visiblePoints.map((pt) => pt.wbsRevenue.get(norm) ?? 0);
      return {
        norm,
        code,
        desc: wbsCodeToDescMap.get(code) ?? "",
        cells,
        total: cells.reduce((sum, value) => sum + value, 0),
        // Posted revenue on a WBS absent from revenue_wbs. Impossible in current data, but
        // it must stay visible: the engine counts it, so hiding it would lose money.
        isUnmapped: !normToCode.has(norm),
      };
    });

    // Excel-style per-column value filters: a row must pass EVERY active column's condition.
    const activeColumnFilters = periods
      .map((period, index) => ({ index, filter: columnFilters[period] }))
      .filter((entry): entry is { index: number; filter: ColumnValueFilter } => isColumnFilterActive(entry.filter));
    if (activeColumnFilters.length) {
      rows = rows.filter((row) =>
        activeColumnFilters.every(({ index, filter }) => cellPassesColumnFilter(row.cells[index]!, filter)),
      );
    }

    // Only drops rows that are zero in EVERY visible column, so column totals never move.
    if (hideZeroMatrixRows) rows = rows.filter((row) => row.cells.some((value) => value !== 0));

    rows.sort((a, b) => (matrixSort === "total" ? b.total - a.total : a.code.localeCompare(b.code)));

    const columnTotals = periods.map((_p, index) => rows.reduce((sum, row) => sum + row.cells[index]!, 0));

    return {
      periods,
      rows,
      columnTotals,
      grandTotal: columnTotals.reduce((sum, value) => sum + value, 0),
      // Any active row filter (column-value or WBS) makes the totals subtotals, not the card figure.
      hasRowFilter: activeColumnFilters.length > 0 || selectedMatrixWbs.length > 0,
    };
  }, [trendData, costRows, wbsCodeToDescMap, matrixSort, hideZeroMatrixRows, selectedMatrixWbs, columnFilters]);

  // Cost Element Category time series breakdown and Pareto Analysis
  const categoryTrendData = useMemo(() => {
    const getPeriodKey = {
      month: (date: string) => date.slice(0, 7),
      quarter: (date: string) => {
        const clean = date.slice(0, 10);
        const y = clean.slice(0, 4);
        const m = parseInt(clean.slice(5, 7), 10);
        return `${y}-Q${Math.ceil(m / 3)}`;
      },
      year: (date: string) => date.slice(0, 4),
    }[periodType];

    const matchesWbsFilter = (code: string) => {
      if (selectedWbs.length === 0) return true;
      const cleanCode = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      return selectedWbs.some(f => cleanCode.startsWith(f.replace(/[^A-Za-z0-9]/g, "").toUpperCase()));
    };

    const hasWbsMaster = wbsMaster.length > 0;
    const wbsMasterMap = new Map(wbsMaster.map((w) => [w.wbs_code.replace(/[^A-Za-z0-9]/g, "").toUpperCase(), w]));
    const isCostElementIncluded = (costElement: string) => {
      if (!costElementControl.length) return true;
      const key = costElement.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      const control = costElementControl.find((c) => c.cost_element.replace(/[^A-Za-z0-9]/g, "").toUpperCase() === key);
      return control ? control.include_in_cost !== false : true;
    };

    // Filter GR55 cost rows matching active project WBS Master and WBS filters
    let targetGr55 = gr55Rows.filter((row) => {
      if (!row.posting_date) return false;
      const code = row.wbs_code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      const config = wbsMasterMap.get(code);
      if (hasWbsMaster && !config) return false;
      const includeInCost = config ? config.include_in_cost !== false : true;
      const isActive = config ? config.is_active !== false : true;
      if (isActive === false || includeInCost === false) return false;
      if (!isCostElementIncluded(row.cost_element ?? "")) return false;
      if (selectedPos.length > 0 && !selectedPos.includes(String(row.purchasing_document || "").trim())) return false;
      return matchesWbsFilter(row.wbs_code);
    });

    // Apply specific view mode filters based on cost_category matching rules
    if (costViewMode === "subcontractor") {
      targetGr55 = targetGr55.filter((row) => {
        const btx = String(row.raw_data_json?.business_transaction || "").toUpperCase();
        if (btx === "COIE") return false;
        const cat = String(row.cost_category || "").toLowerCase();
        return cat.includes("subcontract");
      });
    } else if (costViewMode === "material") {
      targetGr55 = targetGr55.filter((row) => {
        const btx = String(row.raw_data_json?.business_transaction || "").toUpperCase();
        if (btx === "COIE") return true;
        const cat = String(row.cost_category || "").toLowerCase();
        return cat.includes("material") || cat.includes("consumable") || cat.includes("transportation") || cat.includes("transp");
      });
    } else if (costViewMode === "manpower") {
      targetGr55 = targetGr55.filter((row) => {
        const btx = String(row.raw_data_json?.business_transaction || "").toUpperCase();
        if (btx === "COIE") return false;
        const cat = String(row.cost_category || "").toLowerCase();
        return cat.includes("labour") || cat.includes("labor") || cat.includes("manpower") || cat.includes("time cost") || cat.includes("hour");
      });
    }

    // Determine the grouping key:
    // - "all" mode: always group by cost_category
    // - specific mode + no WBS filter: group by cost_category (high-level overview)
    // - specific mode + WBS filter active: group by wbs_code (drill-down by WBS)
    const isWbsGrouped = costViewMode !== "all" && selectedWbs.length > 0;
    const getGroupKey = (row: Gr55CostRow) => {
      if (isWbsGrouped) return row.wbs_code;
      return String(row.cost_category || "Unassigned").trim() || "Unassigned";
    };

    // 1. Identify all unique keys present in this filtered dataset
    const keysSet = new Set<string>();
    targetGr55.forEach((row) => {
      keysSet.add(getGroupKey(row));
    });
    const uniqueKeys = Array.from(keysSet).sort();

    // 2. Map periods in the active filtered timeline to breakdowns
    const periods = trendData.map((pt) => pt.period);
    const periodMap = new Map<string, Record<string, number>>();

    periods.forEach((p) => {
      const emptyBreakdown: Record<string, number> = {};
      uniqueKeys.forEach((key) => {
        emptyBreakdown[key] = 0;
      });
      periodMap.set(p, emptyBreakdown);
    });

    targetGr55.forEach((row) => {
      const p = getPeriodKey(row.posting_date);
      if (periodMap.has(p)) {
        const key = getGroupKey(row);
        const breakdown = periodMap.get(p)!;
        breakdown[key] = (breakdown[key] || 0) + Number(row.amount || 0);
      }
    });

    // 3. Compute PM pending cost per period, mapped to cost view mode
    // Exclude SAP-posted components — once posted they appear in GR55 and must not be double-counted.
    const PM_PENDING_SUFFIX = " (PM Pending)";
    const pmPendingMap = new Map<string, number>(); // period → total pending for this view

    // Derive WBS codes visible in the current GR55 filter (respects PO + WBS filters).
    // PM updates don't carry a PO number, so we restrict them to WBS codes that have
    // GR55 postings matching the active filters.
    const allowedWbsCodes = selectedPos.length > 0 || selectedWbs.length > 0
      ? new Set(targetGr55.map((r) => r.wbs_code.replace(/[^A-Za-z0-9]/g, "").toUpperCase()))
      : null; // null = no restriction

    // Build wbs_id → wbs_code map from costRows so we can match updates to WBS codes
    const wbsIdToCode = new Map(costRows.map((r) => [r.id ?? "", r.wbs_code]));

    // Unposted pending per cost type (exclude the SAP-posted portion)
    const getPmAmount = (up: DailyUpdate): number => {
      let total = 0;
      if (costViewMode === "all" || costViewMode === "subcontractor") {
        if (!up.subcontract_sap_posted) total += up.pending_subcontractor_cost ?? 0;
      }
      if (costViewMode === "all" || costViewMode === "manpower") {
        if (!up.manpower_sap_posted) total += up.pending_manpower_cost ?? 0;
      }
      if (costViewMode === "all" || costViewMode === "material") {
        if (!up.material_sap_posted) total += up.pending_material_cost ?? 0;
      }
      if (costViewMode === "all") {
        // equipment has no individual posting flag — include if general sap_posted is not set
        if (!up.sap_posted) total += up.pending_equipment_cost ?? 0;
      }
      return total;
    };

    const pmLabel = costViewMode === "all" ? `PM Pending${PM_PENDING_SUFFIX}` :
      costViewMode === "subcontractor" ? `Subcontractor${PM_PENDING_SUFFIX}` :
      costViewMode === "manpower" ? `Manpower${PM_PENDING_SUFFIX}` :
      `Material${PM_PENDING_SUFFIX}`;

    // For each period take the LATEST update per WBS (pending is a state snapshot, not incremental).
    const latestPerWbsPerPeriod = new Map<string, Map<string, DailyUpdate>>();
    updates.forEach((up) => {
      if (!up.update_date || isWbsGrouped) return;
      // Apply PO/WBS restriction derived from GR55 filtered set
      if (allowedWbsCodes) {
        const upWbs = wbsIdToCode.get(up.revenue_wbs_id ?? "");
        if (!upWbs) return;
        if (!allowedWbsCodes.has(upWbs.replace(/[^A-Za-z0-9]/g, "").toUpperCase())) return;
      }
      const p = getPeriodKey(up.update_date);
      if (!periods.includes(p)) return;
      if (!latestPerWbsPerPeriod.has(p)) latestPerWbsPerPeriod.set(p, new Map());
      const wbsMap = latestPerWbsPerPeriod.get(p)!;
      const key = up.revenue_wbs_id || up.update_date;
      const existing = wbsMap.get(key);
      if (!existing || up.update_date > existing.update_date) wbsMap.set(key, up);
    });

    let hasPmData = false;
    latestPerWbsPerPeriod.forEach((wbsMap, p) => {
      let periodTotal = 0;
      wbsMap.forEach((up) => { periodTotal += getPmAmount(up); });
      if (periodTotal > 0) {
        pmPendingMap.set(p, periodTotal);
        hasPmData = true;
      }
    });

    // 4. Create the final time-series chart dataset (SAP actuals + PM pending column)
    const chartData = periods.map((p) => {
      const breakdown = periodMap.get(p)!;
      const row: Record<string, unknown> = { period: p, ...breakdown };
      if (hasPmData) row[pmLabel] = pmPendingMap.get(p) ?? 0;
      return row;
    });

    // 5. Compute lifetime totals (SAP only — PM pending shown separately in ranking)
    const totalsMap = new Map<string, number>();
    uniqueKeys.forEach((key) => totalsMap.set(key, 0));

    targetGr55.forEach((row) => {
      const p = getPeriodKey(row.posting_date);
      if (periods.includes(p)) {
        const key = getGroupKey(row);
        totalsMap.set(key, (totalsMap.get(key) || 0) + Number(row.amount || 0));
      }
    });

    // Add PM pending as its own ranking entry
    if (hasPmData) {
      const totalPm = Array.from(pmPendingMap.values()).reduce((s, v) => s + v, 0);
      totalsMap.set(pmLabel, totalPm);
    }

    const categoryTotals = Array.from(totalsMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const sapOnlyTotals = categoryTotals.filter((t) => !t.name.endsWith(PM_PENDING_SUFFIX));
    const totalActualCostSum = sapOnlyTotals.reduce((sum, item) => sum + item.value, 0);

    const highestCostConsumer = sapOnlyTotals.length > 0 ? sapOnlyTotals[0] : null;
    const highestCostPercentage =
      highestCostConsumer && totalActualCostSum > 0
        ? (highestCostConsumer.value / totalActualCostSum) * 100
        : 0;

    const allChartKeys = hasPmData ? [...uniqueKeys, pmLabel] : uniqueKeys;

    return {
      uniqueCategories: allChartKeys,
      pmLabel: hasPmData ? pmLabel : null,
      chartData,
      categoryTotals,
      highestCostConsumer,
      highestCostPercentage,
      isWbsGrouped,
    };
  }, [gr55Rows, updates, costRows, selectedWbs, wbsMaster, costElementControl, periodType, trendData, costViewMode, selectedPos]);

  const poSpending = useMemo(() => {
    type PoSpend = { po: string; vendorId: string; vendorName: string; provision: number; actual: number; remaining: number; utilization: number; status: string; wbs: Set<string>; activities: Map<string, number> };
    const byPo = new Map<string, PoSpend>();
    poCommitments
      .filter((row) => String(row.deletion_indicator ?? '').trim().toUpperCase() !== 'L')
      .filter((row) => selectedPos.length === 0 || selectedPos.includes(row.po_number))
      .forEach((row) => {
        const po = String(row.po_number ?? '').trim();
        if (!po) return;
        const existing = byPo.get(po) ?? {
          po,
          vendorId: String(row.vendor_id ?? '').trim(),
          vendorName: String(row.vendor_name ?? '').trim() || 'Vendor not mapped',
          provision: 0,
          actual: 0,
          remaining: 0,
          utilization: 0,
          status: '',
          wbs: new Set<string>(),
          activities: new Map<string, number>(),
        };
        const provision = Number(row.net_order_value ?? 0);
        const activity = String(row.material_group ?? '').trim() || String(row.activity ?? '').trim() || String(row.short_text ?? '').trim() || 'Unclassified';
        existing.provision += provision;
        if (String(row.deletion_indicator ?? '').trim().toUpperCase() === 'S') existing.status = 'Locked';
        if (row.wbs_code) existing.wbs.add(row.wbs_code);
        existing.activities.set(activity, (existing.activities.get(activity) ?? 0) + provision);
        byPo.set(po, existing);
      });

    gr55Rows.forEach((row) => {
      const po = String(row.purchasing_document ?? '').trim();
      const summary = byPo.get(po);
      if (summary) summary.actual += Number(row.amount ?? 0);
    });

    const poRows = Array.from(byPo.values()).map((row) => ({
      ...row,
      remaining: row.provision - row.actual,
      utilization: row.provision > 0 ? (row.actual / row.provision) * 100 : 0,
    })).sort((a, b) => b.provision - a.provision);

    const vendors = new Map<string, { name: string; provision: number; actual: number; pos: Set<string> }>();
    const activities = new Map<string, { provision: number; actual: number }>();
    poRows.forEach((row) => {
      const vendorKey = row.vendorId || row.vendorName || 'unmapped';
      const vendor = vendors.get(vendorKey) ?? { name: row.vendorName, provision: 0, actual: 0, pos: new Set<string>() };
      vendor.provision += row.provision;
      vendor.actual += row.actual;
      vendor.pos.add(row.po);
      vendors.set(vendorKey, vendor);
      const activityProvision = Array.from(row.activities.values()).reduce((sum, value) => sum + value, 0);
      row.activities.forEach((provision, activity) => {
        const item = activities.get(activity) ?? { provision: 0, actual: 0 };
        item.provision += provision;
        item.actual += activityProvision > 0 ? row.actual * (provision / activityProvision) : 0;
        activities.set(activity, item);
      });
    });

    const vendorRows = Array.from(vendors.entries()).map(([id, row]) => ({
      id,
      name: row.name,
      provision: row.provision,
      actual: row.actual,
      remaining: row.provision - row.actual,
      utilization: row.provision > 0 ? (row.actual / row.provision) * 100 : 0,
      poCount: row.pos.size,
    })).sort((a, b) => b.actual - a.actual);
    const activityRows = Array.from(activities.entries()).map(([name, row]) => ({
      name,
      provision: row.provision,
      actual: row.actual,
      remaining: row.provision - row.actual,
      utilization: row.provision > 0 ? (row.actual / row.provision) * 100 : 0,
    })).sort((a, b) => b.provision - a.provision);
    const provision = poRows.reduce((sum, row) => sum + row.provision, 0);
    const actual = poRows.reduce((sum, row) => sum + row.actual, 0);
    return { poRows, vendorRows, activityRows, provision, actual, remaining: provision - actual, utilization: provision > 0 ? (actual / provision) * 100 : 0 };
  }, [poCommitments, gr55Rows, selectedPos]);
  const visiblePoRows = useMemo(
    () => selectedVendorId ? poSpending.poRows.filter((row) => (row.vendorId || row.vendorName || 'unmapped') === selectedVendorId) : poSpending.poRows,
    [poSpending.poRows, selectedVendorId],
  );
  const sortedVendorRows = useMemo(() => [...poSpending.vendorRows].sort((a, b) => {
    const comparison = spendingSort === "name" ? a.name.localeCompare(b.name) : Number((a as any)[spendingSort] ?? 0) - Number((b as any)[spendingSort] ?? 0);
    return spendingSortDirection === "asc" ? comparison : -comparison;
  }), [poSpending.vendorRows, spendingSort, spendingSortDirection]);
  const sortedVisiblePoRows = useMemo(() => [...visiblePoRows].sort((a, b) => {
    const comparison = spendingSort === "name" ? a.po.localeCompare(b.po) : Number((a as any)[spendingSort] ?? 0) - Number((b as any)[spendingSort] ?? 0);
    return spendingSortDirection === "asc" ? comparison : -comparison;
  }), [visiblePoRows, spendingSort, spendingSortDirection]);
  // Subcontractor Performance by PO Number
  const poPerformanceData = useMemo(() => {
    if (costViewMode !== "subcontractor") return null;

    const getPeriodKey = {
      month: (date: string) => date.slice(0, 7),
      quarter: (date: string) => {
        const clean = date.slice(0, 10);
        const y = clean.slice(0, 4);
        const m = parseInt(clean.slice(5, 7), 10);
        return `${y}-Q${Math.ceil(m / 3)}`;
      },
      year: (date: string) => date.slice(0, 4),
    }[periodType];

    const matchesWbsFilter = (code: string) => {
      if (selectedWbs.length === 0) return true;
      const cleanCode = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      return selectedWbs.some((f) => cleanCode.startsWith(f.replace(/[^A-Za-z0-9]/g, "").toUpperCase()));
    };

    const hasWbsMaster = wbsMaster.length > 0;
    const wbsMasterMap = new Map(wbsMaster.map((w) => [w.wbs_code.replace(/[^A-Za-z0-9]/g, "").toUpperCase(), w]));
    const isCostElementIncluded = (costElement: string) => {
      if (!costElementControl.length) return true;
      const key = costElement.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      const ctrl = costElementControl.find((c) => c.cost_element.replace(/[^A-Za-z0-9]/g, "").toUpperCase() === key);
      return ctrl ? ctrl.include_in_cost !== false : true;
    };

    // Filter to active subcontractor rows only
    const subRows = gr55Rows.filter((row) => {
      if (!row.posting_date) return false;
      const code = row.wbs_code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      const config = wbsMasterMap.get(code);
      if (hasWbsMaster && !config) return false;
      const includeInCost = config ? config.include_in_cost !== false : true;
      const isActive = config ? config.is_active !== false : true;
      if (!isActive || !includeInCost) return false;
      if (!isCostElementIncluded(row.cost_element ?? "")) return false;
      if (!matchesWbsFilter(row.wbs_code)) return false;
      if (selectedPos.length > 0 && !selectedPos.includes(String(row.purchasing_document || "").trim())) return false;
      const cat = String(row.cost_category || "").toLowerCase();
      return cat.includes("subcontract");
    });

    // Resolve PO label — blank/null becomes "No PO"
    const getPoLabel = (row: Gr55CostRow) => {
      const pd = String(row.purchasing_document || "").trim();
      return pd || "No PO";
    };

    // Collect unique PO labels
    const poSet = new Set<string>();
    subRows.forEach((r) => poSet.add(getPoLabel(r)));
    const uniquePOs = Array.from(poSet).sort();

    // Build period map
    const periods = trendData.map((pt) => pt.period);
    const periodMap = new Map<string, Record<string, number>>();
    periods.forEach((p) => {
      const rec: Record<string, number> = {};
      uniquePOs.forEach((po) => (rec[po] = 0));
      periodMap.set(p, rec);
    });
    subRows.forEach((row) => {
      const p = getPeriodKey(row.posting_date);
      if (periodMap.has(p)) {
        const po = getPoLabel(row);
        periodMap.get(p)![po] = (periodMap.get(p)![po] || 0) + Number(row.amount || 0);
      }
    });
    const chartData = periods.map((p) => ({ period: p, ...periodMap.get(p)! }));

    // Lifetime totals per PO
    const totalsMap = new Map<string, number>();
    uniquePOs.forEach((po) => totalsMap.set(po, 0));
    subRows.forEach((row) => {
      const p = getPeriodKey(row.posting_date);
      if (periods.includes(p)) {
        const po = getPoLabel(row);
        totalsMap.set(po, (totalsMap.get(po) || 0) + Number(row.amount || 0));
      }
    });
    const poTotals = Array.from(totalsMap.entries())
      .map(([po, value]) => ({ po, value }))
      .sort((a, b) => b.value - a.value);
    const grandTotal = poTotals.reduce((s, x) => s + x.value, 0);

    // Per-PO metadata (WBS scope + date range)
    const poMeta = new Map<string, { wbsCodes: Set<string>; minDate: string; maxDate: string }>();
    subRows.forEach((row) => {
      const po = getPoLabel(row);
      const existing = poMeta.get(po) || { wbsCodes: new Set(), minDate: row.posting_date, maxDate: row.posting_date };
      existing.wbsCodes.add(row.wbs_code);
      if (row.posting_date < existing.minDate) existing.minDate = row.posting_date;
      if (row.posting_date > existing.maxDate) existing.maxDate = row.posting_date;
      poMeta.set(po, existing);
    });

    return { uniquePOs, chartData, poTotals, grandTotal, poMeta };
  }, [gr55Rows, selectedWbs, wbsMaster, costElementControl, periodType, trendData, costViewMode, selectedPos]);




  // Filter costRows by selectedWbs codes and selectedPos to match WBS details table exactly
  const filteredWbsRows = useMemo(() => {
    const normalizeCodeLocal = (code: string) => code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    return costRows.filter((row) => {
      // WBS filter
      if (selectedWbs && selectedWbs.length > 0) {
        const normCode = normalizeCodeLocal(row.wbs_code);
        const match = selectedWbs.some((sel) => normCode.startsWith(normalizeCodeLocal(sel)));
        if (!match) return false;
      }

      // PO filter
      if (selectedPos && selectedPos.length > 0) {
        const hasMatchingPo = gr55Rows.some(
          (gr55) =>
            normalizeCodeLocal(gr55.wbs_code) === normalizeCodeLocal(row.wbs_code) &&
            gr55.purchasing_document &&
            selectedPos.includes(gr55.purchasing_document),
        );
        if (!hasMatchingPo) return false;
      }

      return true;
    });
  }, [costRows, selectedWbs, selectedPos, gr55Rows]);

  // KPI Calculations in the active range from the single source (revenue_wbs rows)
  const kpis = useMemo(() => {
    const plannedCost = filteredWbsRows.reduce((sum, r) => sum + (r.planned_cost ?? 0), 0);
    const totalActualCost = filteredWbsRows.reduce((sum, r) => sum + (r.actual_cost_to_date ?? 0), 0);
    const plannedRevenue = filteredWbsRows.reduce((sum, r) => sum + (r.planned_revenue ?? 0), 0);
    const totalRecognizedRevenue = filteredWbsRows.reduce((sum, r) => sum + (r.recognized_revenue_to_date ?? 0), 0);
    const pocPercent = plannedRevenue > 0 ? Math.min(100, (totalRecognizedRevenue / plannedRevenue) * 100) : 0;

    let costGrowth = 0;
    let revenueGrowth = 0;
    let inMonthCost = 0;
    let inMonthRevenue = 0;
    let activePeriodLabel = "";

    if (trendData.length > 0) {
      const latestPoint = trendData[trendData.length - 1]!;
      costGrowth = latestPoint.costGrowthPercent;
      revenueGrowth = latestPoint.revenueGrowthPercent;

      // In the Month calculations (latest point or selected period)
      let activePoint = latestPoint;
      if (selectedPeriod) {
        const found = trendData.find((pt) => pt.period === selectedPeriod);
        if (found) activePoint = found;
      }

      inMonthCost = activePoint.forecastCost;
      inMonthRevenue = activePoint.forecastRevenue;
      activePeriodLabel = activePoint.period;
    } else {
      // Fallback in-month to MTD values from the single source
      inMonthCost = filteredWbsRows.reduce((sum, r) => sum + (r.mtd_actual_cost ?? 0), 0);
      inMonthRevenue = filteredWbsRows.reduce((sum, r) => sum + (r.mtd_revenue_recognition ?? 0), 0);
      activePeriodLabel = "Latest";
    }

    return {
      totalActualCost,
      totalRecognizedRevenue,
      forecastCost: totalActualCost,
      forecastRevenue: totalRecognizedRevenue,
      grossMargin: totalRecognizedRevenue - totalActualCost,
      marginPercent: totalRecognizedRevenue > 0 ? ((totalRecognizedRevenue - totalActualCost) / totalRecognizedRevenue) * 100 : 0,
      costGrowth,
      revenueGrowth,
      inMonthCost,
      inMonthRevenue,
      activePeriodLabel,
      plannedCost,
      plannedRevenue,
      pocPercent,
    };
  }, [filteredWbsRows, trendData, selectedPeriod]);

  const rawDrilldownData = useMemo(() => {
    if (!selectedPeriod && selectedPos.length === 0 && !drilldownWbs) return { sap: [], pm: [], wbs: [], category: [] };

    const cleanPeriod = selectedPeriod;

    const getPeriodKey = {
      month: (date: string) => date.slice(0, 7),
      quarter: (date: string) => {
        const clean = date.slice(0, 10);
        const y = clean.slice(0, 4);
        const m = parseInt(clean.slice(5, 7), 10);
        return `${y}-Q${Math.ceil(m / 3)}`;
      },
      year: (date: string) => date.slice(0, 4),
    }[periodType];

    const matchesWbsFilter = (code: string) => {
      if (selectedWbs.length === 0) return true;
      const cleanCode = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      return selectedWbs.some(f => cleanCode.startsWith(f.replace(/[^A-Za-z0-9]/g, "").toUpperCase()));
    };

    const hasWbsMaster = wbsMaster.length > 0;
    const wbsMasterMap = new Map(wbsMaster.map((w) => [w.wbs_code.replace(/[^A-Za-z0-9]/g, "").toUpperCase(), w]));
    const isCostElementIncluded = (costElement: string) => {
      if (!costElementControl.length) return true;
      const key = costElement.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      const control = costElementControl.find((c) => c.cost_element.replace(/[^A-Za-z0-9]/g, "").toUpperCase() === key);
      return control ? control.include_in_cost !== false : true;
    };

    // Filter GR55
    let sapList = gr55Rows.filter((row) => {
      if (!row.posting_date) return false;
      if (!matchesWbsFilter(row.wbs_code)) return false;

      const code = row.wbs_code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      // Clicking a WBS in the matrix drills into exactly that WBS's actual cost.
      if (drilldownWbs && code !== drilldownWbs) return false;
      const config = wbsMasterMap.get(code);
      if (hasWbsMaster && !config) return false;
      const includeInCost = config ? config.include_in_cost !== false : true;
      const isActive = config ? config.is_active !== false : true;
      if (isActive === false || includeInCost === false) return false;
      if (!isCostElementIncluded(row.cost_element ?? "")) return false;
      if (selectedPos.length > 0 && !selectedPos.includes(String(row.purchasing_document || "").trim())) return false;
      if (cleanPeriod) {
        if (getPeriodKey(row.posting_date) !== cleanPeriod) return false;
      } else {
        if (startPeriod && getPeriodKey(row.posting_date) < startPeriod) return false;
        if (endPeriod && getPeriodKey(row.posting_date) > endPeriod) return false;
      }
      return true;
    });

    // Apply specific view mode filters based on cost_category matching rules
    if (costViewMode === "subcontractor") {
      sapList = sapList.filter((row) => {
        const btx = String(row.raw_data_json?.business_transaction || "").toUpperCase();
        if (btx === "COIE") return false;
        const cat = String(row.cost_category || "").toLowerCase();
        return cat.includes("subcontract");
      });
    } else if (costViewMode === "material") {
      sapList = sapList.filter((row) => {
        const btx = String(row.raw_data_json?.business_transaction || "").toUpperCase();
        if (btx === "COIE") return true;
        const cat = String(row.cost_category || "").toLowerCase();
        return cat.includes("material") || cat.includes("consumable") || cat.includes("transportation") || cat.includes("transp");
      });
    } else if (costViewMode === "manpower") {
      sapList = sapList.filter((row) => {
        const btx = String(row.raw_data_json?.business_transaction || "").toUpperCase();
        if (btx === "COIE") return false;
        const cat = String(row.cost_category || "").toLowerCase();
        return cat.includes("labour") || cat.includes("labor") || cat.includes("manpower") || cat.includes("time cost") || cat.includes("hour");
      });
    }

    // Filter PM updates
    const pmList = updates.filter((up) => {
      if (!up.update_date) return false;
      const code = wbsIdToCodeMap.get(up.revenue_wbs_id) || up.revenue_wbs_id;
      if (!matchesWbsFilter(code)) return false;
      if (drilldownWbs && code.replace(/[^A-Za-z0-9]/g, "").toUpperCase() !== drilldownWbs) return false;
      if (cleanPeriod) {
        return getPeriodKey(up.update_date) === cleanPeriod;
      } else {
        if (startPeriod && getPeriodKey(up.update_date) < startPeriod) return false;
        if (endPeriod && getPeriodKey(up.update_date) > endPeriod) return false;
      }
      return true;
    });

    // Group by WBS for this period
    const wbsGroup = new Map<string, { wbsCode: string; wbsDesc: string; actual: number; revenue: number }>();
    sapList.forEach((row) => {
      const code = row.wbs_code;
      const existing = wbsGroup.get(code) || {
        wbsCode: code,
        wbsDesc: row.wbs_description || wbsCodeToDescMap.get(code) || "",
        actual: 0,
        revenue: 0,
      };
      existing.actual += Number(row.amount || 0);
      wbsGroup.set(code, existing);
    });

    // Forecast Revenue contributions per WBS
    costRows.forEach((row) => {
      const code = row.wbs_code;
      const wbsActualInPeriod = sapList.filter((r) => r.wbs_code === code).reduce((sum, r) => sum + Number(r.amount || 0), 0);
      if (wbsActualInPeriod > 0) {
        const existing = wbsGroup.get(code) || {
          wbsCode: code,
          wbsDesc: row.wbs_description || "",
          actual: 0,
          revenue: 0,
        };
        const poc = row.planned_cost > 0 ? Math.min(100, (wbsActualInPeriod / row.planned_cost) * 100) : 0;
        existing.revenue += (poc / 100) * row.planned_revenue;
        wbsGroup.set(code, existing);
      }
    });

    // Group by Cost Category
    const catGroup = new Map<string, { category: string; amount: number }>();
    sapList.forEach((row) => {
      const cat = row.cost_category || "Unassigned";
      const existing = catGroup.get(cat) || { category: cat, amount: 0 };
      existing.amount += Number(row.amount || 0);
      catGroup.set(cat, existing);
    });

    return {
      sap: sapList,
      pm: pmList,
      wbs: Array.from(wbsGroup.values()),
      category: Array.from(catGroup.values()),
    };
  }, [
    selectedPeriod,
    drilldownWbs,
    gr55Rows,
    updates,
    costRows,
    selectedWbs,
    periodType,
    startPeriod,
    endPeriod,
    wbsIdToCodeMap,
    wbsCodeToDescMap,
    wbsMaster,
    costElementControl,
    costViewMode,
    selectedPos,
  ]);

  // Display info for a WBS-scoped drill-down: original code, description, and total actual cost.
  const drilldownWbsInfo = useMemo(() => {
    if (!drilldownWbs) return null;
    const match = costRows.find((r) => normalizeCode(r.wbs_code) === drilldownWbs);
    const total = rawDrilldownData.sap.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
    return { code: match?.wbs_code ?? drilldownWbs, desc: match?.wbs_description ?? "", total };
  }, [drilldownWbs, costRows, rawDrilldownData]);

  // Filtered Drill-down Data by Search input
  const filteredDrilldown = useMemo(() => {
    const search = drilldownSearch.toLowerCase().trim();
    const data = rawDrilldownData[drilldownTab];

    if (!search) return data;

    if (drilldownTab === "sap") {
      return (data as Gr55CostRow[]).filter((row) => {
        return (
          row.wbs_code.toLowerCase().includes(search) ||
          (row.wbs_description || "").toLowerCase().includes(search) ||
          (row.cost_element || "").toLowerCase().includes(search) ||
          (row.cost_category || "").toLowerCase().includes(search)
        );
      });
    } else if (drilldownTab === "pm") {
      return (data as DailyUpdate[]).filter((up) => {
        const code = wbsIdToCodeMap.get(up.revenue_wbs_id) || up.revenue_wbs_id;
        return (
          code.toLowerCase().includes(search) ||
          (up.remarks || "").toLowerCase().includes(search)
        );
      });
    } else if (drilldownTab === "wbs") {
      return (data as any[]).filter((item) => {
        return item.wbsCode.toLowerCase().includes(search) || item.wbsDesc.toLowerCase().includes(search);
      });
    } else {
      return (data as any[]).filter((item) => {
        return item.category.toLowerCase().includes(search);
      });
    }
  }, [rawDrilldownData, drilldownTab, drilldownSearch, wbsIdToCodeMap]);

  // Paginated Drill-down
  const paginatedDrilldown = useMemo(() => {
    const startIdx = (drilldownPage - 1) * itemsPerPage;
    return filteredDrilldown.slice(startIdx, startIdx + itemsPerPage);
  }, [filteredDrilldown, drilldownPage]);

  const maxDrilldownPage = Math.ceil(filteredDrilldown.length / itemsPerPage) || 1;

  // Chart Click Handlers
  const handleChartClick = (state: any) => {
    if (state && state.activeLabel) {
      setSelectedPeriod(state.activeLabel);
      setDrilldownWbs(null); // period drill-down and WBS drill-down are mutually exclusive
      setDrilldownPage(1);
    }
  };

  // Export workbook in Excel format using SheetJS (xlsx)
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    const summaryRows = trendData.map((pt) => ({
      Period: pt.period,
      "Actual Cost (Period)": pt.actualCost,
      "Actual Cost (Cumulative)": pt.cumulativeActualCost,
      "Recognized Revenue (Period)": pt.recognizedRevenue,
      "Recognized Revenue (Cumulative)": pt.cumulativeRecognizedRevenue,
      "Forecast Cost (Period)": pt.forecastCost,
      "Forecast Cost (Cumulative)": pt.cumulativeForecastCost,
      "Forecast Revenue (Period)": pt.forecastRevenue,
      "Forecast Revenue (Cumulative)": pt.cumulativeForecastRevenue,
      "Planned Cost (Baseline)": pt.plannedCost,
      "Planned Revenue (Baseline)": pt.plannedRevenue,
      "Cost growth vs prev period %": pt.costGrowthPercent,
      "Revenue growth vs prev period %": pt.revenueGrowthPercent,
    }));

    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Trend Summary");

    if (wbsRevenueMatrix.rows.length > 0) {
      // aoa_to_sheet, not json_to_sheet: the period columns are dynamic, and building objects
      // with computed keys would make column order depend on key insertion order.
      const header = [
        "WBS Code",
        "WBS Description",
        ...wbsRevenueMatrix.periods.map((period) =>
          period === enginePocPeriod ? `${period} (POC accrual)` : period,
        ),
        "Total",
      ];
      const body = wbsRevenueMatrix.rows.map((row) => [
        row.code,
        row.desc,
        ...row.cells,
        row.total,
      ]);
      const totalRow = [
        "TOTAL",
        `${wbsRevenueMatrix.rows.length} WBS items`,
        ...wbsRevenueMatrix.columnTotals,
        wbsRevenueMatrix.grandTotal,
      ];

      const wsMatrix = XLSX.utils.aoa_to_sheet([header, ...body, totalRow]);
      XLSX.utils.book_append_sheet(wb, wsMatrix, "Revenue by WBS & Period");
    }

    if (selectedPeriod || drilldownWbs) {
      const sapRows = rawDrilldownData.sap.map((row) => ({
        "Posting Date": row.posting_date,
        "WBS Code": row.wbs_code,
        "WBS Description": row.wbs_description || "",
        "Cost Element": row.cost_element || "",
        "Cost Category": row.cost_category || "",
        Amount: Number(row.amount),
        Currency: row.currency || "",
      }));
      const wsSap = XLSX.utils.json_to_sheet(sapRows);
      XLSX.utils.book_append_sheet(wb, wsSap, "SAP GR55 Postings");

      const pmRows = rawDrilldownData.pm.map((up) => ({
        "Update Date": up.update_date,
        "WBS Code": wbsIdToCodeMap.get(up.revenue_wbs_id) || up.revenue_wbs_id,
        "Pending materials cost": up.pending_material_cost,
        "Pending subcontracts cost": up.pending_subcontractor_cost,
        "Pending manpower cost": up.pending_manpower_cost,
        "Total pending simulated cost": getEffectivePendingCost(up),
        Remarks: up.remarks || "",
      }));
      const wsPm = XLSX.utils.json_to_sheet(pmRows);
      XLSX.utils.book_append_sheet(wb, wsPm, "PM Simulated Updates");
    }

    XLSX.writeFile(
      wb,
      `Project_Trend_Analysis_${currentProjectCode}_${periodType}_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  };

  const exportPoSummaryExcel = () => {
    if (!poPerformanceData?.poTotals.length) return;
    const rows = poPerformanceData.poTotals.map((entry) => {
      const meta = poPerformanceData.poMeta.get(entry.po);
      const percentage = poPerformanceData.grandTotal > 0 ? entry.value / poPerformanceData.grandTotal : 0;
      return {
        'PO Number': entry.po,
        'WBS Scope': meta ? Array.from(meta.wbsCodes).join(', ') : '',
        'First Posting': meta?.minDate ?? '',
        'Last Posting': meta?.maxDate ?? '',
        'Total Amount (SAR)': entry.value,
        '% of Subcontractor Spend': percentage,
      };
    });
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [{ wch: 18 }, { wch: 58 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 24 }];
    for (let row = 2; row <= rows.length + 1; row += 1) {
      worksheet[`E${row}`].z = '#,##0.00';
      worksheet[`F${row}`].z = '0.0%';
    }
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'PO Summary');
    XLSX.writeFile(workbook, `PO_Summary_${currentProjectCode}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  const handlePrintPDF = () => {
    window.print();
  };

  const formatYAxis = (value: number) => {
    return formatCompactNumber(value);
  };

  const formatTooltipValue = (value: number, name: string): any => {
    if (value === 0) return null;
    const cleanName = name.toLowerCase();
    if (cleanName.includes("%") || cleanName.includes("growth")) {
      return [formatPercent(value), name];
    }
    return [formatCurrency(value), name];
  };

  const hasProjectedOverrun = useMemo(() => {
    if (!trendData.length) return false;
    const latest = trendData[trendData.length - 1]!;
    return latest.cumulativeForecastCost > latest.plannedCost;
  }, [trendData]);

  const overrunAmount = useMemo(() => {
    if (!trendData.length) return 0;
    const latest = trendData[trendData.length - 1]!;
    return Math.max(0, latest.cumulativeForecastCost - latest.plannedCost);
  }, [trendData]);

  // Display scope text
  const wbsScopeText = useMemo(() => {
    if (selectedWbs.length === 0) return "All Project WBS";
    if (selectedWbs.length === 1) return selectedWbs[0]!;
    return `${selectedWbs.length} selected WBS elements`;
  }, [selectedWbs]);

  // ---- Trend drag-and-drop grid helpers ----

  const isTrendVisible = (id: string): boolean => {
    if (isWidgetHidden(dashboardLayout, id)) return false;
    // Keep PO & Vendor Spending visible so missing-source guidance is actionable.
    return true;
  };

  const isHeavyTrend = (id: string) => id.startsWith("trends.section.") || id.startsWith("trends.chart.");

  const renderTrendWidget = (id: string): React.ReactNode => {
    switch (id) {
      case "trends.kpis":
        return (
          <div className="h-full grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            {/* Planned Revenue */}
            <div className="surface-card p-4 flex flex-col relative overflow-hidden border border-line/80 bg-panel/95 rounded-3xl shadow-card print-card">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-success/35 to-transparent" />
              <div className="flex items-center justify-between text-muted">
                <span className="section-kicker">Planned Revenue</span>
                <span className="text-[9px] font-bold text-success bg-success/10 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Revenue</span>
              </div>
              <div className="grow" />
              <div className="data-value text-[1.22rem] font-semibold text-text">{formatCurrency(kpis.plannedRevenue)}</div>
              <div className="mt-2 text-xs text-muted/70"><span>Project contract value</span></div>
            </div>
            {/* Actual Revenue */}
            <div className="surface-card p-4 flex flex-col relative overflow-hidden border border-line/80 bg-panel/95 rounded-3xl shadow-card print-card">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-success/35 to-transparent" />
              <div className="flex items-center justify-between text-muted">
                <span className="section-kicker">Actual Revenue (GR55+PM)</span>
                <span className="text-[9px] font-bold text-success bg-success/10 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Revenue</span>
              </div>
              <div className="grow" />
              <div className="data-value text-[1.22rem] font-semibold text-text">{formatCurrency(kpis.totalRecognizedRevenue)}</div>
              <div className="mt-2 text-xs flex items-center gap-1.5">
                <span className={`font-bold ${kpis.revenueGrowth >= 0 ? "text-success" : "text-danger"}`}>{kpis.revenueGrowth > 0 ? "+" : ""}{kpis.revenueGrowth.toFixed(1)}%</span>
                <span className="text-muted/70">growth vs prev period</span>
              </div>
            </div>
            {/* In Month Revenue */}
            <div className="surface-card p-4 flex flex-col relative overflow-hidden border border-line/80 bg-panel/95 rounded-3xl shadow-card print-card">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-success/35 to-transparent" />
              <div className="flex items-center justify-between text-muted">
                <span className="section-kicker">In Month Rev ({kpis.activePeriodLabel})</span>
                <span className="text-[9px] font-bold text-success bg-success/10 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Revenue</span>
              </div>
              <div className="grow" />
              <div className="data-value text-[1.22rem] font-semibold text-text">{formatCurrency(kpis.inMonthRevenue)}</div>
              <div className="mt-2 text-xs text-muted/70"><span>Periodic revenue for {kpis.activePeriodLabel}</span></div>
            </div>
            {/* POC% */}
            <div className="surface-card p-4 flex flex-col relative overflow-hidden border border-line/80 bg-panel/95 rounded-3xl shadow-card print-card">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-success/35 to-transparent" />
              <div className="flex items-center justify-between text-muted">
                <span className="section-kicker">POC %</span>
                <span className="text-[9px] font-bold text-success bg-success/10 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Progress</span>
              </div>
              <div className="grow" />
              <div className="data-value text-[1.22rem] font-semibold text-text">{formatPercent(kpis.pocPercent)}</div>
              <div className="mt-2 text-xs text-muted/70"><span>Percentage of Completion</span></div>
            </div>
          </div>
        );

      case "costTrends.kpis":
        return (
          <div className="h-full grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            {/* Planned Cost */}
            <div className="surface-card p-4 flex flex-col relative overflow-hidden border border-line/80 bg-panel/95 rounded-3xl shadow-card print-card">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-accent/35 to-transparent" />
              <div className="flex items-center justify-between text-muted">
                <span className="section-kicker">Planned Cost</span>
                <span className="text-[9px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Cost</span>
              </div>
              <div className="grow" />
              <div className="data-value text-[1.22rem] font-semibold text-text">{formatCurrency(kpis.plannedCost)}</div>
              <div className="mt-2 text-xs text-muted/70"><span>Project baseline budget</span></div>
            </div>
            {/* Actual Cost */}
            <div className="surface-card p-4 flex flex-col relative overflow-hidden border border-line/80 bg-panel/95 rounded-3xl shadow-card print-card">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-accent/35 to-transparent" />
              <div className="flex items-center justify-between text-muted">
                <span className="section-kicker">Actual Cost (GR55+PM)</span>
                <span className="text-[9px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Cost</span>
              </div>
              <div className="grow" />
              <div className="data-value text-[1.22rem] font-semibold text-text">{formatCurrency(kpis.totalActualCost)}</div>
              <div className="mt-2 text-xs flex items-center gap-1.5">
                <span className={`font-bold ${kpis.costGrowth <= 0 ? "text-success" : "text-danger"}`}>{kpis.costGrowth > 0 ? "+" : ""}{kpis.costGrowth.toFixed(1)}%</span>
                <span className="text-muted/70">growth vs prev period</span>
              </div>
            </div>
            {/* In the Month Actual Cost */}
            <div className="surface-card p-4 flex flex-col relative overflow-hidden border border-line/80 bg-panel/95 rounded-3xl shadow-card print-card">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-accent/35 to-transparent" />
              <div className="flex items-center justify-between text-muted">
                <span className="section-kicker">In Month Cost ({kpis.activePeriodLabel})</span>
                <span className="text-[9px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Cost</span>
              </div>
              <div className="grow" />
              <div className="data-value text-[1.22rem] font-semibold text-text">{formatCurrency(kpis.inMonthCost)}</div>
              <div className="mt-2 text-xs text-muted/70"><span>Periodic cost for {kpis.activePeriodLabel}</span></div>
            </div>
            <div className="surface-card p-4 flex flex-col relative overflow-hidden border border-line/80 bg-panel/95 rounded-3xl shadow-card print-card">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-violet-400/45 to-transparent" />
              <div className="flex items-center justify-between text-muted"><span className="section-kicker">PO Count</span><span className="text-[9px] font-bold text-violet-600 bg-violet-500/10 px-1.5 py-0.5 rounded-full uppercase tracking-wider">PO</span></div>
              <div className="grow" /><div className="data-value text-[1.22rem] font-semibold text-text">{poSpending.poRows.length}</div><div className="mt-2 text-xs text-muted/70"><span>Active POs for this project</span></div>
            </div>
            <div className="surface-card p-4 flex flex-col relative overflow-hidden border border-line/80 bg-panel/95 rounded-3xl shadow-card print-card">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-violet-400/45 to-transparent" />
              <div className="flex items-center justify-between text-muted"><span className="section-kicker">Subcontractor Count</span><span className="text-[9px] font-bold text-violet-600 bg-violet-500/10 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Vendor</span></div>
              <div className="grow" /><div className="data-value text-[1.22rem] font-semibold text-text">{poSpending.vendorRows.length}</div><div className="mt-2 text-xs text-muted/70"><span>Unique vendors across active POs</span></div>
            </div>
            <div className="surface-card p-4 flex flex-col relative overflow-hidden border border-line/80 bg-panel/95 rounded-3xl shadow-card print-card">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-emerald-400/45 to-transparent" />
              <div className="flex items-center justify-between text-muted"><span className="section-kicker">Remaining PO Balance</span><span className="text-[9px] font-bold text-success bg-success/10 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Commitment</span></div>
              <div className="grow" /><div className="data-value text-[1.22rem] font-semibold text-text">{formatCurrency(poSpending.remaining)}</div><div className="mt-2 text-xs text-muted/70"><span>Issued provision less GR55 actual</span></div>
            </div>          </div>
        );

      case "costTrends.chart.costTrendCumulative":
        return (
          <div className="h-full surface-card p-5 border border-line/45 bg-panel/30 shadow-card rounded-3xl print-card">
            <div className="flex items-center justify-between border-b border-line/30 pb-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-text">Project Cost Trend (Cumulative)</h3>
                <p className="text-[11px] text-muted">SAP actual GR55 transaction history over time (Cumulative).</p>
              </div>
              <div className="text-right">
                <div className="text-[9px] font-bold uppercase tracking-wider text-muted">Management Cost to Date</div>
                <div className="font-mono text-sm font-bold text-warning">{formatCurrency(kpis.totalActualCost)}</div>
              </div>
            </div>
            <div ref={registerTrendChartScroller} className="h-80 overflow-x-auto pb-2 scrollbar-thin">
              <div className="h-full" style={{ width: Math.max(760, trendData.length * 108) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} onClick={handleChartClick} margin={{ top: 22, right: 72, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgb(var(--color-line) / 0.3)" />
                  <XAxis dataKey="period" stroke="rgb(var(--color-muted) / 0.8)" fontSize={10} tickLine={false} />
                  <YAxis stroke="rgb(var(--color-muted) / 0.8)" fontSize={10} tickLine={false} tickFormatter={formatYAxis} />
                  <Tooltip content={<CustomChartTooltip formatter={formatTooltipValue} />} />
                  <Area type="monotone" dataKey="cumulativeForecastCost" stroke="#f59e0b" strokeWidth={2.5} fillOpacity={1} fill="url(#costGrad)" name="Cumulative Cost" dot={{ r: 2, fill: "#f59e0b", strokeWidth: 0 }}>
                    <LabelList dataKey="cumulativeForecastCost" position="top" formatter={(value: number) => `SAR ${formatCompactNumber(Number(value))}`} fill="#9a5b00" fontSize={9} fontWeight={700} />
                  </Area>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        );

      case "costTrends.chart.costTrendPeriod":
        return (
          <div className="h-full surface-card p-5 border border-line/45 bg-panel/30 shadow-card rounded-3xl print-card">
            <div className="flex items-center justify-between border-b border-line/30 pb-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-text">Project Cost Trend (Period)</h3>
                <p className="text-[11px] text-muted">SAP actual GR55 transaction history over time (Periodic).</p>
              </div>
              <div className="text-right">
                <div className="text-[9px] font-bold uppercase tracking-wider text-muted">Current Period Cost</div>
                <div className="font-mono text-sm font-bold text-warning">{formatCurrency(kpis.inMonthCost)}</div>
              </div>
            </div>
            <div ref={registerTrendChartScroller} className="h-80 overflow-x-auto pb-2 scrollbar-thin">
              <div className="h-full" style={{ width: Math.max(760, trendData.length * 108) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} onClick={handleChartClick} margin={{ top: 22, right: 72, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="costPeriodGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgb(var(--color-line) / 0.3)" />
                  <XAxis dataKey="period" stroke="rgb(var(--color-muted) / 0.8)" fontSize={10} tickLine={false} />
                  <YAxis stroke="rgb(var(--color-muted) / 0.8)" fontSize={10} tickLine={false} tickFormatter={formatYAxis} />
                  <Tooltip content={<CustomChartTooltip formatter={formatTooltipValue} />} />
                  <Area type="monotone" dataKey="forecastCost" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#costPeriodGrad)" name="Period Cost" dot={{ r: 2, fill: "#f59e0b", strokeWidth: 0 }}>
                    <LabelList dataKey="forecastCost" position="top" formatter={(value: number) => `SAR ${formatCompactNumber(Number(value))}`} fill="#9a5b00" fontSize={9} fontWeight={700} />
                  </Area>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        );

      case "trends.chart.revenueTrend":
        return (
          <div className="h-full surface-card p-5 border border-line/45 bg-panel/30 shadow-card rounded-3xl print-card">
            <div className="flex items-center justify-between border-b border-line/30 pb-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-text">Project Revenue Trend</h3>
                <p className="text-[11px] text-muted">POC recognized revenue curve over periods.</p>
              </div>
              <div className="no-print flex rounded-lg border border-line bg-panel2 p-0.5">
                <button onClick={() => setRevenueChartMode("cumulative")} className={`px-2.5 py-1 text-[9px] font-bold uppercase rounded-md transition ${revenueChartMode === "cumulative" ? "bg-accent text-white" : "text-muted hover:text-text"}`}>Cumulative</button>
                <button onClick={() => setRevenueChartMode("period")} className={`px-2.5 py-1 text-[9px] font-bold uppercase rounded-md transition ${revenueChartMode === "period" ? "bg-accent text-white" : "text-muted hover:text-text"}`}>Period</button>
              </div>
            </div>
            <div ref={registerTrendChartScroller} className="h-80 overflow-x-auto pb-2 scrollbar-thin">
              <div className="h-full" style={{ width: Math.max(760, trendData.length * 108) }}>
                <ResponsiveContainer width="100%" height="100%">
                {revenueChartMode === "cumulative" ? (
                  <AreaChart data={trendData} onClick={handleChartClick} margin={{ top: 22, right: 72, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgb(var(--color-line) / 0.3)" />
                    <XAxis dataKey="period" stroke="rgb(var(--color-muted) / 0.8)" fontSize={10} tickLine={false} />
                    <YAxis stroke="rgb(var(--color-muted) / 0.8)" fontSize={10} tickLine={false} tickFormatter={formatYAxis} />
                    <Tooltip content={<CustomChartTooltip formatter={formatTooltipValue} />} />
                    <Area type="monotone" dataKey="cumulativeForecastRevenue" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#revGrad)" name="Cumulative Revenue" dot={{ r: 2, fill: "#10b981", strokeWidth: 0 }}><LabelList dataKey="cumulativeForecastRevenue" position="top" formatter={(value: number) => `SAR ${formatCompactNumber(Number(value))}`} fill="#087f5b" fontSize={9} fontWeight={700} /></Area>
                  </AreaChart>
                ) : (
                  <AreaChart data={trendData} onClick={handleChartClick} margin={{ top: 22, right: 72, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revPeriodGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.12} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgb(var(--color-line) / 0.3)" />
                    <XAxis dataKey="period" stroke="rgb(var(--color-muted) / 0.8)" fontSize={10} tickLine={false} />
                    <YAxis stroke="rgb(var(--color-muted) / 0.8)" fontSize={10} tickLine={false} tickFormatter={formatYAxis} />
                    <Tooltip content={<CustomChartTooltip formatter={formatTooltipValue} />} />
                    <Area type="monotone" dataKey="forecastRevenue" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#revPeriodGrad)" name="Period Revenue" dot={{ r: 2, fill: "#10b981", strokeWidth: 0 }}><LabelList dataKey="forecastRevenue" position="top" formatter={(value: number) => `SAR ${formatCompactNumber(Number(value))}`} fill="#087f5b" fontSize={9} fontWeight={700} /></Area>
                  </AreaChart>
                )}
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        );

      case "trends.chart.costVsRevenueGrowth":
        return (
          <div className="h-full surface-card p-5 border border-line/45 bg-panel/30 shadow-card rounded-3xl print-card">
            <div className="border-b border-line/30 pb-3 mb-4">
              <h3 className="text-sm font-bold text-text">Cost vs Revenue Growth</h3>
              <p className="text-[11px] text-muted">Contrast SAP actual cost against recognized and forecast revenues.</p>
            </div>
            <div ref={registerTrendChartScroller} className="h-80 overflow-x-auto pb-2 scrollbar-thin">
              <div className="h-full" style={{ width: Math.max(760, trendData.length * 108) }}>
                <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} onClick={handleChartClick} margin={{ top: 22, right: 72, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgb(var(--color-line) / 0.3)" />
                  <XAxis dataKey="period" stroke="rgb(var(--color-muted) / 0.8)" fontSize={10} tickLine={false} />
                  <YAxis stroke="rgb(var(--color-muted) / 0.8)" fontSize={10} tickLine={false} tickFormatter={formatYAxis} />
                  <Tooltip content={<CustomChartTooltip formatter={formatTooltipValue} />} />
                  <Legend verticalAlign="top" height={32} iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey="cumulativeActualCost" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2, fill: "#f59e0b", strokeWidth: 0 }} name="Actual Cost (SAP)"><LabelList dataKey="cumulativeActualCost" position="bottom" formatter={(value: number) => `SAR ${formatCompactNumber(Number(value))}`} fill="#9a5b00" fontSize={8} /></Line>
                  <Line type="monotone" dataKey="cumulativeRecognizedRevenue" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2, fill: "#3b82f6", strokeWidth: 0 }} name="Recognized Revenue"><LabelList dataKey="cumulativeRecognizedRevenue" position="top" formatter={(value: number) => `SAR ${formatCompactNumber(Number(value))}`} fill="#1d4ed8" fontSize={8} /></Line>
                  <Line type="monotone" dataKey="cumulativeForecastRevenue" stroke="#10b981" strokeWidth={2} dot={{ r: 2, fill: "#10b981", strokeWidth: 0 }} name="Forecast Revenue"><LabelList dataKey="cumulativeForecastRevenue" position="insideTop" formatter={(value: number) => `SAR ${formatCompactNumber(Number(value))}`} fill="#087f5b" fontSize={8} /></Line>
                </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        );

      case "trends.chart.forecastTrend":
        return (
          <div className="h-full surface-card p-5 border border-line/45 bg-panel/30 shadow-card rounded-3xl print-card">
            <div className="flex items-center justify-between gap-4 border-b border-line/30 pb-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-text">Cost vs Budget Trend</h3>
                <p className="text-[11px] text-muted">Actual cost against the project baseline budget (Planned Cost).</p>
              </div>
              <div className="flex shrink-0 gap-4 text-right">
                <div><div className="text-[9px] font-bold uppercase tracking-wider text-muted">Actual</div><div className="font-mono text-xs font-bold text-accent">{formatCurrency(kpis.totalActualCost)}</div></div>

                <div><div className="text-[9px] font-bold uppercase tracking-wider text-muted">Budget</div><div className="font-mono text-xs font-bold text-text">{formatCurrency(kpis.plannedCost)}</div></div>
              </div>
            </div>
            <div ref={registerTrendChartScroller} className="h-80 overflow-x-auto pb-2 scrollbar-thin">
              <div className="h-full" style={{ width: Math.max(760, trendData.length * 108) }}>
                <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} onClick={handleChartClick} margin={{ top: 22, right: 72, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgb(var(--color-line) / 0.3)" />
                  <XAxis dataKey="period" stroke="rgb(var(--color-muted) / 0.8)" fontSize={10} tickLine={false} />
                  <YAxis stroke="rgb(var(--color-muted) / 0.8)" fontSize={10} tickLine={false} tickFormatter={formatYAxis} />
                  <Tooltip content={<CustomChartTooltip formatter={formatTooltipValue} />} />
                  <Legend verticalAlign="top" height={32} iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey="cumulativeActualCost" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2, fill: "#3b82f6", strokeWidth: 0 }} name="Actual Cost"><LabelList dataKey="cumulativeActualCost" position="bottom" formatter={(value: number) => `SAR ${formatCompactNumber(Number(value))}`} fill="#1d4ed8" fontSize={8} /></Line>

                  <Line type="monotone" dataKey="plannedCost" stroke="#6b7280" strokeDasharray="5 5" strokeWidth={2} dot={{ r: 2, fill: "#6b7280", strokeWidth: 0 }} name="Planned Cost (Budget)"><LabelList dataKey="plannedCost" position="insideTop" formatter={(value: number) => `SAR ${formatCompactNumber(Number(value))}`} fill="#4b5563" fontSize={8} /></Line>
                </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        );

      case "trends.section.costElementAnalysis":
      case "costTrends.section.costElementAnalysis":
        return (
          <div className="h-full surface-card p-6 border border-line/45 bg-panel/30 shadow-card rounded-3xl print-card relative z-20">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-line/30 pb-4 mb-6">
              <div>
                <h3 className="text-base font-bold text-text">Cost Element Analysis</h3>
                <p className="text-xs text-muted">
                  {costViewMode === "all"
                    ? "Actual cost breakdown by GR55 cost category over time and ranked consumption."
                    : categoryTrendData.isWbsGrouped
                    ? `Actual cost breakdown by WBS Element for ${
                        costViewMode === "subcontractor" ? "Subcontractors" : costViewMode === "material" ? "Materials + Consumables" : "Manpower"
                      } over time. Select WBS codes above to drill into individual elements.`
                    : `Actual ${
                        costViewMode === "subcontractor" ? "Subcontractor" : costViewMode === "material" ? "Materials + Consumables" : "Manpower"
                      } cost by category over time. Select specific WBS codes above to see per-WBS breakdown.`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 no-print">
                <div className="flex rounded-lg border border-line bg-panel2 p-0.5">
                  {([
                    { value: "all", label: "All Categories" },
                    { value: "subcontractor", label: "Subcontractors" },
                    { value: "material", label: "Materials + Consumables" },
                    { value: "manpower", label: "Manpower" },
                  ] as const).map((mode) => (
                    <button key={mode.value} type="button" onClick={() => setCostViewMode(mode.value)}
                      className={`px-3 py-1 text-[10px] font-bold uppercase rounded-md transition ${costViewMode === mode.value ? "bg-accent text-white" : "text-muted hover:text-text"}`}>
                      {mode.label}
                    </button>
                  ))}
                </div>
                {categoryTrendData.highestCostConsumer && (
                  <div className="rounded-xl border border-warning/30 bg-warning/5 px-3 py-1.5 text-xs font-semibold text-warning flex items-center gap-2">
                    <Info className="h-4.5 w-4.5 text-warning shrink-0" />
                    <span>
                      <strong>{categoryTrendData.isWbsGrouped ? (wbsCodeToDescMap.get(categoryTrendData.highestCostConsumer.name) || categoryTrendData.highestCostConsumer.name) : categoryTrendData.highestCostConsumer.name}</strong>{" "}
                      consumes the most (<strong>{categoryTrendData.highestCostPercentage.toFixed(1)}%</strong> of actuals).
                    </span>
                  </div>
                )}
              </div>
            </div>
            {(costViewMode !== "subcontractor" || selectedPos.length === 1) && (
              <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2 space-y-3">
                  <div>
                    <h4 className="text-xs font-bold text-text">{categoryTrendData.isWbsGrouped ? "WBS Element Breakdown Over Time" : "Cost Category Breakdown Over Time"}</h4>
                    <p className="text-[10px] text-muted">{categoryTrendData.isWbsGrouped ? "Stacked period actual cost contribution by WBS Element." : costViewMode === "all" ? "Stacked period actual cost contribution by category." : "Stacked period actual cost contribution by category — select WBS above to drill down by WBS."}</p>
                  </div>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={categoryTrendData.chartData} onClick={handleChartClick}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgb(var(--color-line) / 0.3)" />
                        <XAxis dataKey="period" stroke="rgb(var(--color-muted) / 0.8)" fontSize={10} tickLine={false} />
                        <YAxis stroke="rgb(var(--color-muted) / 0.8)" fontSize={10} tickLine={false} tickFormatter={formatYAxis} />
                        <Tooltip content={<CustomChartTooltip formatter={formatTooltipValue} />} />
                        <Legend verticalAlign="top" height={36} iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 9 }} />
                        {categoryTrendData.uniqueCategories.map((category, index) => {
                          const isPm = category === categoryTrendData.pmLabel;
                          const colorIndex = isPm ? 0 : index;
                          const color = CATEGORY_COLORS[colorIndex % CATEGORY_COLORS.length]!;
                          return (
                            <Bar key={category} dataKey={category} stackId="a"
                              fill={isPm ? `${color}55` : color}
                              stroke={isPm ? color : undefined}
                              strokeWidth={isPm ? 1 : 0}
                              strokeDasharray={isPm ? "4 2" : undefined}
                              name={categoryTrendData.isWbsGrouped ? (wbsCodeToDescMap.get(category) || category) : category} />
                          );
                        })}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <h4 className="text-xs font-bold text-text">{categoryTrendData.isWbsGrouped ? "WBS Element Consumption Ranking" : "Cost Category Consumption Ranking"}</h4>
                    <p className="text-[10px] text-muted">{categoryTrendData.isWbsGrouped ? "Total actual cost ranked by WBS Element." : "Total actual cost ranked by category."}</p>
                  </div>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={categoryTrendData.categoryTotals} layout="vertical" margin={{ left: 20, right: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgb(var(--color-line) / 0.3)" />
                        <XAxis type="number" stroke="rgb(var(--color-muted) / 0.8)" fontSize={10} tickLine={false} tickFormatter={formatYAxis} />
                        <YAxis dataKey="name" type="category" stroke="rgb(var(--color-muted) / 0.8)" fontSize={10} tickLine={false} width={110}
                          tickFormatter={(tick) => { if (!categoryTrendData.isWbsGrouped) return tick; const desc = wbsCodeToDescMap.get(tick); if (!desc) return tick; return desc.length > 18 ? `${desc.slice(0, 18)}...` : desc; }} />
                        <Tooltip content={<CustomChartTooltip formatter={formatTooltipValue} labelFormatter={(label: any) => { if (!categoryTrendData.isWbsGrouped) return label; const desc = wbsCodeToDescMap.get(String(label)); return desc ? `${label} - ${desc}` : label; }} />} />
                        <Bar dataKey="value" name="Total Cost" radius={[0, 4, 4, 0]}>
                          {categoryTrendData.categoryTotals.map((entry, index) => {
                            const isPm = entry.name === categoryTrendData.pmLabel;
                            const colorIdx = categoryTrendData.uniqueCategories.indexOf(entry.name);
                            const color = CATEGORY_COLORS[(colorIdx !== -1 ? colorIdx : index) % CATEGORY_COLORS.length]!;
                            return <Cell key={`cell-${index}`} fill={isPm ? `${color}77` : color} />;
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case "trends.section.subcontractorPo":
      case "costTrends.section.subcontractorPo":
        if (!poSpending.poRows.length) return (
          <div className="h-full rounded-3xl border border-dashed border-line bg-panel/30 p-10 text-center text-sm text-muted">Upload an ME2J report with WBS Element to show PO and Vendor Spending.</div>
        );
        return (
          <div className="h-full surface-card p-6 border border-line/45 bg-panel/30 shadow-card rounded-3xl print-card">
            <div className="flex flex-col gap-4 border-b border-line/30 pb-4 lg:flex-row lg:items-center lg:justify-between">
              <div><h3 className="text-base font-bold text-text flex items-center gap-2"><Briefcase className="h-4 w-4 text-accent" />PO &amp; Vendor Spending</h3><p className="mt-0.5 text-xs text-muted">ME2J provides issued provision. GR55 provides posted actual cost, matched by PO number.</p></div>
              {poOptions.length > 1 ? <div className="w-[260px] shrink-0"><MultiWbsSelect selectedValues={selectedPos} onChange={(values) => { setSelectedPos(values); setSelectedPeriod(null); }} options={poOptions.filter(Boolean).map((po) => ({ value: po, label: po }))} placeholder="All POs" /></div> : null}
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {[['PO Issued Provision', poSpending.provision], ['GR55 Actual Cost', poSpending.actual], ['Remaining PO Balance', poSpending.remaining], ['PO Utilization', poSpending.utilization, true], ['Active POs', poSpending.poRows.length, 'count']].map(([label, value, type]) => <div key={String(label)} className="rounded-xl border border-line/50 bg-panel p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</div><div className="mt-2 font-mono text-base font-bold text-text">{type === true ? `${Number(value).toFixed(2)}%` : type === 'count' ? String(value) : formatCurrency(Number(value))}</div></div>)}
            </div>
            <div className="mt-7">
              <div className="rounded-2xl border border-line/45 bg-panel/55 p-4"><div className="mb-3"><h4 className="text-sm font-bold text-text">Vendor PO Utilization</h4><p className="text-[11px] text-muted">Each full bar is issued provision: GR55 actual cost versus remaining PO balance.</p></div><div className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={[...poSpending.vendorRows].sort((a, b) => b.provision - a.provision).slice(0, 12)} layout="vertical" margin={{ left: 10, right: 20 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgb(var(--color-line) / 0.3)" /><XAxis type="number" tickFormatter={formatYAxis} fontSize={10} /><YAxis dataKey="name" type="category" width={145} fontSize={10} tickFormatter={(value: string) => value.length > 25 ? `${value.slice(0, 25)}...` : value} /><Tooltip content={<CustomChartTooltip formatter={(value: number, name: string) => [formatCurrency(value), name]} />} /><Legend verticalAlign="top" height={28} iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10 }} /><Bar dataKey="actual" stackId="provision" name="GR55 Actual Cost" fill="#10b981" radius={[4, 0, 0, 4]} /><Bar dataKey="remaining" stackId="provision" name="Remaining PO Balance" fill="rgb(var(--color-line) / 0.65)" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div></div>

            </div>
            <div className="mt-7 rounded-2xl border border-line/45 bg-panel/55 p-4">
              <div className="flex flex-col gap-3 border-b border-line/35 pb-3 sm:flex-row sm:items-center sm:justify-between">
                <div><h4 className="text-sm font-bold text-text">Spending Analysis</h4><p className="text-[11px] text-muted">Compare PO issued provision with GR55 actual cost and remaining balance.</p></div>
                <div className="flex items-center gap-2"><div className="flex rounded-lg border border-line bg-panel2 p-1"><button type="button" onClick={() => setSpendingTableTab("vendor")} className={`rounded-md px-3 py-1.5 text-[11px] font-bold transition ${spendingTableTab === "vendor" ? "bg-accent text-white" : "text-muted hover:text-text"}`}>By Vendor</button><button type="button" onClick={() => setSpendingTableTab("po")} className={`rounded-md px-3 py-1.5 text-[11px] font-bold transition ${spendingTableTab === "po" ? "bg-accent text-white" : "text-muted hover:text-text"}`}>By PO</button></div><button type="button" title="Download visible spending analysis as Excel" onClick={() => { const data = spendingTableTab === "vendor" ? poSpending.vendorRows.map((row) => ({ 'Vendor ID': row.id, 'Vendor Name': row.name, 'PO Count': row.poCount, 'Issued Provision (SAR)': row.provision, 'GR55 Actual Cost (SAR)': row.actual, 'Remaining Balance (SAR)': row.remaining, 'Utilization %': row.utilization / 100 })) : visiblePoRows.map((row) => ({ 'PO Number': row.po, 'Vendor ID': row.vendorId, 'Vendor Name': row.vendorName, 'WBS Scope': Array.from(row.wbs).join(', '), 'PO Status': row.status || 'Active', 'Issued Provision (SAR)': row.provision, 'GR55 Actual Cost (SAR)': row.actual, 'Remaining Balance (SAR)': row.remaining, 'Utilization %': row.utilization / 100 })); const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, spendingTableTab === "vendor" ? "Vendor Spending" : "PO Utilization"); XLSX.writeFile(wb, `${spendingTableTab === "vendor" ? "Vendor_Spending" : "PO_Utilization"}_${currentProjectCode}.xlsx`); }} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted transition hover:border-accent/50 hover:text-accent"><Download className="h-3.5 w-3.5" /></button></div>
              </div>
              {spendingTableTab === "vendor" ? <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-panel2/60 text-[10px] uppercase tracking-wider text-muted"><tr><th className="px-3 py-2.5"><button type="button" onClick={() => toggleSpendingSort("name")} className="font-bold hover:text-accent">Vendor {spendingSort === "name" ? (spendingSortDirection === "asc" ? "↑" : "↓") : "↕"}</button></th><th className="px-3 py-2.5 text-right"><button type="button" onClick={() => toggleSpendingSort("poCount")} className="font-bold hover:text-accent">PO Count {spendingSort === "poCount" ? (spendingSortDirection === "asc" ? "↑" : "↓") : "↕"}</button></th><th className="px-3 py-2.5 text-right"><button type="button" onClick={() => toggleSpendingSort("provision")} className="font-bold hover:text-accent">Issued Provision {spendingSort === "provision" ? (spendingSortDirection === "asc" ? "↑" : "↓") : "↕"}</button></th><th className="px-3 py-2.5 text-right"><button type="button" onClick={() => toggleSpendingSort("actual")} className="font-bold hover:text-accent">GR55 Actual {spendingSort === "actual" ? (spendingSortDirection === "asc" ? "↑" : "↓") : "↕"}</button></th><th className="px-3 py-2.5 text-right"><button type="button" onClick={() => toggleSpendingSort("remaining")} className="font-bold hover:text-accent">Balance {spendingSort === "remaining" ? (spendingSortDirection === "asc" ? "↑" : "↓") : "↕"}</button></th><th className="px-3 py-2.5"><button type="button" onClick={() => toggleSpendingSort("utilization")} className="font-bold hover:text-accent">Utilization {spendingSort === "utilization" ? (spendingSortDirection === "asc" ? "↑" : "↓") : "↕"}</button></th></tr></thead><tbody className="divide-y divide-line/35">{sortedVendorRows.map((row) => <tr key={row.id} onClick={() => { setSelectedVendorId(row.id); setSpendingTableTab("po"); }} className="cursor-pointer transition hover:bg-accent/5"><td className="px-3 py-3"><div className="font-semibold text-text">{row.name}</div><div className="font-mono text-[10px] text-muted">{row.id}</div></td><td className="px-3 py-3 text-right font-mono">{row.poCount}</td><td className="px-3 py-3 text-right font-mono">{formatCurrency(row.provision)}</td><td className="px-3 py-3 text-right font-mono text-success">{formatCurrency(row.actual)}</td><td className="px-3 py-3 text-right font-mono">{formatCurrency(row.remaining)}</td><td className="px-3 py-3"><div className="flex min-w-[145px] items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-line/45"><div className={`h-full rounded-full ${row.utilization > 100 ? "bg-danger" : row.utilization >= 80 ? "bg-warning" : "bg-success"}`} style={{ width: `${Math.min(100, Math.max(0, row.utilization))}%` }} /></div><span className="w-11 text-right font-mono font-bold">{row.utilization.toFixed(1)}%</span></div></td></tr>)}</tbody></table></div> : <div className="mt-4 overflow-x-auto"><div className="mb-3 flex items-center justify-between text-[11px] text-muted">{selectedVendorId ? <span>Showing POs for <strong className="text-text">{poSpending.vendorRows.find((vendor) => vendor.id === selectedVendorId)?.name ?? "selected vendor"}</strong></span> : <span>Showing all project POs</span>}{selectedVendorId ? <button type="button" onClick={() => setSelectedVendorId(null)} className="font-bold text-accent hover:underline">Clear filter</button> : null}</div><table className="w-full text-left text-xs"><thead className="bg-panel2/60 text-[10px] uppercase tracking-wider text-muted"><tr><th className="px-3 py-2.5"><button type="button" onClick={() => toggleSpendingSort("name")} className="font-bold hover:text-accent">PO / Vendor {spendingSort === "name" ? (spendingSortDirection === "asc" ? "↑" : "↓") : "↕"}</button></th><th className="px-3 py-2.5 text-right"><button type="button" onClick={() => toggleSpendingSort("provision")} className="font-bold hover:text-accent">Issued Provision {spendingSort === "provision" ? (spendingSortDirection === "asc" ? "↑" : "↓") : "↕"}</button></th><th className="px-3 py-2.5 text-right"><button type="button" onClick={() => toggleSpendingSort("actual")} className="font-bold hover:text-accent">GR55 Actual {spendingSort === "actual" ? (spendingSortDirection === "asc" ? "↑" : "↓") : "↕"}</button></th><th className="px-3 py-2.5 text-right"><button type="button" onClick={() => toggleSpendingSort("remaining")} className="font-bold hover:text-accent">Balance {spendingSort === "remaining" ? (spendingSortDirection === "asc" ? "↑" : "↓") : "↕"}</button></th><th className="px-3 py-2.5"><button type="button" onClick={() => toggleSpendingSort("utilization")} className="font-bold hover:text-accent">Utilization {spendingSort === "utilization" ? (spendingSortDirection === "asc" ? "↑" : "↓") : "↕"}</button></th></tr></thead><tbody className="divide-y divide-line/35">{sortedVisiblePoRows.map((row) => <tr key={row.po} className="transition hover:bg-panel2/35"><td className="px-3 py-3"><div className="font-mono font-bold text-accent">{row.po}</div><div className="text-[10px] text-muted">{row.vendorName}{row.status ? ` · ${row.status}` : ""}</div></td><td className="px-3 py-3 text-right font-mono">{formatCurrency(row.provision)}</td><td className="px-3 py-3 text-right font-mono text-success">{formatCurrency(row.actual)}</td><td className="px-3 py-3 text-right font-mono">{formatCurrency(row.remaining)}</td><td className="px-3 py-3"><div className="flex min-w-[145px] items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-line/45"><div className={`h-full rounded-full ${row.utilization > 100 ? "bg-danger" : row.utilization >= 80 ? "bg-warning" : "bg-success"}`} style={{ width: `${Math.min(100, Math.max(0, row.utilization))}%` }} /></div><span className="w-11 text-right font-mono font-bold">{row.utilization.toFixed(1)}%</span></div></td></tr>)}</tbody></table></div>}
            </div>          </div>
        );
      case "trends.section.revenueByWbsMatrix":
        return (
          <div className="h-full relative z-0 rounded-3xl border border-line/70 bg-panel/75 p-5 shadow-card print-card">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between border-b border-line/30 pb-4">
              <div>
                <h3 className="text-base font-bold text-text">Revenue by WBS &amp; Period</h3>
                <p className="mt-1 text-xs text-muted/70">{wbsRevenueMatrix.rows.length} WBS element{wbsRevenueMatrix.rows.length === 1 ? "" : "s"} across {wbsRevenueMatrix.periods.length} period{wbsRevenueMatrix.periods.length === 1 ? "" : "s"}. Column totals match the trend charts above.</p>
              </div>
              <div className="no-print flex items-center gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-[11px] font-semibold text-muted">
                  <input type="checkbox" checked={hideZeroMatrixRows} onChange={(event) => setHideZeroMatrixRows(event.target.checked)} className="h-3.5 w-3.5 rounded border-line accent-accent" />
                  Hide empty rows
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-muted">Sort rows by</span>
                  <div className="flex gap-1 rounded-xl border border-line bg-panel2 p-1">
                    {(["code", "total"] as const).map((mode) => (
                      <button key={mode} type="button" title={mode === "code" ? "Order rows by WBS code (ascending)" : "Order rows by total revenue (largest first)"} onClick={() => setMatrixSort(mode)}
                        className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${matrixSort === mode ? "bg-accent text-white shadow-sm" : "text-muted hover:text-text"}`}>
                        {mode === "code" ? "WBS Code" : "Total ▾"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {(selectedMatrixWbs.length > 0 || wbsRevenueMatrix.hasRowFilter) && (
              <div className="no-print mt-4 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-muted">Active filters:</span>
                {selectedMatrixWbs.length > 0 && (
                  <button type="button" onClick={() => setSelectedMatrixWbs([])} className="inline-flex items-center gap-1.5 rounded-lg border border-accent/50 bg-accent/10 px-3 py-1.5 text-[11px] font-bold text-accent transition hover:bg-accent/20">
                    {selectedMatrixWbs.length} WBS selected <X className="h-3 w-3" />
                  </button>
                )}
                {Object.values(columnFilters).some(isColumnFilterActive) && (
                  <button type="button" onClick={() => setColumnFilters({})} className="inline-flex items-center gap-1.5 rounded-lg border border-accent/50 bg-accent/10 px-3 py-1.5 text-[11px] font-bold text-accent transition hover:bg-accent/20">
                    Clear column filters <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-line/40 bg-panel2/40 px-3 py-2.5 text-[11px] leading-relaxed text-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
              {enginePocPeriod && wbsRevenueMatrix.periods.includes(enginePocPeriod) ? (
                <span>Every column shows <strong className="text-text">actual revenue posted</strong> in that period, except <strong className="text-accent">{enginePocPeriod}&deg;</strong>, which is a <strong className="text-text">percentage-of-completion accrual</strong> (planned revenue × cost-based POC, less what that WBS already billed). The two are different measures — a row does not read left-to-right as one series. The <strong className="text-accent">{enginePocPeriod}&deg;</strong> column total is what ties to the In Month Rev card above; the grand total does not.</span>
              ) : (
                <span>Every column shows <strong className="text-text">actual revenue posted</strong> in that period. The percentage-of-completion accrual period{enginePocPeriod ? ` (${enginePocPeriod})` : ""} falls outside the selected range.</span>
              )}
            </div>
            {wbsRevenueMatrix.hasRowFilter && (
              <div className="mt-2 flex items-start gap-2 rounded-xl border border-accent/40 bg-accent/5 px-3 py-2 text-[11px] leading-relaxed text-accent">
                <Filter className="mt-0.5 h-3.5 w-3.5 shrink-0" fill="currentColor" />
                <span>A row filter is active, so some WBS rows are hidden. The totals below are <strong>subtotals of the visible rows</strong> and no longer tie to the In Month Rev card. Clear the active filters to restore the full total.</span>
              </div>
            )}
            {wbsRevenueMatrix.rows.length > 0 && wbsRevenueMatrix.periods.length > 0 ? (
              <div className="mt-4 overflow-x-auto overflow-y-auto max-h-[580px]">
                <table style={{ minWidth: 280 + wbsRevenueMatrix.periods.length * 120 + 150 }} className="w-full text-xs border-separate border-spacing-0">
                  <thead className="text-left text-muted/80">
                    <tr>
                      <th className="sticky top-0 left-0 z-30 w-[280px] min-w-[280px] border-b border-line/45 bg-panel2 px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.12em] shadow-[1px_0_0_0_rgb(var(--color-line))]">
                        <span className="inline-flex items-center">WBS<WbsColumnFilter options={matrixWbsOptions} selected={selectedMatrixWbs} onChange={setSelectedMatrixWbs} /></span>
                      </th>
                      {wbsRevenueMatrix.periods.map((period) => {
                        const isPoc = period === enginePocPeriod;
                        return (
                          <th key={period} title={isPoc ? "Percentage-of-completion accrual — planned revenue × cost-based POC. All other columns are posted actuals." : "Actual revenue posted in this period."}
                            className={`sticky top-0 z-20 bg-panel2 px-4 py-3 text-right text-[10px] font-bold uppercase tracking-[0.12em] whitespace-nowrap ${isPoc ? "border-b-2 border-accent text-accent" : "border-b border-line/45"}`}>
                            <span className="inline-flex items-center justify-end">{period}{isPoc ? "°" : ""}<ColumnFilterButton period={period} value={columnFilters[period] ?? DEFAULT_COLUMN_FILTER} onChange={(next) => setColumnFilters((prev) => ({ ...prev, [period]: next }))} /></span>
                          </th>
                        );
                      })}
                      <th className="sticky top-0 z-20 border-b border-line/45 bg-panel2 px-4 py-3 text-right text-[10px] font-bold uppercase tracking-[0.12em]">Total</th>
                    </tr>
                  </thead>
                  <tbody className="text-text font-medium">
                    {wbsRevenueMatrix.rows.map((row) => (
                      <tr key={row.norm} className="group">
                        <td className="sticky left-0 z-10 w-[280px] min-w-[280px] border-b border-line/30 bg-panel px-4 py-3 shadow-[1px_0_0_0_rgb(var(--color-line))] transition group-hover:bg-panel2">
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => { setDrilldownWbs(row.norm); setSelectedPeriod(null); setDrilldownTab("sap"); setDrilldownSearch(""); setDrilldownPage(1); }}
                              title="Show this WBS's actual cost postings"
                              className={`font-mono whitespace-nowrap underline-offset-2 hover:underline ${drilldownWbs === row.norm ? "text-accent font-bold" : "text-accent"}`}>
                              {row.code}
                            </button>
                            {row.isUnmapped && (<span title="Posted revenue on a WBS that is not present in the WBS master" className="rounded-full bg-danger/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-danger">Unmapped</span>)}
                          </div>
                          {row.desc && (<div className="mt-0.5 max-w-[280px] truncate text-[11px] text-muted/70" title={row.desc}>{row.desc}</div>)}
                        </td>
                        {row.cells.map((value, index) => (
                          <td key={wbsRevenueMatrix.periods[index]} className={`border-b border-line/30 px-4 py-3 text-right font-mono whitespace-nowrap transition group-hover:bg-panel2/40 ${wbsRevenueMatrix.periods[index] === enginePocPeriod ? "bg-accent/5" : ""} ${value === 0 ? "text-muted/40" : value < 0 ? "text-danger" : "text-success"}`}>
                            {value === 0 ? "—" : formatCurrency(value)}
                          </td>
                        ))}
                        <td className={`border-b border-line/30 px-4 py-3 text-right font-mono font-bold whitespace-nowrap transition group-hover:bg-panel2/40 ${row.total < 0 ? "text-danger" : "text-text"}`}>{formatCurrency(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="font-bold text-text">
                    <tr>
                      <td className="sticky bottom-0 left-0 z-30 w-[280px] min-w-[280px] bg-panel2 border-t-2 border-line/65 px-4 py-3 text-[11px] uppercase tracking-wider shadow-[1px_0_0_0_rgb(var(--color-line))]">Total &middot; {wbsRevenueMatrix.rows.length} WBS</td>
                      {wbsRevenueMatrix.columnTotals.map((total, index) => (
                        <td key={wbsRevenueMatrix.periods[index]} className={`sticky bottom-0 z-20 bg-panel2 border-t-2 px-4 py-3 text-right font-mono whitespace-nowrap ${wbsRevenueMatrix.periods[index] === enginePocPeriod ? "text-accent border-accent" : "border-line/65"} ${total < 0 ? "text-danger" : ""}`}>{formatCurrency(total)}</td>
                      ))}
                      <td className="sticky bottom-0 z-20 bg-panel2 border-t-2 border-line/65 px-4 py-3 text-right font-mono whitespace-nowrap">{formatCurrency(wbsRevenueMatrix.grandTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="py-16 text-center text-sm text-muted">
                <div className="font-semibold text-text">No revenue to break down</div>
                <div className="mt-1 text-xs">No revenue-generating WBS produced revenue in the selected range.</div>
              </div>
            )}
          </div>
        );

      case "costTrends.section.costByWbsMatrix":
        return (
          <div className="h-full relative z-0 rounded-3xl border border-line/70 bg-panel/75 p-5 shadow-card print-card">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between border-b border-line/30 pb-4">
              <div>
                <h3 className="text-base font-bold text-text">Cost by WBS &amp; Period</h3>
                <p className="mt-1 text-xs text-muted/70">{wbsCostMatrix.rows.length} WBS element{wbsCostMatrix.rows.length === 1 ? "" : "s"} across {wbsCostMatrix.periods.length} period{wbsCostMatrix.periods.length === 1 ? "" : "s"}. Column totals match the trend charts above.</p>
              </div>
              <div className="no-print flex items-center gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-[11px] font-semibold text-muted">
                  <input type="checkbox" checked={hideZeroMatrixRows} onChange={(event) => setHideZeroMatrixRows(event.target.checked)} className="h-3.5 w-3.5 rounded border-line accent-accent" />
                  Hide empty rows
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-muted">Sort rows by</span>
                  <div className="flex gap-1 rounded-xl border border-line bg-panel2 p-1">
                    {(["code", "total"] as const).map((mode) => (
                      <button key={mode} type="button" title={mode === "code" ? "Order rows by WBS code (ascending)" : "Order rows by total cost (largest first)"} onClick={() => setMatrixSort(mode)}
                        className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${matrixSort === mode ? "bg-accent text-white shadow-sm" : "text-muted hover:text-text"}`}>
                        {mode === "code" ? "WBS Code" : "Total ▾"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {(selectedMatrixWbs.length > 0 || wbsCostMatrix.hasRowFilter) && (
              <div className="no-print mt-4 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-muted">Active filters:</span>
                {selectedMatrixWbs.length > 0 && (
                  <button type="button" onClick={() => setSelectedMatrixWbs([])} className="inline-flex items-center gap-1.5 rounded-lg border border-accent/50 bg-accent/10 px-3 py-1.5 text-[11px] font-bold text-accent transition hover:bg-accent/20">
                    {selectedMatrixWbs.length} WBS selected <X className="h-3 w-3" />
                  </button>
                )}
                {Object.values(columnFilters).some(isColumnFilterActive) && (
                  <button type="button" onClick={() => setColumnFilters({})} className="inline-flex items-center gap-1.5 rounded-lg border border-accent/50 bg-accent/10 px-3 py-1.5 text-[11px] font-bold text-accent transition hover:bg-accent/20">
                    Clear column filters <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-line/40 bg-panel2/40 px-3 py-2.5 text-[11px] leading-relaxed text-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
              <span>Every column shows <strong className="text-text">actual and pending cost (GR55 + PM updates)</strong> posted in that period.</span>
            </div>
            {wbsCostMatrix.hasRowFilter && (
              <div className="mt-2 flex items-start gap-2 rounded-xl border border-accent/40 bg-accent/5 px-3 py-2 text-[11px] leading-relaxed text-accent">
                <Filter className="mt-0.5 h-3.5 w-3.5 shrink-0" fill="currentColor" />
                <span>A row filter is active, so some WBS rows are hidden. The totals below are <strong>subtotals of the visible rows</strong>.</span>
              </div>
            )}
            {wbsCostMatrix.rows.length > 0 && wbsCostMatrix.periods.length > 0 ? (
              <div className="mt-4 overflow-x-auto overflow-y-auto max-h-[580px]">
                <table style={{ minWidth: 280 + wbsCostMatrix.periods.length * 120 + 150 }} className="w-full text-xs border-separate border-spacing-0">
                  <thead className="text-left text-muted/80">
                    <tr>
                      <th className="sticky top-0 left-0 z-30 w-[280px] min-w-[280px] border-b border-line/45 bg-panel2 px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.12em] shadow-[1px_0_0_0_rgb(var(--color-line))]">
                        <span className="inline-flex items-center">WBS<WbsColumnFilter options={matrixCostWbsOptions} selected={selectedMatrixWbs} onChange={setSelectedMatrixWbs} /></span>
                      </th>
                      {wbsCostMatrix.periods.map((period) => {
                        return (
                          <th key={period} className="sticky top-0 z-20 border-b border-line/45 bg-panel2 px-4 py-3 text-right text-[10px] font-bold uppercase tracking-[0.12em] whitespace-nowrap">
                            <span className="inline-flex items-center justify-end">{period}<ColumnFilterButton period={period} value={columnFilters[period] ?? DEFAULT_COLUMN_FILTER} onChange={(next) => setColumnFilters((prev) => ({ ...prev, [period]: next }))} /></span>
                          </th>
                        );
                      })}
                      <th className="sticky top-0 z-20 border-b border-line/45 bg-panel2 px-4 py-3 text-right text-[10px] font-bold uppercase tracking-[0.12em]">Total</th>
                    </tr>
                  </thead>
                  <tbody className="text-text font-medium">
                    {wbsCostMatrix.rows.map((row) => (
                      <tr key={row.norm} className="group">
                        <td className="sticky left-0 z-10 w-[280px] min-w-[280px] border-b border-line/30 bg-panel px-4 py-3 shadow-[1px_0_0_0_rgb(var(--color-line))] transition group-hover:bg-panel2">
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => { setDrilldownWbs(row.norm); setSelectedPeriod(null); setDrilldownTab("sap"); setDrilldownSearch(""); setDrilldownPage(1); }}
                              title="Show this WBS's actual cost postings"
                              className={`font-mono whitespace-nowrap underline-offset-2 hover:underline ${drilldownWbs === row.norm ? "text-accent font-bold" : "text-accent"}`}>
                              {row.code}
                            </button>
                            {row.isUnmapped && (<span title="Posted cost on a WBS that is not present in the WBS master" className="rounded-full bg-danger/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-danger">Unmapped</span>)}
                          </div>
                          {row.desc && (<div className="mt-0.5 max-w-[280px] truncate text-[11px] text-muted/70" title={row.desc}>{row.desc}</div>)}
                        </td>
                        {row.cells.map((value, index) => (
                          <td key={wbsCostMatrix.periods[index]} className={`border-b border-line/30 px-4 py-3 text-right font-mono whitespace-nowrap transition group-hover:bg-panel2/40 ${value === 0 ? "text-muted/40" : value < 0 ? "text-danger" : "text-success"}`}>
                            {value === 0 ? "—" : formatCurrency(value)}
                          </td>
                        ))}
                        <td className={`border-b border-line/30 px-4 py-3 text-right font-mono font-bold whitespace-nowrap transition group-hover:bg-panel2/40 ${row.total < 0 ? "text-danger" : "text-text"}`}>{formatCurrency(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="font-bold text-text">
                    <tr>
                      <td className="sticky bottom-0 left-0 z-30 w-[280px] min-w-[280px] bg-panel2 border-t-2 border-line/65 px-4 py-3 text-[11px] uppercase tracking-wider shadow-[1px_0_0_0_rgb(var(--color-line))]">Total &middot; {wbsCostMatrix.rows.length} WBS</td>
                      {wbsCostMatrix.columnTotals.map((total, index) => (
                        <td key={wbsCostMatrix.periods[index]} className="sticky bottom-0 z-20 bg-panel2 border-t-2 border-line/65 px-4 py-3 text-right font-mono whitespace-nowrap text-text">{formatCurrency(total)}</td>
                      ))}
                      <td className="sticky bottom-0 z-20 bg-panel2 border-t-2 border-line/65 px-4 py-3 text-right font-mono whitespace-nowrap">{formatCurrency(wbsCostMatrix.grandTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="py-16 text-center text-sm text-muted">
                <div className="font-semibold text-text">No cost to break down</div>
                <div className="mt-1 text-xs">No cost-incurring WBS produced cost in the selected range.</div>
              </div>
            )}
          </div>
        );

      case "trends.section.drilldown":
      case "costTrends.section.drilldown":
        return (
          <div className="h-full rounded-3xl border border-line/70 bg-panel/75 p-5 shadow-card print-card">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-line/30 pb-4">
              <div>
                <h3 className="text-base font-bold text-text">
                  {drilldownWbsInfo ? `Actual Cost for: ${drilldownWbsInfo.code}` : selectedPeriod ? `Contributing Postings for: ${selectedPeriod}` : selectedPos.length > 0 ? `Postings for POs: ${selectedPos.join(', ')}` : "Transaction Drill-down"}
                </h3>
                <p className="text-xs text-muted mt-1">
                  {drilldownWbsInfo ? `${drilldownWbsInfo.desc ? drilldownWbsInfo.desc + " · " : ""}Total actual cost ${formatCurrency(drilldownWbsInfo.total)} across the selected range.` : selectedPeriod ? `Detailed ledger entries and WBS breakdowns contributing to period ${selectedPeriod}.` : selectedPos.length > 0 ? `Detailed ledger entries and WBS breakdowns for PO numbers: ${selectedPos.join(', ')}.` : "Click a WBS code in the matrix above to see its actual cost, or click any point on the trend charts to inspect a period."}
                </p>
              </div>
              {(selectedPeriod || selectedPos.length > 0 || drilldownWbs) && (
                <div className="no-print flex items-center gap-2">
                  <div className="relative">
                    <input type="text" placeholder="Search listings..." value={drilldownSearch} onChange={(e) => { setDrilldownSearch(e.target.value); setDrilldownPage(1); }}
                      className="w-full sm:w-60 rounded-xl border border-line bg-panel2 pl-9 pr-4 py-2 text-xs font-semibold text-text focus:border-accent focus:outline-none" />
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted/80" />
                  </div>
                  {drilldownWbs ? (<button type="button" onClick={() => setDrilldownWbs(null)} className="inline-flex items-center gap-1 rounded-xl border border-line bg-panel2 px-3 py-2 text-xs font-bold text-muted transition hover:text-text"><X className="h-3.5 w-3.5" /> Clear</button>) : null}
                </div>
              )}
            </div>
            {selectedPeriod || selectedPos.length > 0 || drilldownWbs ? (
              <div className="mt-5 space-y-4">
                <div className="no-print flex border-b border-line/40">
                  <button type="button" onClick={() => { setDrilldownTab("sap"); setDrilldownPage(1); }} className={`border-b-2 px-4 py-2.5 text-xs font-bold transition-all ${drilldownTab === "sap" ? "border-accent text-accent" : "border-transparent text-muted hover:text-text"}`}>SAP GR55 Postings ({rawDrilldownData.sap.length})</button>
                  <button type="button" onClick={() => { setDrilldownTab("pm"); setDrilldownPage(1); }} className={`border-b-2 px-4 py-2.5 text-xs font-bold transition-all ${drilldownTab === "pm" ? "border-accent text-accent" : "border-transparent text-muted hover:text-text"}`}>PM Daily Updates ({rawDrilldownData.pm.length})</button>
                  <button type="button" onClick={() => { setDrilldownTab("wbs"); setDrilldownPage(1); }} className={`border-b-2 px-4 py-2.5 text-xs font-bold transition-all ${drilldownTab === "wbs" ? "border-accent text-accent" : "border-transparent text-muted hover:text-text"}`}>WBS Breakdown ({rawDrilldownData.wbs.length})</button>
                  <button type="button" onClick={() => { setDrilldownTab("category"); setDrilldownPage(1); }} className={`border-b-2 px-4 py-2.5 text-xs font-bold transition-all ${drilldownTab === "category" ? "border-accent text-accent" : "border-transparent text-muted hover:text-text"}`}>Cost Elements Grouping ({rawDrilldownData.category.length})</button>
                </div>
                <div className="overflow-x-auto min-h-64">
                  {drilldownTab === "sap" && (
                    <table className="w-full text-left border-collapse">
                      <thead><tr className="border-b border-line/50 text-[10px] uppercase font-bold text-muted tracking-wider"><th className="py-2.5 px-3">Posting Date</th><th className="py-2.5 px-3">WBS Code</th><th className="py-2.5 px-3">WBS Description</th><th className="py-2.5 px-3">Cost Element</th><th className="py-2.5 px-3">Cost Category</th><th className="py-2.5 px-3 text-right">Amount</th></tr></thead>
                      <tbody className="divide-y divide-line/35 text-xs font-medium text-text">
                        {paginatedDrilldown.map((row: Gr55CostRow) => (
                          <tr key={row.id} className="hover:bg-panel2/35 transition">
                            <td className="py-2.5 px-3 font-mono">{row.posting_date}</td>
                            <td className="py-2.5 px-3 font-mono text-accent">{row.wbs_code}</td>
                            <td className="py-2.5 px-3 truncate max-w-xs">{row.wbs_description || wbsCodeToDescMap.get(row.wbs_code) || "-"}</td>
                            <td className="py-2.5 px-3 font-mono">{row.cost_element}</td>
                            <td className="py-2.5 px-3">{row.cost_category}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-text">{formatCurrency(Number(row.amount))}</td>
                          </tr>
                        ))}
                        {paginatedDrilldown.length > 0 && (
                          <>
                            <tr className="border-t border-line/60 bg-panel2/20 font-bold"><td colSpan={5} className="py-2 px-3 text-xs uppercase tracking-wider text-muted">Page Total ({paginatedDrilldown.length} items)</td><td className="py-2 px-3 text-right font-mono text-text text-xs">{formatCurrency(paginatedDrilldown.reduce((sum: number, r: Gr55CostRow) => sum + Number(r.amount || 0), 0))}</td></tr>
                            <tr className="border-t-2 border-line bg-panel2/40 font-extrabold text-accent"><td colSpan={5} className="py-2 px-3 text-xs uppercase tracking-wider">Grand Total (All {filteredDrilldown.length} items)</td><td className="py-2 px-3 text-right font-mono text-xs">{formatCurrency((filteredDrilldown as Gr55CostRow[]).reduce((sum: number, r: Gr55CostRow) => sum + Number(r.amount || 0), 0))}</td></tr>
                          </>
                        )}
                        {!paginatedDrilldown.length && (<tr><td colSpan={6} className="py-12 text-center text-muted">No SAP postings found.</td></tr>)}
                      </tbody>
                    </table>
                  )}
                  {drilldownTab === "pm" && (
                    <table className="w-full text-left border-collapse">
                      <thead><tr className="border-b border-line/50 text-[10px] uppercase font-bold text-muted tracking-wider"><th className="py-2.5 px-3">Update Date</th><th className="py-2.5 px-3">WBS Code</th><th className="py-2.5 px-3 text-right">Material Pending</th><th className="py-2.5 px-3 text-right">Subcontract Pending</th><th className="py-2.5 px-3 text-right">Manpower Pending</th><th className="py-2.5 px-3 text-right">Total Pending</th><th className="py-2.5 px-3">Remarks</th></tr></thead>
                      <tbody className="divide-y divide-line/35 text-xs font-medium text-text">
                        {paginatedDrilldown.map((up: DailyUpdate) => (
                          <tr key={up.id} className="hover:bg-panel2/35 transition">
                            <td className="py-2.5 px-3 font-mono">{up.update_date}</td>
                            <td className="py-2.5 px-3 font-mono text-accent">{wbsIdToCodeMap.get(up.revenue_wbs_id) || up.revenue_wbs_id}</td>
                            <td className="py-2.5 px-3 text-right font-mono">{formatCurrency(up.pending_material_cost)}</td>
                            <td className="py-2.5 px-3 text-right font-mono">{formatCurrency(up.pending_subcontractor_cost)}</td>
                            <td className="py-2.5 px-3 text-right font-mono">{formatCurrency(up.pending_manpower_cost)}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-warning">{formatCurrency(getEffectivePendingCost(up))}</td>
                            <td className="py-2.5 px-3 max-w-xs truncate" title={up.remarks || ""}>{up.remarks || "-"}</td>
                          </tr>
                        ))}
                        {!paginatedDrilldown.length && (<tr><td colSpan={7} className="py-12 text-center text-muted">No PM updates found.</td></tr>)}
                      </tbody>
                    </table>
                  )}
                  {drilldownTab === "wbs" && (
                    <table className="w-full text-left border-collapse">
                      <thead><tr className="border-b border-line/50 text-[10px] uppercase font-bold text-muted tracking-wider"><th className="py-2.5 px-3">WBS Code</th><th className="py-2.5 px-3">WBS Description</th><th className="py-2.5 px-3 text-right">Actual Cost Posted</th><th className="py-2.5 px-3 text-right">Recognized Revenue (Approx.)</th></tr></thead>
                      <tbody className="divide-y divide-line/35 text-xs font-medium text-text">
                        {paginatedDrilldown.map((item: any) => (
                          <tr key={item.wbsCode} className="hover:bg-panel2/35 transition">
                            <td className="py-2.5 px-3 font-mono text-accent">{item.wbsCode}</td>
                            <td className="py-2.5 px-3">{item.wbsDesc}</td>
                            <td className="py-2.5 px-3 text-right font-mono">{formatCurrency(item.actual)}</td>
                            <td className={`py-2.5 px-3 text-right font-mono ${item.revenue < 0 ? 'text-red-500 font-semibold' : 'text-success'}`}>{formatCurrency(item.revenue)}</td>
                          </tr>
                        ))}
                        {!paginatedDrilldown.length && (<tr><td colSpan={4} className="py-12 text-center text-muted">No WBS entries found.</td></tr>)}
                      </tbody>
                    </table>
                  )}
                  {drilldownTab === "category" && (
                    <table className="w-full text-left border-collapse">
                      <thead><tr className="border-b border-line/50 text-[10px] uppercase font-bold text-muted tracking-wider"><th className="py-2.5 px-3">Cost Category</th><th className="py-2.5 px-3 text-right">Actual Cost Posted</th></tr></thead>
                      <tbody className="divide-y divide-line/35 text-xs font-medium text-text">
                        {paginatedDrilldown.map((item: any) => (
                          <tr key={item.category} className="hover:bg-panel2/35 transition">
                            <td className="py-2.5 px-3 font-semibold">{item.category}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-text">{formatCurrency(item.amount)}</td>
                          </tr>
                        ))}
                        {!paginatedDrilldown.length && (<tr><td colSpan={2} className="py-12 text-center text-muted">No cost category groups found.</td></tr>)}
                      </tbody>
                    </table>
                  )}
                </div>
                {maxDrilldownPage > 1 && (
                  <div className="no-print mt-3 flex items-center justify-between border-t border-line/30 pt-3">
                    <span className="text-[11px] font-bold text-muted uppercase">Showing {drilldownPage} of {maxDrilldownPage} pages ({filteredDrilldown.length} total rows)</span>
                    <div className="flex gap-2">
                      <button disabled={drilldownPage === 1} onClick={() => setDrilldownPage((p) => Math.max(1, p - 1))} type="button" className="rounded-lg p-1.5 border border-line bg-panel2 text-muted transition hover:text-text disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
                      <button disabled={drilldownPage === maxDrilldownPage} onClick={() => setDrilldownPage((p) => Math.min(maxDrilldownPage, p + 1))} type="button" className="rounded-lg p-1.5 border border-line bg-panel2 text-muted transition hover:text-text disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-16 text-center text-muted text-sm flex flex-col items-center justify-center gap-2">
                <Calendar className="h-8 w-8 text-muted/50 mb-1" />
                <div className="font-semibold text-text">No period selected</div>
                <div className="text-xs max-w-xs">Click on any point or dot in the cost, revenue, or forecast trend charts above to inspect Contributing Postings.</div>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  const trendPlaceholder = (id: string) => {
    const w = getWidget(id);
    return (
      <div className="flex h-40 flex-col items-center justify-center rounded-3xl border border-dashed border-accent/40 bg-panel2/40 text-center">
        <LayoutGrid className="h-6 w-6 text-accent/60" />
        <div className="mt-2 text-sm font-bold text-text">{w?.title ?? id}</div>
        <div className="text-[11px] text-muted">Drag to reposition</div>
      </div>
    );
  };

  const buildTrendGridItem = (id: string): GridItem | null => {
    const w = getWidget(id);
    if (!w || w.tab !== (mode === "cost" ? "costTrends" : "trends") || !isTrendVisible(id)) return null;
    return {
      id,
      span: w.span,
      title: w.title,
      node: renderTrendWidget(id),
      placeholder: isHeavyTrend(id) ? trendPlaceholder(id) : undefined,
    };
  };

  const currentTrendRowOrder = editingTrends ? editTrendRows : trendsOrder;
  const trendRowItems: GridItem[][] = currentTrendRowOrder
    .map((rowIds) => rowIds.map(buildTrendGridItem).filter(Boolean) as GridItem[])
    .filter((row) => row.length > 0);

  // Seed editTrendRows when entering edit mode (triggered from parent tab bar or internal button).
  useEffect(() => {
    if (editingTrends && editTrendRows.length === 0) {
      setTrendLayoutMsg("");
      setEditTrendRows(trendsOrder.map((row) => [...row]));
    }
    if (!editingTrends) {
      setEditTrendRows([]);
    }
  }, [editingTrends]);
  const startEditTrends = () => {
    setEditingTrends?.(true);
  };
  const applyTrendReorder = (newRows: string[][]) => {
    setEditTrendRows(newRows);
  };
  const saveTrendLayout = async () => {
    setSavingTrendLayout(true);
    setTrendLayoutMsg("");
    try {
      const res = await fetch(`/api/dashboard-layout/${currentProjectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: editTrendRows, tab: mode === "cost" ? "costTrends" : "trends" }),
      });
      if (!res.ok) throw new Error();
      window.location.reload();
    } catch {
      setSavingTrendLayout(false);
      setTrendLayoutMsg("Could not save layout. You may not have permission.");
    }
  };

  return (
    <div className="space-y-6 print-container">
      {/* Print-Only Header */}
      <div className="hidden print:block mb-6 border-b border-line pb-4">
        <h1 className="text-2xl font-bold text-text">{currentProject?.project_name} - Trend Analytics</h1>
        <p className="text-sm text-muted mt-1">
          Report type: {periodType.toUpperCase()} | WBS scope: {wbsScopeText} | Export Date:{" "}
          {new Date().toLocaleDateString()}
        </p>
      </div>

      {/* 1. Filter Bar & Actions (Hidden on Print) */}
      {/* z-30 must exceed the Cost Element card's `relative z-20` below, or this sticky bar's
          WBS dropdown (z-50, trapped in this stacking context) renders behind that card. */}
      <div className="no-print sticky top-[138px] z-30 rounded-2xl border border-line/80 bg-panel/90 p-4 shadow-sm backdrop-blur-md">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-4.5 w-4.5 text-accent" />
            <span className="text-sm font-bold text-text">Trend Filters</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleExportExcel}
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-4 py-2.5 text-xs font-bold text-success transition hover:bg-success/20 hover:border-success/50"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Export Excel
            </button>
            <button
              onClick={handlePrintPDF}
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-xs font-bold text-accent transition hover:bg-accent/20 hover:border-accent/50"
            >
              <Printer className="h-4 w-4" />
              Print PDF
            </button>
            {canCustomize && !editingTrends && (
              <button type="button" onClick={startEditTrends}
                className="inline-flex items-center gap-1.5 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-xs font-bold text-accent transition hover:bg-accent/20">
                <LayoutGrid className="h-3.5 w-3.5" />
                Edit layout
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {/* WBS Multi-Select Dropdown */}
          <div className="lg:col-span-2">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1.5">WBS Elements (Multi-select)</label>
            <MultiWbsSelect
              selectedValues={selectedWbs}
              onChange={(vals) => {
                setSelectedWbs(vals);
                setSelectedPeriod(null);
              }}
              options={uniqueWbsOptions}
              placeholder="All Project WBS"
            />
          </div>

          {/* Interval selection */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1.5">Interval</label>
            <div className="flex rounded-xl border border-line bg-panel2 p-0.5">
              {(["month", "quarter", "year"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setPeriodType(t);
                    setStartPeriod("");
                    setEndPeriod("");
                    setSelectedPeriod(null);
                  }}
                  className={`flex-1 rounded-lg py-1.5 text-[10px] font-bold uppercase transition ${
                    periodType === t ? "bg-accent text-white shadow-sm" : "text-muted hover:text-text"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Start Period selection */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1.5">Start Period</label>
            <select
              value={startPeriod}
              onChange={(e) => {
                setStartPeriod(e.target.value);
                setSelectedPeriod(null);
              }}
              className="w-full rounded-xl border border-line bg-panel2 px-3 py-2 text-xs font-semibold text-text focus:border-accent focus:outline-none font-mono"
            >
              <option value="">Earliest</option>
              {distinctPeriods.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* End Period selection */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1.5">End Period</label>
            <select
              value={endPeriod}
              onChange={(e) => {
                setEndPeriod(e.target.value);
                setSelectedPeriod(null);
              }}
              className="w-full rounded-xl border border-line bg-panel2 px-3 py-2 text-xs font-semibold text-text focus:border-accent focus:outline-none font-mono"
            >
              <option value="">Latest</option>
              {distinctPeriods.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Overrun Warning Alert Banner */}
      {hasProjectedOverrun && (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger flex items-start gap-3 shadow-sm">
          <Info className="h-5 w-5 shrink-0 mt-0.5 text-danger" />
          <div>
            <div className="font-bold">Projected Cost Overrun Warning</div>
            <div className="mt-1 text-xs opacity-90">
              The project forecast cost (Actual SAP actuals + simulated PM updates) is projected to exceed the planned budget by{" "}
              <span className="font-bold">{formatCurrency(overrunAmount)}</span>. Review cost elements and subcontract allocations.
            </div>
          </div>
        </div>
      )}
      {/* Edit Layout Bar for Trends */}
      {editingTrends ? (
        <div className="no-print sticky top-[132px] z-20 flex flex-col gap-2 rounded-2xl border border-accent/40 bg-accent/5 px-4 py-3 shadow-sm backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-accent">
            <LayoutGrid className="h-4 w-4 shrink-0" />
            <span>Drag the handle on any visual to rearrange it, then save.{trendLayoutMsg ? <span className="text-danger"> · {trendLayoutMsg}</span> : null}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => setEditingTrends?.(false)} disabled={savingTrendLayout}
              className="inline-flex items-center gap-1 rounded-lg border border-line bg-panel2 px-3 py-1.5 text-[11px] font-bold text-muted transition hover:text-text disabled:opacity-40">
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
            <button type="button" onClick={saveTrendLayout} disabled={savingTrendLayout}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[11px] font-bold text-white shadow-sm transition hover:bg-accent/90 disabled:opacity-40">
              {savingTrendLayout ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Save &amp; apply
            </button>
          </div>
        </div>
      ) : null}

      <DashboardGrid
        rows={trendRowItems}
        editing={editingTrends}
        onReorder={applyTrendReorder}
      />
    </div>
  );
}