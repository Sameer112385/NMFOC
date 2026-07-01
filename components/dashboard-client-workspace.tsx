"use client";

import { useState, useMemo } from "react";
import { Badge, StatRow } from "@/components/ui";
import { DashboardWbsFilter } from "@/components/dashboard-wbs-filter";
import { ProjectMasterAdminPanel } from "@/components/project-master-admin-panel";
import { buildRiskAlerts } from "@/lib/calculations";
import { clampPercent, formatCurrency, formatPercent } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  RevenueVsSimulationChart,
  CostComparisonChart,
  TopWbsChart,
  RevenueSplitChart,
  PocChart,
  RevenueTrendChart,
} from "@/components/charts";
import { getEffectivePendingCost } from "@/lib/pm-posting";
import { Briefcase, Coins, Percent, TrendingUp, Activity, ShieldAlert, DollarSign, Filter } from "lucide-react";
import { TrendAnalysisPanel } from "@/components/trend-analysis-panel";
import { buildTrendData } from "@/lib/trends";
import { MultiWbsSelect } from "@/components/multi-wbs-select";
import type {
  DailyUpdate,
  Gr55CostRow,
  Project,
  ProjectCostElementControl,
  ProjectManpowerRate,
  ProjectMaterialMaster,
  ProjectWbsMaster,
  RevenueWBS,
} from "@/lib/types";

function StatCard({
  title,
  value,
  icon: Icon,
  tone = "default",
  hint,
  group,
}: {
  title: string;
  value: string;
  icon: any;
  tone?: "default" | "accent" | "success" | "warning" | "danger";
  hint?: string;
  group?: string;
}) {
  const toneClasses = {
    default: "border-line/80 bg-panel/95",
    accent: "border-accent/25 bg-gradient-to-br from-accent/8 via-panel to-panel2/95",
    success: "border-success/25 bg-gradient-to-br from-success/8 via-panel to-panel2/95",
    warning: "border-warning/25 bg-gradient-to-br from-warning/8 via-panel to-panel2/95",
    danger: "border-danger/25 bg-gradient-to-br from-danger/8 via-panel to-panel2/95",
  }[tone];

  const borderGradient = {
    default: "via-muted/35",
    accent: "via-accent/35",
    success: "via-success/35",
    warning: "via-warning/35",
    danger: "via-danger/35",
  }[tone];

  const iconColor = {
    default: "text-muted/80",
    accent: "text-accent",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  }[tone];

  const groupBadge = group ? {
    cost: <span className="text-[9px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Cost</span>,
    revenue: <span className="text-[9px] font-bold text-success bg-success/10 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Revenue</span>,
    margin: <span className="text-[9px] font-bold text-success bg-success/10 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Margin</span>,
    progress: <span className="text-[9px] font-bold text-success bg-success/10 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Progress</span>,
  }[group.toLowerCase()] : null;

  return (
    <div className={`relative overflow-hidden rounded-3xl border p-4 shadow-card ${toneClasses}`}>
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent ${borderGradient} to-transparent opacity-65`} />
      <div className="flex items-center justify-between gap-2">
        <span className="section-kicker text-muted">{title}</span>
        {groupBadge || <Icon className={`h-4.5 w-4.5 ${iconColor}`} />}
      </div>
      <div className="data-value mt-4 text-[1.18rem] font-semibold tracking-tight text-text sm:text-[1.3rem]">
        {value}
      </div>
      {hint ? <div className="mt-3 text-xs text-muted/80">{hint}</div> : null}
    </div>
  );
}

interface DashboardClientWorkspaceProps {
  project: Project;
  projects: Project[];
  revenueRows: RevenueWBS[];
  costRows: RevenueWBS[]; // from getRevenueRows
  allWbsRows: RevenueWBS[];
  updates: DailyUpdate[];
  manpowerRates: ProjectManpowerRate[];
  materialMasters: ProjectMaterialMaster[];
  projectWbsMaster: ProjectWbsMaster[];
  costElementControl: ProjectCostElementControl[];
  gr55Rows: Gr55CostRow[];
}

export function DashboardClientWorkspace({
  project,
  projects,
  revenueRows,
  costRows,
  allWbsRows,
  updates,
  manpowerRates,
  materialMasters,
  projectWbsMaster,
  costElementControl,
  gr55Rows,
}: DashboardClientWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<"summary" | "trends">("summary");
  const [selectedWbs, setSelectedWbs] = useState<string[]>([]);
  const [selectedPos, setSelectedPos] = useState<string[]>([]);

  // Extract unique PO numbers from gr55Rows
  const poOptions = useMemo(() => {
    const pos = new Set<string>();
    gr55Rows.forEach((r) => {
      const pd = String(r.purchasing_document || "").trim();
      if (pd) pos.add(pd);
    });
    return Array.from(pos).sort();
  }, [gr55Rows]);

  // Determine WBS codes matching the selected POs
  const wbsCodesForSelectedPo = useMemo(() => {
    if (selectedPos.length === 0) return null;
    const codes = new Set<string>();
    gr55Rows.forEach((r) => {
      const pd = String(r.purchasing_document || "").trim();
      if (selectedPos.includes(pd)) {
        codes.add(r.wbs_code.replace(/[^A-Za-z0-9]/g, "").toUpperCase());
      }
    });
    return codes;
  }, [gr55Rows, selectedPos]);

  // WBS options strictly from WBS Master
  const wbsOptions = useMemo(() => {
    return projectWbsMaster
      .filter((w) => w.is_active !== false && (w.include_in_cost || w.is_revenue_generating))
      .map((w) => ({
        value: w.wbs_code,
        label: w.wbs_description ? `${w.wbs_code} - ${w.wbs_description}` : w.wbs_code,
      }))
      .sort((a, b) => a.value.localeCompare(b.value));
  }, [projectWbsMaster]);

  // Filter costRows and revenueRows based on selected POs and WBS
  const filteredCostRows = useMemo(() => {
    let list = costRows;
    if (wbsCodesForSelectedPo) {
      list = list.filter((row) => {
        const rowNorm = row.wbs_code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
        return wbsCodesForSelectedPo.has(rowNorm);
      });
    }
    if (selectedWbs.length === 0) return list;
    return list.filter((row) =>
      selectedWbs.some((f) => {
        const rowNorm = row.wbs_code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
        const fNorm = f.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
        return rowNorm.startsWith(fNorm);
      })
    );
  }, [costRows, selectedWbs, wbsCodesForSelectedPo]);

  const filteredRevenueRows = useMemo(() => {
    let list = revenueRows;
    if (wbsCodesForSelectedPo) {
      list = list.filter((row) => {
        const rowNorm = row.wbs_code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
        return wbsCodesForSelectedPo.has(rowNorm);
      });
    }
    if (selectedWbs.length === 0) return list;
    return list.filter((row) =>
      selectedWbs.some((f) => {
        const rowNorm = row.wbs_code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
        const fNorm = f.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
        return rowNorm.startsWith(fNorm);
      })
    );
  }, [revenueRows, selectedWbs, wbsCodesForSelectedPo]);

  // Summary Metrics calculations
  const plannedCost = filteredCostRows.reduce((sum, row) => sum + row.planned_cost, 0);
  const actualCost = filteredCostRows.reduce((sum, row) => sum + row.actual_cost_to_date, 0);
  const sapActualCost = filteredCostRows.reduce((sum, row) => sum + (row.sap_actual_cost ?? 0), 0);
  const pmSimulatedCost = filteredCostRows.reduce((sum, row) => sum + (row.pm_pending_cost ?? 0), 0);
  const plannedRevenue = filteredRevenueRows.reduce((sum, row) => sum + row.planned_revenue, 0);
  const recognizedRevenue = filteredRevenueRows.reduce((sum, row) => sum + row.recognized_revenue_to_date, 0);
  const sapRecognizedRevenue = filteredRevenueRows.reduce((sum, row) => sum + (row.sap_earned_revenue ?? 0), 0);
  const remainingRevenue = plannedRevenue - recognizedRevenue;
  const remainingCost = plannedCost - actualCost;
  const forecastCost = filteredCostRows.reduce((sum, row) => sum + row.forecast_cost, 0) || actualCost;
  const forecastMargin = plannedRevenue - forecastCost;
  const forecastMarginPercent = plannedRevenue > 0 ? (forecastMargin / plannedRevenue) * 100 : 0;
  const pocPercent = clampPercent(plannedRevenue > 0 ? (recognizedRevenue / plannedRevenue) * 100 : 0);
  const sapPocPercent = clampPercent(plannedRevenue > 0 ? (sapRecognizedRevenue / plannedRevenue) * 100 : 0);
  const sapMargin = plannedRevenue - sapActualCost;
  const managementMargin = plannedRevenue - actualCost;
  const mtdActual = filteredCostRows.reduce((sum, row) => sum + row.mtd_actual_cost, 0);
  const ytdActual = filteredCostRows.reduce((sum, row) => sum + row.ytd_actual_cost, 0);
  const mtdRevenue = filteredRevenueRows.reduce((sum, row) => sum + row.mtd_revenue_recognition, 0);
  const ytdRevenue = filteredRevenueRows.reduce((sum, row) => sum + row.ytd_revenue_recognition, 0);
  const currentMonthRevenue = mtdRevenue;
  const openingRecognizedRevenue = filteredRevenueRows.reduce((sum, row) => sum + (row.opening_recognized_revenue ?? 0), 0);
  const latestPmUpdate = updates[0] ?? null;

  const trendData = useMemo(() => {
    return buildTrendData({
      projectId: project.id,
      costRows: allWbsRows,
      gr55Rows,
      updates,
      wbsMaster: projectWbsMaster,
      costElementControl,
      filterWbsCodes: selectedWbs,
      periodType: 'month',
      selectedPos,
    });
  }, [project.id, allWbsRows, gr55Rows, updates, projectWbsMaster, costElementControl, selectedWbs, selectedPos]);

  const risks = buildRiskAlerts(filteredRevenueRows);
  const riskChartData = Array.from(
    risks.reduce((map, risk) => map.set(risk.risk_type, (map.get(risk.risk_type) ?? 0) + 1), new Map<string, number>()),
    ([name, value]) => ({ name, value })
  );

  return (
    <div className="space-y-6">
      {/* Sticky Tab Selector (Hidden on Print) */}
      <div className="no-print sticky top-[74px] z-10 rounded-xl border border-line/60 bg-panel/85 p-1.5 shadow-sm backdrop-blur-md">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab("summary")}
            className={cn(
              "rounded-lg px-4 py-2 text-xs font-bold transition-all duration-100",
              activeTab === "summary" ? "bg-accent text-white shadow-sm" : "text-muted hover:bg-panel2 hover:text-text"
            )}
          >
            Financial Summary
          </button>
          <button
            onClick={() => setActiveTab("trends")}
            className={cn(
              "rounded-lg px-4 py-2 text-xs font-bold transition-all duration-100",
              activeTab === "trends" ? "bg-accent text-white shadow-sm" : "text-muted hover:bg-panel2 hover:text-text"
            )}
          >
            Trend Analysis
          </button>
        </div>
      </div>

      {activeTab === "summary" ? (
        <div className="space-y-6">
          {/* Summary WBS Filter Bar (Hidden on Print) */}
          <div className="no-print relative z-30 rounded-2xl border border-line/80 bg-panel/90 p-4 shadow-sm backdrop-blur-md">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Filter className="h-4.5 w-4.5 text-accent" />
                <span className="text-sm font-bold text-text">Summary WBS Filter</span>
              </div>
              <div className="w-full max-w-md">
                <MultiWbsSelect
                  selectedValues={selectedWbs}
                  onChange={setSelectedWbs}
                  options={wbsOptions}
                  placeholder="All WBS Elements"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            {/* Cost Cards */}
            <StatCard title="Planned Cost" value={formatCurrency(plannedCost)} icon={Briefcase} tone="accent" group="cost" />
            <StatCard
              title="Management Actual Cost"
              value={formatCurrency(actualCost)}
              icon={Coins}
              tone="accent"
              group="cost"
              hint="GR55 actual + active PM simulated cost"
            />

            {/* Revenue Cards */}
            <StatCard title="Planned Revenue" value={formatCurrency(plannedRevenue)} icon={DollarSign} tone="success" group="revenue" />
            <StatCard
              title="Recognized Revenue"
              value={formatCurrency(recognizedRevenue)}
              icon={TrendingUp}
              tone="success"
              group="revenue"
            />

            {/* Margin & Progress Cards */}
            <StatCard
              title="Forecast Margin"
              value={formatCurrency(forecastMargin)}
              icon={Percent}
              tone={forecastMargin >= 0 ? "success" : "danger"}
              group="margin"
            />
            <StatCard title="POC %" value={formatPercent(pocPercent)} icon={Percent} tone="success" group="progress" />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="surface-card p-5">
              <h3 className="text-base font-semibold text-text">SAP View</h3>
              <div className="mt-4 space-y-1">
                <StatRow label="GR55 actual cost" value={formatCurrency(sapActualCost)} />
                <StatRow label="SAP POC %" value={formatPercent(sapPocPercent)} />
                <StatRow label="SAP recognized revenue" value={formatCurrency(sapRecognizedRevenue)} />
                <StatRow label="SAP margin" value={formatCurrency(sapMargin)} />
              </div>
            </div>
            <div className="surface-card p-5">
              <h3 className="text-base font-semibold text-text">Management View</h3>
              <div className="mt-4 space-y-1">
                <StatRow label="GR55 actual cost" value={formatCurrency(sapActualCost)} />
                <StatRow label="PM simulated cost" value={formatCurrency(pmSimulatedCost)} />
                <StatRow label="Management actual cost" value={formatCurrency(actualCost)} />
                <StatRow label="Management POC %" value={formatPercent(pocPercent)} />
                <StatRow label="Management recognized revenue" value={formatCurrency(recognizedRevenue)} />
                <StatRow label="Management margin" value={formatCurrency(managementMargin)} />
              </div>
            </div>
          </div>

          {/* YTD Performance Metrics Row */}
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="surface-card p-5">
              <h3 className="text-base font-semibold text-text">Project-to-Date</h3>
              <div className="mt-4 space-y-1">
                <StatRow label="Remaining revenue" value={formatCurrency(remainingRevenue)} />
                <StatRow label="Remaining cost" value={formatCurrency(remainingCost)} />
                <StatRow label="Forecast margin %" value={formatPercent(forecastMarginPercent)} />
                <StatRow label="Opening recognized revenue" value={formatCurrency(openingRecognizedRevenue)} />
                <StatRow label="Current month revenue recognition" value={formatCurrency(currentMonthRevenue)} />
              </div>
            </div>

            <div className="surface-card p-5">
              <h3 className="text-base font-semibold text-text">YTD Performance</h3>
              <div className="mt-4 space-y-1">
                {(() => {
                  // Filter gr55Rows for YTD actuals that match the current WBS codes filter
                  const currentYearString = new Date().getFullYear().toString();
                  
                  // Filter to matched WBS set
                  const matchedGr55 = gr55Rows.filter((row) => {
                    // Match selected WBS filter
                    if (selectedWbs.length > 0) {
                      const rowNorm = row.wbs_code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
                      const match = selectedWbs.some((f) => {
                        const fNorm = f.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
                        return rowNorm.startsWith(fNorm);
                      });
                      if (!match) return false;
                    }
                    // Match selected PO filter
                    if (wbsCodesForSelectedPo) {
                      const rowNorm = row.wbs_code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
                      if (!wbsCodesForSelectedPo.has(rowNorm)) return false;
                    }
                    // Date must be this calendar year
                    const yr = row.posting_date ? row.posting_date.slice(0, 4) : "";
                    return yr === currentYearString;
                  });

                  // Accumulate category totals
                  let subconTotal = 0;
                  let materialTotal = 0;
                  let manpowerTotal = 0;

                  matchedGr55.forEach((row) => {
                    const cat = String(row.cost_category || "").toLowerCase();
                    const btx = String(row.raw_data_json?.business_transaction || "").toUpperCase();
                    const amt = row.amount || 0;

                    if (btx === "COIE") {
                      materialTotal += amt;
                    } else if (cat.includes("subcontract")) {
                      subconTotal += amt;
                    } else if (cat.includes("material") || cat.includes("consumable") || cat.includes("transportation") || cat.includes("transp")) {
                      materialTotal += amt;
                    } else if (cat.includes("labour") || cat.includes("labor") || cat.includes("manpower") || cat.includes("time cost") || cat.includes("hour")) {
                      manpowerTotal += amt;
                    }
                  });

                  return (
                    <>
                      <StatRow label="YTD Actual cost" value={formatCurrency(ytdActual)} />
                      <StatRow label="YTD Revenue" value={formatCurrency(ytdRevenue)} />
                      <StatRow label="YTD Subcon Cost" value={formatCurrency(subconTotal)} />
                      <StatRow label="YTD Material Cost" value={formatCurrency(materialTotal)} />
                      <StatRow label="YTD Manpower Cost" value={formatCurrency(manpowerTotal)} />
                    </>
                  );
                })()}
              </div>
            </div>

            <div className="surface-card p-5">
              <h3 className="text-base font-semibold text-text">Period Rollups</h3>
              <div className="mt-4 space-y-1">
                <StatRow label="MTD actual cost" value={formatCurrency(mtdActual)} />
                <StatRow label="YTD actual cost" value={formatCurrency(ytdActual)} />
                <StatRow label="Open PM updates" value={String(updates.length)} />
                <StatRow label="Open risk alerts" value={String(risks.length)} />
                <StatRow label="Project status" value={project.status ?? "Active"} />
              </div>
            </div>
          </div>

          {!revenueRows.length ? (
            <div className="rounded-3xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
              No revenue rows were generated yet. Upload the Sales Order file first so the WBS revenue can be built from
              Net Value, then add CN41 planned cost and GR55 actual cost if available.
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <RevenueTrendChart
                  data={trendData.map((pt) => ({
                    ...pt,
                    recognizedRevenue: pt.forecastRevenue,
                    cumulativeRecognizedRevenue: pt.cumulativeForecastRevenue,
                  }))}
                />
                <RevenueSplitChart recognized={recognizedRevenue} remaining={Math.max(0, remainingRevenue)} total={plannedRevenue} />
                <PocChart data={filteredCostRows.map((row) => ({ name: row.wbs_code, value: row.poc_percent }))} />
                <RevenueVsSimulationChart
                  data={filteredRevenueRows.map((row) => ({
                    name: row.wbs_code,
                    sap: row.sap_earned_revenue ?? 0,
                    simulated: row.recognized_revenue_to_date,
                  }))}
                />
                <CostComparisonChart
                  data={filteredCostRows.map((row) => ({
                    name: row.wbs_code,
                    sap: row.sap_actual_cost ?? 0,
                    simulated: row.actual_cost_to_date,
                  }))}
                />
                <TopWbsChart
                  data={filteredRevenueRows
                    .slice()
                    .sort((a, b) => b.recognized_revenue_to_date - a.recognized_revenue_to_date)
                    .slice(0, 6)
                    .map((row) => ({ name: row.wbs_description || row.wbs_code, value: row.recognized_revenue_to_date }))}
                />
              </div>

              <div className="rounded-3xl border border-line/70 bg-panel/70 p-5">
                <h3 className="text-base font-semibold text-text">WBS Financial Analysis</h3>
                <p className="text-sm text-muted">Filter the WBS rows for the active project.</p>
                <div className="mt-4">
                  <DashboardWbsFilter
                    rows={filteredCostRows}
                    selectedPos={selectedPos}
                    setSelectedPos={setSelectedPos}
                    poOptions={poOptions}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="surface-card p-6">
              <h3 className="text-base font-semibold text-text">Project Details</h3>
              <div className="mt-4 space-y-1">
                <StatRow label="Project Code" value={project.project_code} />
                <StatRow label="Client" value={project.client_name ?? "-"} />
                <StatRow label="Current Status" value={project.status ?? "Active"} />
                <StatRow label="Daily PM Updates" value={String(updates.length)} />
              </div>
            </div>

            {latestPmUpdate ? (
              <div className="surface-card p-6">
                <h3 className="flex items-center gap-2 text-base font-semibold text-text">
                  <Activity className="h-5 w-5 text-warning" />
                  Pending for Posting
                </h3>
                <div className="mt-4 rounded-2xl border border-line/70 bg-panel2/70 px-4 py-4">
                  <div className="section-kicker text-muted">Total Pending Cost</div>
                  <div className="data-value mt-2 text-[1.2rem] font-semibold text-text">
                    {formatCurrency(getEffectivePendingCost(latestPmUpdate))}
                  </div>
                </div>
                <div className="mt-4 space-y-1">
                  <StatRow label="PM Expected Progress %" value={formatPercent(clampPercent(latestPmUpdate.expected_progress))} />
                  <StatRow label="Material Cost" value={formatCurrency(latestPmUpdate.pending_material_cost)} />
                  <StatRow label="Subcontractor Cost" value={formatCurrency(latestPmUpdate.pending_subcontractor_cost)} />
                  <StatRow label="Manpower Cost" value={formatCurrency(latestPmUpdate.pending_manpower_cost)} />
                </div>
              </div>
            ) : null}

            <div className="surface-card p-6 xl:col-span-2">
              <h3 className="flex items-center gap-2 text-base font-semibold text-text">
                <ShieldAlert className="h-5 w-5 text-danger" />
                Top Risk Exposure
              </h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {risks.slice(0, 4).map((risk, index) => (
                  <div key={`${risk.wbs_code}-${index}`} className="rounded-2xl border border-line/70 bg-panel2/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="truncate text-sm font-semibold text-text">{risk.risk_type}</div>
                      <Badge
                        tone={
                          risk.severity === "High" ? "danger" : risk.severity === "Medium" ? "warning" : "success"
                        }
                      >
                        {risk.severity}
                      </Badge>
                    </div>
                    <div className="mt-2 text-xs font-medium text-muted">{risk.wbs_code}</div>
                    <div className="mt-1 text-sm text-muted">{risk.risk_description}</div>
                  </div>
                ))}
                {!risks.length ? (
                  <div className="py-6 text-center text-sm text-muted sm:col-span-2">No open risks found.</div>
                ) : null}
              </div>
            </div>
          </div>

          <ProjectMasterAdminPanel
            projectId={project.id}
            projectName={project.project_name}
            revenueWbs={revenueRows}
            projectWbsMaster={projectWbsMaster}
            manpowerRates={manpowerRates}
            materialMasters={materialMasters}
          />
        </div>
      ) : (
        <TrendAnalysisPanel
          currentProjectId={project.id}
          projects={projects}
          costRows={allWbsRows}
          gr55Rows={gr55Rows}
          updates={updates}
          wbsMaster={projectWbsMaster}
          costElementControl={costElementControl}
          selectedPos={selectedPos}
          setSelectedPos={setSelectedPos}
          poOptions={poOptions}
        />
      )}
    </div>
  );
}
