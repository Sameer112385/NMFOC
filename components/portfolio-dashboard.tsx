"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
  RadialBarChart,
  RadialBar,
  PieChart,
  Pie,
} from "recharts";
import { ArrowRight, Building2, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Calendar, User } from "lucide-react";
import { cn, formatCompactCurrency, formatCurrency, formatPercent } from "@/lib/utils";
import { Badge, surfaceCard } from "@/components/ui";

type ProjectRow = {
  id: string;
  project_code: string;
  project_name: string;
  client_name: string | null;
  project_manager_name: string | null;
  status: string;
  latestUpload: string | null;
  plannedRevenue: number;
  plannedCost: number;
  actualCost: number;
  recognizedRevenue: number;
  forecastCost: number;
  forecastMargin: number;
  forecastMarginPct: number;
  pocPercent: number;
  mtdRevenue: number;
  ytdRevenue: number;
  riskStatus: "Warning" | "Safe";
};

const CHART_COLORS = ["#3b82f6", "#10b981", "#6366f1", "#f59e0b", "#ec4899", "#14b8a6", "#8b5cf6", "#f97316"];
const DANGER_COLOR = "#ef4444";
const SUCCESS_COLOR = "#10b981";
const WARNING_COLOR = "#f59e0b";

const chartTooltipStyle = {
  backgroundColor: "rgb(var(--color-panel) / 0.97)",
  border: "1px solid rgb(var(--color-line) / 0.6)",
  borderRadius: 10,
  color: "rgb(var(--color-text))",
  fontSize: "11px",
  fontFamily: "Inter, sans-serif",
};

function KpiCard({
  label,
  value,
  sub,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "accent" | "success" | "warning" | "danger";
  icon: React.ComponentType<{ className?: string }>;
}) {
  const border = {
    default: "border-line/80",
    accent: "border-accent/25",
    success: "border-success/25",
    warning: "border-warning/25",
    danger: "border-danger/25",
  }[tone];

  const bg = {
    default: "bg-panel/95",
    accent: "bg-gradient-to-br from-accent/8 via-panel to-panel2/95",
    success: "bg-gradient-to-br from-success/8 via-panel to-panel2/95",
    warning: "bg-gradient-to-br from-warning/8 via-panel to-panel2/95",
    danger: "bg-gradient-to-br from-danger/8 via-panel to-panel2/95",
  }[tone];

  const via = {
    default: "via-muted/25",
    accent: "via-accent/35",
    success: "via-success/35",
    warning: "via-warning/35",
    danger: "via-danger/35",
  }[tone];

  const iconColor = {
    default: "text-muted/70",
    accent: "text-accent",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  }[tone];

  return (
    <div className={`relative flex flex-col overflow-hidden rounded-3xl border p-5 shadow-card ${border} ${bg}`}>
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent ${via} to-transparent opacity-65`} />
      <div className="flex items-center justify-between gap-2">
        <span className="section-kicker text-muted text-[10px] font-bold uppercase tracking-wider">{label}</span>
        <Icon className={`h-4 w-4 flex-none ${iconColor}`} />
      </div>
      <div className="data-value mt-4 text-[1.25rem] font-semibold tracking-tight text-text">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted/80">{sub}</div>}
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className={`overflow-hidden rounded-3xl border border-line/40 bg-panel/30 shadow-card ${surfaceCard}`}>
      <div className="border-b border-line/30 px-5 py-4">
        <div className="text-sm font-bold text-text">{title}</div>
        {subtitle && <div className="mt-0.5 text-xs text-muted/75">{subtitle}</div>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export function PortfolioDashboard({ rows }: { rows: ProjectRow[] }) {
  const [sortKey, setSortKey] = useState<"forecastMargin" | "pocPercent" | "recognizedRevenue" | "actualCost">("forecastMargin");

  const totals = useMemo(
    () => ({
      plannedRevenue: rows.reduce((s, r) => s + r.plannedRevenue, 0),
      recognizedRevenue: rows.reduce((s, r) => s + r.recognizedRevenue, 0),
      actualCost: rows.reduce((s, r) => s + r.actualCost, 0),
      forecastMargin: rows.reduce((s, r) => s + r.forecastMargin, 0),
      mtdRevenue: rows.reduce((s, r) => s + r.mtdRevenue, 0),
      ytdRevenue: rows.reduce((s, r) => s + r.ytdRevenue, 0),
      atRisk: rows.filter((r) => r.riskStatus === "Warning").length,
      safe: rows.filter((r) => r.riskStatus === "Safe").length,
    }),
    [rows]
  );

  const totalForecastMarginPct = totals.plannedRevenue > 0 ? (totals.forecastMargin / totals.plannedRevenue) * 100 : 0;

  // Sorted rows for comparison chart
  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => b[sortKey] - a[sortKey]),
    [rows, sortKey]
  );

  // Data for the margin comparison bar chart
  const marginChartData = sortedRows.map((r, i) => ({
    name: r.project_code,
    fullName: r.project_name,
    "Forecast Margin": r.forecastMargin,
    "Actual Cost": r.actualCost,
    "Recognized Revenue": r.recognizedRevenue,
    "POC %": r.pocPercent,
    color: CHART_COLORS[i % CHART_COLORS.length],
    isWarning: r.riskStatus === "Warning",
  }));

  // Risk pie data
  const riskPieData = [
    { name: "Safe", value: totals.safe, fill: SUCCESS_COLOR },
    { name: "At Risk", value: totals.atRisk, fill: WARNING_COLOR },
  ].filter((d) => d.value > 0);

  // Revenue vs Cost comparison data
  const revCostData = sortedRows.map((r, i) => ({
    name: r.project_code,
    "Planned Revenue": r.plannedRevenue,
    "Actual Cost": r.actualCost,
    "Forecast Margin": r.forecastMargin,
  }));

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="text-muted text-sm">No projects available to display.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Summary Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Total Planned Revenue"
          value={formatCompactCurrency(totals.plannedRevenue)}
          sub={`${rows.length} project${rows.length !== 1 ? "s" : ""}`}
          tone="accent"
          icon={TrendingUp}
        />
        <KpiCard
          label="Total Recognized Revenue"
          value={formatCompactCurrency(totals.recognizedRevenue)}
          sub={`MTD: ${formatCompactCurrency(totals.mtdRevenue)}`}
          tone="success"
          icon={CheckCircle2}
        />
        <KpiCard
          label="Total Actual Cost"
          value={formatCompactCurrency(totals.actualCost)}
          sub={`YTD Revenue: ${formatCompactCurrency(totals.ytdRevenue)}`}
          tone="default"
          icon={Building2}
        />
        <KpiCard
          label="Portfolio Forecast Margin"
          value={formatCompactCurrency(totals.forecastMargin)}
          sub={`${formatPercent(totalForecastMarginPct)} margin`}
          tone={totals.forecastMargin >= 0 ? "success" : "danger"}
          icon={totals.forecastMargin >= 0 ? TrendingUp : TrendingDown}
        />
      </div>

      {/* Secondary KPI Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Active Projects" value={String(rows.filter(r => r.status === "Active").length)} tone="accent" icon={Calendar} />
        <KpiCard label="Projects On Track" value={String(totals.safe)} tone="success" icon={CheckCircle2} />
        <KpiCard label="Projects At Risk" value={String(totals.atRisk)} tone={totals.atRisk > 0 ? "warning" : "default"} icon={AlertTriangle} />
        <KpiCard
          label="Avg Forecast Margin %"
          value={formatPercent(rows.length > 0 ? rows.reduce((s, r) => s + r.forecastMarginPct, 0) / rows.length : 0)}
          tone={totalForecastMarginPct >= 0 ? "success" : "danger"}
          icon={TrendingUp}
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Margin Comparison — takes 2/3 width */}
        <div className="lg:col-span-2">
          <ChartCard
            title="Project Forecast Margin"
            subtitle="Forecast margin in SAR per project — red bars indicate at-risk projects"
          >
            <div className="mb-3 flex flex-wrap gap-2">
              {(["forecastMargin", "actualCost", "recognizedRevenue", "pocPercent"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSortKey(k)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wide transition",
                    sortKey === k
                      ? "border-accent bg-accent text-white"
                      : "border-line/50 bg-panel text-muted hover:border-accent/40 hover:text-text"
                  )}
                >
                  {k === "forecastMargin" ? "Margin" : k === "actualCost" ? "Actual Cost" : k === "recognizedRevenue" ? "Revenue" : "POC %"}
                </button>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={marginChartData} barSize={32} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-line) / 0.3)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "rgb(var(--color-muted))" }} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={(v) => (sortKey === "pocPercent" ? `${v.toFixed(0)}%` : formatCompactCurrency(v))}
                  tick={{ fontSize: 10, fill: "rgb(var(--color-muted))" }}
                  axisLine={false}
                  tickLine={false}
                  width={72}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  formatter={(value: number, name: string) => {
                    if (name === "POC %") return [`${Number(value).toFixed(2)}%`, name];
                    return [formatCurrency(value), name];
                  }}
                  labelFormatter={(label) => {
                    const row = marginChartData.find((r) => r.name === label);
                    return row?.fullName ?? label;
                  }}
                />
                <Bar dataKey={sortKey === "forecastMargin" ? "Forecast Margin" : sortKey === "actualCost" ? "Actual Cost" : sortKey === "recognizedRevenue" ? "Recognized Revenue" : "POC %"} radius={[6, 6, 0, 0]}>
                  {marginChartData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={
                        sortKey === "forecastMargin" && entry["Forecast Margin"] < 0
                          ? DANGER_COLOR
                          : CHART_COLORS[i % CHART_COLORS.length]
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Risk Breakdown — takes 1/3 width */}
        <ChartCard title="Risk Status" subtitle="Projects by financial health">
          <div className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={riskPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={78}
                  dataKey="value"
                  paddingAngle={3}
                >
                  {riskPieData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => [`${v} project${v !== 1 ? "s" : ""}`, ""]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 flex w-full flex-col gap-2">
              {riskPieData.map((d) => (
                <div key={d.name} className="flex items-center justify-between rounded-xl px-3 py-2 bg-panel2/50">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full flex-none" style={{ backgroundColor: d.fill }} />
                    <span className="text-xs font-semibold text-text">{d.name}</span>
                  </div>
                  <span className="text-xs font-bold text-muted">{d.value} project{d.value !== 1 ? "s" : ""}</span>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>
      </div>

      {/* Revenue vs Cost Chart */}
      <ChartCard
        title="Revenue vs Actual Cost by Project"
        subtitle="Planned revenue and actual cost side by side — identifies over-spent or under-earned projects"
      >
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={revCostData} barGap={4} barCategoryGap="30%" margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-line) / 0.3)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "rgb(var(--color-muted))" }} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={(v) => formatCompactCurrency(v)}
              tick={{ fontSize: 10, fill: "rgb(var(--color-muted))" }}
              axisLine={false}
              tickLine={false}
              width={80}
            />
            <Tooltip
              contentStyle={chartTooltipStyle}
              formatter={(value: number, name: string) => [formatCurrency(value), name]}
              labelFormatter={(label) => {
                const row = revCostData.find((r) => r.name === label);
                return row ? label : label;
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: "rgb(var(--color-muted))" }} />
            <Bar dataKey="Planned Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Actual Cost" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Project Cards Grid */}
      <div>
        <div className="mb-4 text-sm font-bold text-text">All Projects</div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((project, i) => {
            const color = CHART_COLORS[i % CHART_COLORS.length]!;
            return (
              <Link
                key={project.id}
                href={`/dashboard/${project.id}`}
                className="group relative overflow-hidden rounded-3xl border border-line/50 bg-panel/60 p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/35 hover:shadow-lg"
              >
                {/* top accent bar in project color */}
                <div className="absolute inset-x-0 top-0 h-1 rounded-t-3xl" style={{ background: `linear-gradient(to right, transparent, ${color}55, transparent)` }} />

                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-line/60 bg-panel2/70 px-2.5 py-0.5 text-[10px] font-bold text-muted">
                    <span className="h-2 w-2 rounded-full flex-none" style={{ backgroundColor: color }} />
                    {project.project_code}
                  </span>
                  <Badge tone={project.riskStatus === "Warning" ? "warning" : "success"}>
                    {project.riskStatus === "Warning" ? "At Risk" : "On Track"}
                  </Badge>
                </div>

                <h3 className="mt-3 text-sm font-bold leading-snug text-text transition-colors group-hover:text-accent line-clamp-2">
                  {project.project_name}
                </h3>

                {project.client_name && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
                    <Building2 className="h-3 w-3 flex-none" />
                    {project.client_name}
                  </div>
                )}
                {project.project_manager_name && (
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
                    <User className="h-3 w-3 flex-none" />
                    {project.project_manager_name}
                  </div>
                )}

                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line/40 pt-4">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted/70">Recognized Rev.</div>
                    <div className={`mt-1 text-xs font-bold ${project.forecastMargin >= 0 ? "text-success" : "text-danger"}`}>
                      {formatCompactCurrency(project.recognizedRevenue)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted/70">Actual Cost</div>
                    <div className="mt-1 text-xs font-bold text-text">{formatCompactCurrency(project.actualCost)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted/70">POC %</div>
                    <div className="mt-1 text-xs font-bold text-text">{formatPercent(project.pocPercent)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted/70">Forecast Margin</div>
                    <div className={`mt-1 text-xs font-bold ${project.forecastMargin >= 0 ? "text-success" : "text-danger"}`}>
                      {formatCompactCurrency(project.forecastMargin)}
                    </div>
                  </div>
                </div>

                {/* POC progress bar */}
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-[10px] text-muted">
                    <span>Progress</span>
                    <span>{formatPercent(project.pocPercent)}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel2">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, project.pocPercent)}%`, backgroundColor: color }}
                    />
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-[11px] font-medium text-accent">
                  <span>Open dashboard</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
