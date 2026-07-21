"use client";

import { formatCurrency, formatPercent } from "@/lib/utils";
import { format } from "date-fns";

interface PrintReportLayoutProps {
  project: any; // Selected project (null for portfolio-wide)
  revenueRows: any[];
  subcontracts: any[];
  dailyUpdates: any[];
  risks: any[];
  includedSections: {
    coverPage: boolean;
    kpiSummary: boolean;
    wbsTable: boolean;
    poTable: boolean;
    risksTable: boolean;
    updatesLog: boolean;
  };
}

export default function PrintReportLayout({
  project,
  revenueRows,
  subcontracts,
  dailyUpdates,
  risks,
  includedSections,
}: PrintReportLayoutProps) {
  const isGlobal = !project;
  const projectName = isGlobal ? "All Active Projects Portfolio" : project.project_name;
  const projectCode = isGlobal ? "Global Portfolio" : project.project_code;
  const reportDate = format(new Date(), "MMMM d, yyyy");
  const reportTime = format(new Date(), "HH:mm:ss");

  // Sums
  const actualCost = revenueRows.reduce((sum, r) => sum + (r.actual_cost_to_date || 0), 0);
  const plannedCost = revenueRows.reduce((sum, r) => sum + (r.planned_cost || 0), 0);
  const plannedRevenue = revenueRows.reduce((sum, r) => sum + (r.planned_revenue || 0), 0);
  const recognizedRevenue = revenueRows.reduce((sum, r) => sum + (r.recognized_revenue_to_date || 0), 0);
  const variance = plannedCost - actualCost;
  const margin = recognizedRevenue - actualCost;
  const marginPercent = recognizedRevenue > 0 ? (margin / recognizedRevenue) * 100 : 0;

  return (
    <div className="print-only w-full max-w-[800px] mx-auto bg-white text-black p-8 font-sans antialiased">
      {/* 1. Cover Page */}
      {includedSections.coverPage && (
        <div className="print-page-break flex flex-col justify-between h-[270mm] border-[8px] border-double border-slate-300 p-12 mb-8">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-black tracking-[0.15em] text-slate-800">DETASAD</h1>
              <p className="text-[9px] font-bold tracking-[0.25em] text-slate-500 uppercase">Detecon Al Saudia</p>
            </div>
            <span className="text-[10px] uppercase font-bold tracking-wider px-3 py-1 bg-red-100 text-red-700 rounded">
              Confidential
            </span>
          </div>

          <div className="my-auto space-y-4">
            <span className="text-xs uppercase font-extrabold tracking-[0.15em] text-slate-400">
              Project Performance Report
            </span>
            <h2 className="text-4xl font-extrabold text-slate-900 leading-tight">
              {projectName}
            </h2>
            <p className="text-lg text-slate-500 font-medium">
              Project Code: <span className="font-bold font-mono text-slate-800">{projectCode}</span>
            </p>
          </div>

          <div className="border-t border-slate-200 pt-6 flex justify-between items-end text-xs text-slate-400">
            <div>
              <p>Generated on: <span className="font-semibold text-slate-600">{reportDate}</span></p>
              <p>Time: <span className="font-semibold text-slate-600">{reportTime}</span></p>
            </div>
            <p className="font-semibold text-slate-600">Detasad Projects Dashboard</p>
          </div>
        </div>
      )}

      {/* 2. KPI Summary Section */}
      {includedSections.kpiSummary && (
        <div className="print-page-break space-y-6 mb-8">
          <div className="border-b border-slate-300 pb-3">
            <h3 className="text-lg font-bold uppercase tracking-wider text-slate-800">1. Executive KPI Summary</h3>
            <p className="text-[10px] text-slate-500">Overview of key commercial and cost variances.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="border border-slate-200 p-4 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-slate-400">Planned Cost</span>
              <p className="text-xl font-bold font-mono text-slate-800 mt-1">{formatCurrency(plannedCost)}</p>
            </div>
            <div className="border border-slate-200 p-4 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-slate-400">Actual Cost (to Date)</span>
              <p className="text-xl font-bold font-mono text-slate-800 mt-1">{formatCurrency(actualCost)}</p>
            </div>
            <div className="border border-slate-200 p-4 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-slate-400">Recognized Revenue</span>
              <p className="text-xl font-bold font-mono text-slate-800 mt-1">{formatCurrency(recognizedRevenue)}</p>
            </div>
            <div className="border border-slate-200 p-4 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-slate-400">Gross Margin</span>
              <p className="text-xl font-bold font-mono text-slate-800 mt-1">
                {formatCurrency(margin)} <span className="text-xs text-slate-500 font-normal">({formatPercent(marginPercent)})</span>
              </p>
            </div>
          </div>
          
          <div className="border border-slate-200 p-4 rounded-xl space-y-2">
            <h4 className="text-xs font-bold text-slate-700 uppercase">Performance Summary</h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              The project code <span className="font-semibold">{projectCode}</span> shows a total planned commercial ceiling of <span className="font-semibold">{formatCurrency(plannedRevenue)}</span>. 
              To date, recognized revenue stands at <span className="font-semibold">{formatCurrency(recognizedRevenue)}</span>, 
              supported by total actual booked costs of <span className="font-semibold">{formatCurrency(actualCost)}</span>. 
              The current variance between planned baseline cost and actual cost booked is <span className="font-semibold">{formatCurrency(variance)}</span>.
            </p>
          </div>
        </div>
      )}

      {/* 3. WBS Detailed Performance Table */}
      {includedSections.wbsTable && (
        <div className="print-page-break space-y-4 mb-8">
          <div className="border-b border-slate-300 pb-3">
            <h3 className="text-lg font-bold uppercase tracking-wider text-slate-800">2. WBS Performance Breakdown</h3>
            <p className="text-[10px] text-slate-500">Breakdown of planned vs actual metrics by active WBS element.</p>
          </div>

          <table className="w-full text-[10px] border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-300 text-slate-600 bg-slate-50">
                <th className="py-2 text-left font-bold w-[30%]">WBS Code</th>
                <th className="py-2 text-left font-bold w-[25%]">Description</th>
                <th className="py-2 text-right font-bold w-[15%]">Planned Cost</th>
                <th className="py-2 text-right font-bold w-[15%]">Actual Cost</th>
                <th className="py-2 text-right font-bold w-[15%]">Rec. Revenue</th>
              </tr>
            </thead>
            <tbody>
              {revenueRows.map((row, i) => (
                <tr key={i} className="border-b border-slate-200 hover:bg-slate-50">
                  <td className="py-2 font-mono font-semibold text-slate-800 truncate">{row.wbs_code}</td>
                  <td className="py-2 text-slate-600 truncate max-w-[180px]">{row.link_name || "N/A"}</td>
                  <td className="py-2 text-right font-mono">{formatCurrency(row.planned_cost)}</td>
                  <td className="py-2 text-right font-mono">{formatCurrency(row.actual_cost_to_date)}</td>
                  <td className="py-2 text-right font-mono">{formatCurrency(row.recognized_revenue_to_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 4. Subcontractor PO Spend Matrix */}
      {includedSections.poTable && (
        <div className="print-page-break space-y-4 mb-8">
          <div className="border-b border-slate-300 pb-3">
            <h3 className="text-lg font-bold uppercase tracking-wider text-slate-800">3. Subcontractor PO Commitments</h3>
            <p className="text-[10px] text-slate-500">Commitment and actual expenditures categorized by Purchasing Document.</p>
          </div>

          {subcontracts.length > 0 ? (
            <table className="w-full text-[10px] border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-300 text-slate-600 bg-slate-50">
                  <th className="py-2 text-left font-bold w-[25%]">PO Number</th>
                  <th className="py-2 text-left font-bold w-[35%]">Subcontractor Package</th>
                  <th className="py-2 text-right font-bold w-[20%]">Committed Amount</th>
                  <th className="py-2 text-right font-bold w-[20%]">Actual Spent</th>
                </tr>
              </thead>
              <tbody>
                {subcontracts.map((sub, i) => (
                  <tr key={i} className="border-b border-slate-200">
                    <td className="py-2 font-mono font-semibold text-slate-800">{sub.purchasing_document}</td>
                    <td className="py-2 text-slate-600 truncate max-w-[200px]">{sub.package_name || "N/A"}</td>
                    <td className="py-2 text-right font-mono">{formatCurrency(sub.committed_amount)}</td>
                    <td className="py-2 text-right font-mono">{formatCurrency(sub.actual_spent || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-slate-500 italic">No subcontractor contracts registered for this project scope.</p>
          )}
        </div>
      )}

      {/* 5. Active Control Exceptions (Risks) */}
      {includedSections.risksTable && (
        <div className="print-page-break space-y-4 mb-8">
          <div className="border-b border-slate-300 pb-3">
            <h3 className="text-lg font-bold uppercase tracking-wider text-slate-800">4. Cost Control Exceptions</h3>
            <p className="text-[10px] text-slate-500">Active alerts where actual spending exceeds baseline planned thresholds.</p>
          </div>

          {risks.length > 0 ? (
            <table className="w-full text-[10px] border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-300 text-slate-600 bg-slate-50">
                  <th className="py-2 text-left font-bold w-[30%]">WBS Code</th>
                  <th className="py-2 text-left font-bold w-[40%]">Exception Reason</th>
                  <th className="py-2 text-right font-bold w-[30%]">Cost Variance</th>
                </tr>
              </thead>
              <tbody>
                {risks.map((risk, i) => (
                  <tr key={i} className="border-b border-slate-200">
                    <td className="py-2 font-mono font-semibold text-slate-800">{risk.wbs_code || "N/A"}</td>
                    <td className="py-2 text-red-600 font-semibold">{risk.description}</td>
                    <td className="py-2 text-right font-mono text-red-600 font-semibold">
                      {formatCurrency(risk.variance || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-xs font-semibold">
              ✔ No budget overruns or exceptions detected across the selected scope.
            </div>
          )}
        </div>
      )}

      {/* 6. PM Daily Site Logs */}
      {includedSections.updatesLog && (
        <div className="space-y-4">
          <div className="border-b border-slate-300 pb-3">
            <h3 className="text-lg font-bold uppercase tracking-wider text-slate-800">5. Project Manager Daily Site Log</h3>
            <p className="text-[10px] text-slate-500">Latest progress updates reported from site operations.</p>
          </div>

          {dailyUpdates.length > 0 ? (
            <div className="space-y-4">
              {dailyUpdates.map((up, i) => (
                <div key={i} className="border border-slate-200 p-4 rounded-xl space-y-2 print-card-break">
                  <div className="flex justify-between items-center text-[10px] font-bold border-b border-slate-100 pb-1.5">
                    <span className="font-mono text-slate-700">WBS: {up.wbs_code}</span>
                    <span className="text-slate-400">Date: {format(new Date(up.reported_date || up.created_at), "yyyy-MM-dd")}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 font-medium">
                    <p>Milestone: <span className="font-bold text-slate-800">{up.milestone_title || "N/A"}</span></p>
                    <p>Progress: <span className="font-bold text-slate-800">{up.progress_percent}%</span></p>
                  </div>
                  {up.comments && (
                    <div className="text-[10px] text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100 italic">
                      "{up.comments}"
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">No daily site logs reported for the active scope.</p>
          )}
        </div>
      )}
    </div>
  );
}
