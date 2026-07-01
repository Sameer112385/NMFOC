"use client";

import type { ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn, formatCompactCurrency, formatCompactNumber, formatPercent } from '@/lib/utils';
import { surfaceCard } from '@/components/ui';

const palette = ['#3b82f6', '#10b981', '#6366f1', '#f59e0b', '#ec4899', '#14b8a6'];

const chartTooltipStyle = {
  backgroundColor: 'rgb(var(--color-panel) / 0.95)',
  border: '1px solid rgb(var(--color-line) / 0.7)',
  borderRadius: 10,
  color: 'rgb(var(--color-text))',
  boxShadow: 'var(--shadow-panel)',
  fontSize: '11px',
  fontFamily: 'Inter, sans-serif',
};

function chartAxisTickFormatter(value: number | string) {
  if (typeof value === 'number') return formatCompactNumber(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? formatCompactNumber(parsed) : String(value);
}

function chartTooltipFormatter(value: number, name: string): any {
  if (value === 0) return null;
  const label = name.toLowerCase();
  if (label.includes('poc') || label.includes('%')) return [formatPercent(value), name];
  return [formatCompactCurrency(value), name];
}

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
            : (item.value >= 0 || item.value < 0 ? formatCompactCurrency(item.value) : "");

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

function wrapChart({ title, subtitle, className, children }: { title: string; subtitle?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn(surfaceCard, 'overflow-hidden border border-line/40 bg-panel/30 shadow-card hover:shadow-md hover:border-line/75', className)}>
      <div className="border-b border-line/30 px-5 py-4">
        <div className="text-sm font-bold tracking-tight text-text">{title}</div>
        {subtitle ? <div className="mt-1 text-xs text-muted/75 font-medium">{subtitle}</div> : null}
      </div>
      <div className="h-80 p-5">{children}</div>
    </div>
  );
}

export function RevenueVsSimulationChart({ data }: { data: { name: string; sap: number; simulated: number }[] }) {
  const chartWidth = Math.max(500, data.length * 45);
  return wrapChart({
    title: 'Recognized Revenue vs Forecast Revenue',
    subtitle: 'Compare system revenue against the current management projection.',
    children: (
      <div className="h-full overflow-x-auto pb-2 scrollbar-thin">
        <div style={{ width: chartWidth, height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barCategoryGap={18}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgb(var(--color-line) / 0.3)" />
              <XAxis 
                dataKey="name" 
                stroke="rgb(var(--color-muted) / 0.8)" 
                fontSize={9} 
                tickLine={false} 
                axisLine={false} 
                interval={0}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis stroke="rgb(var(--color-muted) / 0.8)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={chartAxisTickFormatter} />
              <Tooltip content={<CustomChartTooltip formatter={chartTooltipFormatter} />} cursor={{ fill: 'rgb(var(--color-accent) / 0.04)' }} />
              <Legend verticalAlign="top" height={26} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="sap" fill="#3b82f6" name="SAP Revenue" radius={[4, 4, 0, 0]} />
              <Bar dataKey="simulated" fill="#10b981" name="Simulated Revenue" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    ),
  });
}

export function CostComparisonChart({ data }: { data: { name: string; sap: number; simulated: number }[] }) {
  const chartWidth = Math.max(500, data.length * 45);
  return wrapChart({
    title: 'Actual Cost vs Forecast Cost',
    subtitle: 'Spot variance between booked cost and management outlook.',
    children: (
      <div className="h-full overflow-x-auto pb-2 scrollbar-thin">
        <div style={{ width: chartWidth, height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgb(var(--color-line) / 0.3)" />
              <XAxis 
                dataKey="name" 
                stroke="rgb(var(--color-muted) / 0.8)" 
                fontSize={9} 
                tickLine={false} 
                axisLine={false} 
                interval={0}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis stroke="rgb(var(--color-muted) / 0.8)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={chartAxisTickFormatter} />
              <Tooltip content={<CustomChartTooltip formatter={chartTooltipFormatter} />} />
              <Legend verticalAlign="top" height={26} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="sap" stroke="#f59e0b" strokeWidth={2.5} dot={false} name="SAP Actual Cost" />
              <Line type="monotone" dataKey="simulated" stroke="#3b82f6" strokeWidth={2.5} dot={false} name="Simulated Actual Cost" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    ),
  });
}

export function TopWbsChart({ data }: { data: { name: string; value: number }[] }) {
  return wrapChart({
    title: 'Top Links by Recognized Revenue',
    subtitle: 'Highest contributing WBS link names by recognized value.',
    children: (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical">
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgb(var(--color-line) / 0.3)" />
          <XAxis type="number" stroke="rgb(var(--color-muted) / 0.8)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={chartAxisTickFormatter} />
          <YAxis dataKey="name" type="category" stroke="rgb(var(--color-muted) / 0.8)" fontSize={10} width={140} tickLine={false} axisLine={false} />
          <Tooltip content={<CustomChartTooltip formatter={chartTooltipFormatter} />} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={palette[index % palette.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    ),
  });
}

export function ScrollableTopWbsChart({ data }: { data: { name: string; value: number }[] }) {
  const chartHeight = Math.max(360, data.length * 36);

  return wrapChart({
    title: 'All Links by Recognized Revenue',
    subtitle: 'Scrollable revenue ranking across the complete filtered set.',
    children: (
      <div className="h-full overflow-y-auto pr-2">
        <div style={{ height: chartHeight, minWidth: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 8, right: 20, left: 8, bottom: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgb(var(--color-line) / 0.3)" />
              <XAxis type="number" stroke="rgb(var(--color-muted) / 0.8)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={chartAxisTickFormatter} />
              <YAxis dataKey="name" type="category" stroke="rgb(var(--color-muted) / 0.8)" width={180} interval={0} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomChartTooltip formatter={chartTooltipFormatter} />} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {data.map((entry, index) => (
                  <Cell key={entry.name} fill={palette[index % palette.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    ),
  });
}

export function PendingChart({ data }: { data: { name: string; value: number }[] }) {
  return wrapChart({
    title: 'Top WBS with Pending Cost',
    subtitle: 'Largest unposted exposure across filtered WBS lines.',
    children: (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" outerRadius={96} innerRadius={58} paddingAngle={3}>
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={palette[index % palette.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomChartTooltip formatter={chartTooltipFormatter} />} />
          <Legend verticalAlign="bottom" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    ),
  });
}

export function RevenueSplitChart({ recognized, remaining, total }: { recognized: number; remaining: number; total: number }) {
  const chartData = [
    { name: 'Revenue Recognised', value: Math.max(0, recognized) },
    { name: 'Revenue Remaining', value: Math.max(0, remaining) },
  ];
  const safeTotal = total > 0 ? total : chartData.reduce((sum, item) => sum + item.value, 0);

  return wrapChart({
    title: 'Recognized vs Remaining Revenue',
    subtitle: 'Revenue consumption against the planned commercial ceiling.',
    children: (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={chartData} dataKey="value" nameKey="name" outerRadius={96} innerRadius={58} paddingAngle={3} stroke="rgb(var(--color-panel))" strokeWidth={2}>
            {chartData.map((entry, index) => (
              <Cell key={entry.name} fill={index === 0 ? '#3b82f6' : '#f59e0b'} />
            ))}
          </Pie>
          <Tooltip
            content={
              <CustomChartTooltip
                formatter={(value: number, name: string) => {
                  if (value === 0) return null;
                  const percent = safeTotal > 0 ? (value / safeTotal) * 100 : 0;
                  return [`${formatCompactCurrency(value)} (${formatPercent(percent)})`, name];
                }}
              />
            }
          />
          <Legend verticalAlign="bottom" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} formatter={(value) => <span className="text-xs text-text">{value}</span>} />
        </PieChart>
      </ResponsiveContainer>
    ),
  });
}

export function PocChart({ data }: { data: { name: string; value: number }[] }) {
  const chartWidth = Math.max(500, data.length * 45);
  return wrapChart({
    title: 'POC % by WBS',
    subtitle: 'Progress concentration across filtered work packages.',
    children: (
      <div className="h-full overflow-x-auto pb-2 scrollbar-thin">
        <div style={{ width: chartWidth, height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgb(var(--color-line) / 0.3)" />
              <XAxis 
                dataKey="name" 
                stroke="rgb(var(--color-muted) / 0.8)" 
                fontSize={9} 
                tickLine={false} 
                axisLine={false} 
                interval={0}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis stroke="rgb(var(--color-muted) / 0.8)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={chartAxisTickFormatter} />
              <Tooltip content={<CustomChartTooltip formatter={chartTooltipFormatter} />} />
              <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    ),
  });
}

export function RiskChart({ data }: { data: { name: string; value: number }[] }) {
  return wrapChart({
    title: 'Risk Count by Type',
    subtitle: 'Current alert mix across all identified control exceptions.',
    children: (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" outerRadius={96} innerRadius={38}>
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={palette[index % palette.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomChartTooltip formatter={chartTooltipFormatter} />} />
          <Legend verticalAlign="bottom" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    ),
  });
}

export function RevenueTrendChart({ data }: { data: { period: string; recognizedRevenue: number; cumulativeRecognizedRevenue: number }[] }) {
  return wrapChart({
    title: 'Revenue Trend by Month',
    subtitle: 'Historical monthly and cumulative recognized revenue since project start.',
    className: 'md:col-span-2',
    children: (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorCumulative" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
              <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgb(var(--color-line) / 0.3)" />
          <XAxis 
            dataKey="period" 
            stroke="rgb(var(--color-muted) / 0.8)" 
            fontSize={10} 
            tickLine={false} 
            axisLine={false} 
          />
          <YAxis 
            stroke="rgb(var(--color-muted) / 0.8)" 
            fontSize={10} 
            tickLine={false} 
            axisLine={false} 
            tickFormatter={chartAxisTickFormatter} 
          />
          <Tooltip content={<CustomChartTooltip formatter={chartTooltipFormatter} />} />
          <Legend verticalAlign="top" height={26} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
          <Area type="monotone" dataKey="recognizedRevenue" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorRevenue)" name="Monthly Revenue" />
          <Area type="monotone" dataKey="cumulativeRecognizedRevenue" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorCumulative)" name="Cumulative Revenue" />
        </AreaChart>
      </ResponsiveContainer>
    ),
  });
}

export function CostBreakdownChart({ data }: { data: { name: string; value: number }[] }) {
  const safeData = data.filter((item) => item.value > 0);
  const totalVal = safeData.reduce((sum, item) => sum + item.value, 0);

  return wrapChart({
    title: 'Cost Breakdown by Category',
    subtitle: 'Distribution of actual GR55 costs across key resource types.',
    children: (
      <ResponsiveContainer width="100%" height="100%">
        {safeData.length > 0 ? (
          <PieChart>
            <Pie
              data={safeData}
              dataKey="value"
              nameKey="name"
              outerRadius={90}
              innerRadius={50}
              paddingAngle={3}
              stroke="rgb(var(--color-panel))"
              strokeWidth={2}
            >
              {safeData.map((entry, index) => (
                <Cell key={entry.name} fill={palette[index % palette.length]} />
              ))}
            </Pie>
            <Tooltip
              content={
                <CustomChartTooltip
                  formatter={(value: number, name: string) => {
                    if (value === 0) return null;
                    const percent = totalVal > 0 ? (value / totalVal) * 100 : 0;
                    return [`${formatCompactCurrency(value)} (${formatPercent(percent)})`, name];
                  }}
                />
              }
            />
            <Legend
              verticalAlign="bottom"
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 10, paddingTop: 10 }}
              formatter={(value) => <span className="text-xs text-text">{value}</span>}
            />
          </PieChart>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">
            No actual cost data available for breakdown.
          </div>
        )}
      </ResponsiveContainer>
    ),
  });
}


