"use client";

import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { PageShell, Card, StatRow } from "./ui";
import { formatCurrency, formatPercent } from "@/lib/utils";
import PrintReportLayout from "./print-report-layout";
import { FileDown, Printer, Loader2, CheckCircle2, AlertTriangle, FileText, Database, Calendar } from "lucide-react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

type PeriodPreset = "all" | "this_month" | "last_3_months" | "last_6_months" | "this_year" | "last_year" | "custom";

function getDateRange(preset: PeriodPreset): { from: Date | null; to: Date | null } {
  if (preset === "all") return { from: null, to: null };
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  let from: Date;
  switch (preset) {
    case "this_month":
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "last_3_months":
      from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      break;
    case "last_6_months":
      from = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      break;
    case "this_year":
      from = new Date(now.getFullYear(), 0, 1);
      break;
    case "last_year":
      from = new Date(now.getFullYear() - 1, 0, 1);
      return { from, to: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59) };
    default:
      return { from: null, to: null };
  }
  return { from, to };
}

function isInRange(dateStr: string | null | undefined, from: Date | null, to: Date | null): boolean {
  if (!from && !to) return true;
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

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
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
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

  // Filter logic based on project scope + period selection
  const selectedProject = selectedProjectId === "all" ? null : projects.find((p) => String(p.id) === selectedProjectId);

  const { from: periodFrom, to: periodTo } = periodPreset === "custom"
    ? { from: customFrom ? new Date(customFrom + "T00:00:00") : null, to: customTo ? new Date(customTo + "T23:59:59") : null }
    : getDateRange(periodPreset);

  const matchesProject = (projectId: any) => {
    if (!selectedProject) return true;
    return String(projectId) === String(selectedProject.id);
  };

  const filteredWbsRows = allWbsRows.filter((row) => matchesProject(row.project_id));

  // Determine which cost/revenue fields to use based on period
  type CostField = "actual_cost_to_date" | "mtd_actual_cost" | "ytd_actual_cost";
  type RevenueField = "recognized_revenue_to_date" | "mtd_revenue_recognition" | "ytd_revenue_recognition";
  type MarginField = "ytd_margin" | "mtd_margin";

  const costField: CostField =
    periodPreset === "this_month" ? "mtd_actual_cost"
    : periodPreset === "this_year" ? "ytd_actual_cost"
    : "actual_cost_to_date";

  const revenueField: RevenueField =
    periodPreset === "this_month" ? "mtd_revenue_recognition"
    : periodPreset === "this_year" ? "ytd_revenue_recognition"
    : "recognized_revenue_to_date";

  const periodLabel =
    periodPreset === "this_month" ? "MTD"
    : periodPreset === "this_year" ? "YTD"
    : "To Date";

  const filteredSubcontracts = allSubcontracts.filter((sub) =>
    matchesProject(sub.project_id) && isInRange(sub.created_at, periodFrom, periodTo)
  );

  const filteredDailyUpdates = allDailyUpdates.filter((up) =>
    matchesProject(up.project_id) && isInRange(up.reported_date || up.created_at, periodFrom, periodTo)
  );

  const filteredRisks = allRisks.filter((risk) =>
    matchesProject(risk.project_id) && isInRange(risk.created_at, periodFrom, periodTo)
  );

  const printRef = useRef<HTMLDivElement>(null);

  // PDF generation logic
  useEffect(() => {
    if (!isPrinting) return;
    let cancelled = false;

    (async () => {
      try {
        const el = printRef.current;
        if (!el) return;

        const inner = el.querySelector(".print-only") as HTMLElement | null;
        if (inner) inner.style.display = "block";

        const canvas = await html2canvas(el, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: "#ffffff",
        });

        if (inner) inner.style.display = "";

        if (cancelled) return;

        const imgWidth = 210; // A4 width in mm
        const pageHeight = 297; // A4 height in mm
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        const pdf = new jsPDF("p", "mm", "a4");
        const pageCanvas = document.createElement("canvas");
        const pageCtx = pageCanvas.getContext("2d")!;
        const pxPerPage = Math.floor(canvas.width * (pageHeight / imgWidth));
        let srcY = 0;
        let page = 0;

        while (srcY < canvas.height) {
          const sliceH = Math.min(pxPerPage, canvas.height - srcY);
          pageCanvas.width = canvas.width;
          pageCanvas.height = sliceH;
          pageCtx.fillStyle = "#ffffff";
          pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
          pageCtx.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

          const sliceData = pageCanvas.toDataURL("image/jpeg", 0.92);
          const sliceImgH = (sliceH * imgWidth) / canvas.width;

          if (page > 0) pdf.addPage();
          pdf.addImage(sliceData, "JPEG", 0, 0, imgWidth, sliceImgH);

          srcY += sliceH;
          page++;
        }

        const projectName = selectedProject ? selectedProject.project_code : "Portfolio";
        const dateStr = new Date().toISOString().slice(0, 10);
        pdf.save(`${projectName}_Report_${dateStr}.pdf`);
      } catch (err) {
        console.error("PDF generation failed", err);
      } finally {
        if (!cancelled) setIsPrinting(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isPrinting, selectedProject]);

  // Excel generation logic using XLSX (SheetJS)
  const handleExportExcel = () => {
    setIsExportingExcel(true);
    try {
      const projectName = selectedProject ? selectedProject.project_name : "All Projects Portfolio";
      const codeLabel = selectedProject ? selectedProject.project_code : "Global";

      // 1. Create Summary Tab
      const actualCost = filteredWbsRows.reduce((sum, r) => sum + (r[costField] || 0), 0);
      const plannedCost = filteredWbsRows.reduce((sum, r) => sum + (r.planned_cost || 0), 0);
      const plannedRevenue = filteredWbsRows.reduce((sum, r) => sum + (r.planned_revenue || 0), 0);
      const recognizedRevenue = filteredWbsRows.reduce((sum, r) => sum + (r[revenueField] || 0), 0);

      const summaryData = [
        ["DETASAD - Project Performance Report Summary"],
        [],
        ["Project Scope Name", projectName],
        ["Project Scope Code", codeLabel],
        ["Reporting Period", periodLabel],
        ["Report Generation Date", new Date().toLocaleDateString()],
        [],
        ["Key Indicators Summary"],
        ["Planned Revenue", plannedRevenue],
        ["Planned Cost", plannedCost],
        [`Actual Cost (${periodLabel})`, actualCost],
        [`Recognized Revenue (${periodLabel})`, recognizedRevenue],
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
          [`Actual Cost (${periodLabel})`]: r[costField] || 0,
          "Planned Revenue": r.planned_revenue || 0,
          [`Recognized Revenue (${periodLabel})`]: r[revenueField] || 0,
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
      {/* Offscreen container for PDF capture */}
      <div
        ref={printRef}
        style={{ position: "fixed", left: 0, top: 0, width: "1100px", zIndex: -9999, opacity: 0, pointerEvents: "none", overflow: "hidden" }}
      >
        <PrintReportLayout
          project={selectedProject}
          revenueRows={filteredWbsRows}
          subcontracts={filteredSubcontracts}
          dailyUpdates={filteredDailyUpdates}
          risks={filteredRisks}
          includedSections={includedSections}
        />
      </div>

      {/* Standard interactive builder layout (Hidden during browser printing) */}
      <div className="space-y-6 no-print">
        <div className="surface-card p-6 border border-line bg-panel/30 rounded-3xl">
          <h3 className="text-sm font-bold text-text uppercase tracking-wider mb-4 flex items-center gap-2">
            <Database className="h-4 w-4 text-accent" />
            Report Parameters & Scope
          </h3>

          <div className="grid gap-6 md:grid-cols-3">
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
                    {p.project_code} - {p.project_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Period Filter */}
            <div className="space-y-2 border-l border-line/45 pl-6">
              <label className="block text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Reporting Period
              </label>
              <select
                value={periodPreset}
                onChange={(e) => setPeriodPreset(e.target.value as PeriodPreset)}
                className="w-full rounded-xl border border-line bg-panel px-4 py-3 text-xs text-text outline-none focus:border-accent transition shadow-sm"
              >
                <option value="all">All Time</option>
                <option value="this_month">This Month</option>
                <option value="last_3_months">Last 3 Months</option>
                <option value="last_6_months">Last 6 Months</option>
                <option value="this_year">This Year</option>
                <option value="last_year">Last Year</option>
                <option value="custom">Custom Range</option>
              </select>
              {periodPreset === "custom" && (
                <div className="flex gap-2 mt-2">
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-xs text-text outline-none focus:border-accent transition shadow-sm"
                  />
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-xs text-text outline-none focus:border-accent transition shadow-sm"
                  />
                </div>
              )}
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
            title={`Actual Cost (${periodLabel})`}
            value={formatCurrency(
              filteredWbsRows.reduce((sum, r) => sum + (r[costField] || 0), 0)
            )}
          />
          <Card
            title={`Recognized Revenue (${periodLabel})`}
            value={formatCurrency(
              filteredWbsRows.reduce((sum, r) => sum + (r[revenueField] || 0), 0)
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
              {isPrinting ? "Generating PDF..." : "Generate PDF"}
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
