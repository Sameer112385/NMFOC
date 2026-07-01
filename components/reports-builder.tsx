"use client";

import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { PageShell, Card, StatRow } from "./ui";
import { formatCurrency, formatPercent } from "@/lib/utils";
import PrintReportLayout from "./print-report-layout";
import { FileDown, Printer, Loader2, CheckCircle2, AlertTriangle, FileText, Database } from "lucide-react";

interface ReportsBuilderProps {
  projects: any[];
  allWbsRows: any[];
  allSubcontracts: any[];
  allDailyUpdates: any[];
  allRisks: any[];
}

export default function ReportsBuilder({
  projects,
  allWbsRows,
  allSubcontracts,
  allDailyUpdates,
  allRisks,
}: ReportsBuilderProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [isPrinting, setIsPrinting] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  const [includedSections, setIncludedSections] = useState({
    coverPage: true,
    kpiSummary: true,
    wbsTable: true,
    poTable: true,
    risksTable: true,
    updatesLog: true,
  });

  // Filter logic based on project scope selection
  const selectedProject = selectedProjectId === "all" ? null : projects.find((p) => String(p.id) === selectedProjectId);
  const projectCode = selectedProject ? selectedProject.code : null;

  const filteredWbsRows = allWbsRows.filter((row) => {
    if (!projectCode) return true;
    return String(row.wbs_code).startsWith(projectCode);
  });

  const filteredSubcontracts = allSubcontracts.filter((sub) => {
    if (!projectCode) return true;
    // Map subcontractor PO to the selected project code prefix
    return filteredWbsRows.some(
      (wbs) => String(wbs.wbs_code) === String(sub.wbs_code)
    );
  });

  const filteredDailyUpdates = allDailyUpdates.filter((up) => {
    if (!projectCode) return true;
    return String(up.wbs_code).startsWith(projectCode);
  });

  const filteredRisks = allRisks.filter((risk) => {
    if (!projectCode) return true;
    return String(risk.wbs_code).startsWith(projectCode);
  });

  // Print trigger logic
  useEffect(() => {
    if (isPrinting) {
      const timer = setTimeout(() => {
        window.print();
      }, 500);

      const handleAfterPrint = () => {
        setIsPrinting(false);
      };

      window.addEventListener("afterprint", handleAfterPrint);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("afterprint", handleAfterPrint);
      };
    }
  }, [isPrinting]);

  // Excel generation logic using XLSX (SheetJS)
  const handleExportExcel = () => {
    setIsExportingExcel(true);
    try {
      const projectName = selectedProject ? selectedProject.name : "All Projects Portfolio";
      const codeLabel = selectedProject ? selectedProject.code : "Global";

      // 1. Create Summary Tab
      const actualCost = filteredWbsRows.reduce((sum, r) => sum + (r.actual_cost_to_date || 0), 0);
      const plannedCost = filteredWbsRows.reduce((sum, r) => sum + (r.planned_cost || 0), 0);
      const plannedRevenue = filteredWbsRows.reduce((sum, r) => sum + (r.planned_revenue || 0), 0);
      const recognizedRevenue = filteredWbsRows.reduce((sum, r) => sum + (r.recognized_revenue_to_date || 0), 0);

      const summaryData = [
        ["DETASAD - Project Performance Report Summary"],
        [],
        ["Project Scope Name", projectName],
        ["Project Scope Code", codeLabel],
        ["Report Generation Date", new Date().toLocaleDateString()],
        [],
        ["Key Indicators Summary"],
        ["Planned Revenue", plannedRevenue],
        ["Planned Cost", plannedCost],
        ["Actual Cost to Date", actualCost],
        ["Recognized Revenue to Date", recognizedRevenue],
        ["Gross Margin", recognizedRevenue - actualCost],
        ["Margin %", recognizedRevenue > 0 ? (recognizedRevenue - actualCost) / recognizedRevenue : 0],
      ];
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsSummary, "Overview Summary");

      // 2. Add WBS Performance Tab
      if (includedSections.wbsTable && filteredWbsRows.length > 0) {
        const wbsDataJson = filteredWbsRows.map((r) => ({
          "WBS Code": r.wbs_code,
          "WBS Description": r.link_name || "N/A",
          "Planned Cost": r.planned_cost || 0,
          "Actual Cost to Date": r.actual_cost_to_date || 0,
          "Planned Revenue": r.planned_revenue || 0,
          "Recognized Revenue to Date": r.recognized_revenue_to_date || 0,
          "MTD Revenue Recognition": r.mtd_revenue_recognition || 0,
          "YTD Revenue Recognition": r.ytd_revenue_recognition || 0,
        }));
        const wsWbs = XLSX.utils.json_to_sheet(wbsDataJson);
        XLSX.utils.book_append_sheet(wb, wsWbs, "WBS Performance");
      }

      // 3. Add Subcontracts Tab
      if (includedSections.poTable && filteredSubcontracts.length > 0) {
        const poDataJson = filteredSubcontracts.map((s) => ({
          "PO Number": s.purchasing_document,
          "Package Name": s.package_name || "N/A",
          "WBS Reference": s.wbs_code,
          "Committed Amount": s.committed_amount || 0,
          "Actual Spent to Date": s.actual_spent || 0,
        }));
        const wsPo = XLSX.utils.json_to_sheet(poDataJson);
        XLSX.utils.book_append_sheet(wb, wsPo, "Subcontractor POs");
      }

      // 4. Add Risks Tab
      if (includedSections.risksTable && filteredRisks.length > 0) {
        const riskDataJson = filteredRisks.map((k) => ({
          "WBS Reference": k.wbs_code,
          "Exception Alert Description": k.description,
          "Variance Overrun": k.variance || 0,
        }));
        const wsRisks = XLSX.utils.json_to_sheet(riskDataJson);
        XLSX.utils.book_append_sheet(wb, wsRisks, "Budget Overruns & Risks");
      }

      // 5. Add PM Site Logs Tab
      if (includedSections.updatesLog && filteredDailyUpdates.length > 0) {
        const logDataJson = filteredDailyUpdates.map((u) => ({
          "WBS Code": u.wbs_code,
          "Reporting Date": u.reported_date || u.created_at,
          "Milestone Title": u.milestone_title || "N/A",
          "Physical Progress (%)": u.progress_percent || 0,
          "Site Comments / Logs": u.comments || "",
        }));
        const wsLog = XLSX.utils.json_to_sheet(logDataJson);
        XLSX.utils.book_append_sheet(wb, wsLog, "PM Site Logs");
      }

      // Save workbook
      const filename = `${codeLabel}_Performance_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (err) {
      console.error("Excel generation failed", err);
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handlePrintPdf = () => {
    setIsPrinting(true);
  };

  return (
    <>
      {/* Printable page layout (Hidden on screen via print-only, visible during print) */}
      <PrintReportLayout
        project={selectedProject}
        revenueRows={filteredWbsRows}
        subcontracts={filteredSubcontracts}
        dailyUpdates={filteredDailyUpdates}
        risks={filteredRisks}
        includedSections={includedSections}
      />

      {/* Standard interactive builder layout (Hidden during browser printing) */}
      <div className="space-y-6 no-print">
        <div className="surface-card p-6 border border-line bg-panel/30 rounded-3xl">
          <h3 className="text-sm font-bold text-text uppercase tracking-wider mb-4 flex items-center gap-2">
            <Database className="h-4 w-4 text-accent" />
            Report Parameters & Scope
          </h3>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Project Filter Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-muted uppercase tracking-wider">
                Select Project Scope
              </label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full rounded-xl border border-line bg-panel px-4 py-3 text-xs text-text outline-none focus:border-accent transition shadow-sm"
              >
                <option value="all">Global Portfolio (All Active Projects)</option>
                {projects.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.code} - {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Checklist of sections */}
            <div className="space-y-3 border-l border-line/45 pl-6">
              <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1">
                Included Report Sections
              </label>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(includedSections).map(([key, value]) => (
                  <label key={key} className="flex items-center gap-2.5 text-xs text-text cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={value}
                      onChange={(e) =>
                        setIncludedSections((prev) => ({
                          ...prev,
                          [key]: e.target.checked,
                        }))
                      }
                      className="rounded border-line bg-panel text-accent focus:ring-accent h-4 w-4 transition cursor-pointer"
                    />
                    <span className="capitalize">
                      {key.replace(/([A-Z])/g, " $1")}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Live Preview / Stats Summary Card */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card title="WBS Scope Total" value={`${filteredWbsRows.length} Lines`} />
          <Card
            title="Actual Cost (staged)"
            value={formatCurrency(
              filteredWbsRows.reduce((sum, r) => sum + (r.actual_cost_to_date || 0), 0)
            )}
          />
          <Card
            title="Recognized Revenue"
            value={formatCurrency(
              filteredWbsRows.reduce((sum, r) => sum + (r.recognized_revenue_to_date || 0), 0)
            )}
            tone="accent"
          />
          <Card
            title="Exception Warnings"
            value={`${filteredRisks.length} Alerts`}
            tone={filteredRisks.length > 0 ? "warning" : "default"}
          />
        </div>

        {/* Generate and Export triggers */}
        <div className="surface-card p-6 border border-line bg-panel/30 rounded-3xl flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-text">Export Performance Report</h4>
            <p className="text-xs text-muted">
              Select PDF to print/save vector reports, or Excel workbook for tabular data audits.
            </p>
          </div>

          <div className="flex gap-3 w-full sm:w-auto">
            {/* Generate Excel Button */}
            <button
              onClick={handleExportExcel}
              disabled={isExportingExcel || isPrinting}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-xl bg-accent text-white px-5 py-3 text-xs font-semibold shadow hover:bg-accent-hover active:scale-[0.98] transition disabled:opacity-60 disabled:pointer-events-none"
            >
              {isExportingExcel ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4" />
              )}
              {isExportingExcel ? "Generating Excel..." : "Export Excel"}
            </button>

            {/* Generate PDF Button */}
            <button
              onClick={handlePrintPdf}
              disabled={isExportingExcel || isPrinting}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-xl border border-line bg-panel px-5 py-3 text-xs font-semibold text-text hover:bg-panel2/80 active:scale-[0.98] transition disabled:opacity-60 disabled:pointer-events-none"
            >
              {isPrinting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Printer className="h-4 w-4" />
              )}
              {isPrinting ? "Printing PDF..." : "Generate PDF"}
            </button>
          </div>
        </div>

        {/* Report Preview Outline List */}
        <div className="surface-card p-6 border border-line bg-panel/30 rounded-3xl space-y-4">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-muted">
            Report Scope Preview Contents
          </h4>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs text-text border-b border-line/20 pb-2">
              <span className="flex items-center gap-2.5 font-bold">
                <FileText className="h-4 w-4 text-accent" />
                Cover Page
              </span>
              <span className={includedSections.coverPage ? "text-success font-semibold" : "text-muted"}>
                {includedSections.coverPage ? "Included" : "Excluded"}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-text border-b border-line/20 pb-2">
              <span className="flex items-center gap-2.5 font-bold">
                <CheckCircle2 className="h-4 w-4 text-accent" />
                Executive KPI Cards
              </span>
              <span className={includedSections.kpiSummary ? "text-success font-semibold" : "text-muted"}>
                {includedSections.kpiSummary ? "Included" : "Excluded"}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-text border-b border-line/20 pb-2">
              <span className="flex items-center gap-2.5 font-bold">
                <Database className="h-4 w-4 text-accent" />
                Detailed WBS Cost & Revenue
              </span>
              <span className={includedSections.wbsTable ? "text-success font-semibold" : "text-muted"}>
                {includedSections.wbsTable ? `Included (${filteredWbsRows.length} items)` : "Excluded"}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-text border-b border-line/20 pb-2">
              <span className="flex items-center gap-2.5 font-bold">
                <FileDown className="h-4 w-4 text-accent" />
                Subcontractor PO Commits
              </span>
              <span className={includedSections.poTable ? "text-success font-semibold" : "text-muted"}>
                {includedSections.poTable ? `Included (${filteredSubcontracts.length} items)` : "Excluded"}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-text border-b border-line/20 pb-2">
              <span className="flex items-center gap-2.5 font-bold">
                <AlertTriangle className="h-4 w-4 text-accent" />
                Control Exceptions / Risks
              </span>
              <span className={includedSections.risksTable ? "text-success font-semibold" : "text-muted"}>
                {includedSections.risksTable ? `Included (${filteredRisks.length} alerts)` : "Excluded"}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-text">
              <span className="flex items-center gap-2.5 font-bold">
                <FileText className="h-4 w-4 text-accent" />
                PM Site Progress Logs
              </span>
              <span className={includedSections.updatesLog ? "text-success font-semibold" : "text-muted"}>
                {includedSections.updatesLog ? `Included (${filteredDailyUpdates.length} logs)` : "Excluded"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
