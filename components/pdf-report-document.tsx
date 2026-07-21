"use client";

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { formatCurrency, formatPercent } from "@/lib/utils";

const BRAND = "#005B7F";
const BRAND_LIGHT = "#e8f4f8";
const DARK = "#0f172a";
const GRAY = "#475569";
const GRAY_LIGHT = "#94a3b8";
const BORDER = "#cbd5e1";
const BG_ALT = "#f8fafc";
const RED = "#b91c1c";
const GREEN = "#15803d";

const s = StyleSheet.create({
  page: { paddingTop: 70, paddingBottom: 60, paddingHorizontal: 40, fontSize: 8.5, fontFamily: "Helvetica", color: DARK },

  // Page header (fixed on every page except cover)
  pageHeader: { position: "absolute", top: 0, left: 0, right: 0, height: 50, backgroundColor: BRAND, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 40 },
  pageHeaderTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#ffffff", letterSpacing: 1.5, textTransform: "uppercase" },
  pageHeaderRight: { fontSize: 7, color: "#ffffff", opacity: 0.8 },

  // Page footer
  pageFooter: { position: "absolute", bottom: 0, left: 0, right: 0, height: 40, borderTopWidth: 1, borderTopColor: BORDER, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 40 },
  pageFooterLeft: { fontSize: 7, color: GRAY_LIGHT },
  pageFooterRight: { fontSize: 7, color: GRAY_LIGHT },

  // Cover
  coverPage: { flex: 1, justifyContent: "space-between" },
  coverStripe: { position: "absolute", top: 0, left: 0, right: 0, height: 8, backgroundColor: BRAND },
  coverTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginTop: 20 },
  coverBrand: { fontSize: 28, fontFamily: "Helvetica-Bold", letterSpacing: 5, color: BRAND },
  coverBrandSub: { fontSize: 8, fontFamily: "Helvetica-Bold", letterSpacing: 5, color: GRAY_LIGHT, textTransform: "uppercase", marginTop: 3 },
  coverConfBadge: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: RED, backgroundColor: "#fef2f2", padding: "3 10", borderRadius: 2, textTransform: "uppercase", letterSpacing: 2, borderWidth: 0.5, borderColor: "#fecaca" },
  coverCenter: { alignItems: "center", gap: 14 },
  coverLine: { width: 60, height: 2, backgroundColor: BRAND, marginBottom: 4 },
  coverLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", letterSpacing: 5, color: GRAY_LIGHT, textTransform: "uppercase" },
  coverProjectName: { fontSize: 26, fontFamily: "Helvetica-Bold", color: DARK, textAlign: "center", maxWidth: 420 },
  coverMeta: { flexDirection: "row", gap: 30, marginTop: 6 },
  coverMetaItem: { alignItems: "center" },
  coverMetaLabel: { fontSize: 7, color: GRAY_LIGHT, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 },
  coverMetaValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: DARK },
  coverBottom: { borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  coverBottomText: { fontSize: 7.5, color: GRAY_LIGHT },
  coverBottomValue: { fontFamily: "Helvetica-Bold", color: GRAY },
  coverBottomStripe: { position: "absolute", bottom: 0, left: 0, right: 0, height: 4, backgroundColor: BRAND },

  // Section header
  sectionBar: { backgroundColor: BRAND, height: 3, width: 40, marginBottom: 6 },
  sectionTitle: { fontSize: 13, fontFamily: "Helvetica-Bold", color: DARK, textTransform: "uppercase", letterSpacing: 0.8 },
  sectionSub: { fontSize: 8, color: GRAY, marginTop: 2, marginBottom: 14 },

  // KPI row
  kpiRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  kpiCard: { flex: 1, borderWidth: 1, borderColor: BORDER, borderRadius: 4, padding: "10 12", backgroundColor: "#ffffff" },
  kpiCardAccent: { flex: 1, borderWidth: 1.5, borderColor: BRAND, borderRadius: 4, padding: "10 12", backgroundColor: BRAND_LIGHT },
  kpiLabel: { fontSize: 6.5, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1.2, color: GRAY_LIGHT, marginBottom: 4 },
  kpiLabelAccent: { fontSize: 6.5, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1.2, color: BRAND, marginBottom: 4 },
  kpiVal: { fontSize: 15, fontFamily: "Helvetica-Bold", color: DARK },
  kpiValAccent: { fontSize: 15, fontFamily: "Helvetica-Bold", color: BRAND },
  kpiSm: { fontSize: 8, fontFamily: "Helvetica", color: GRAY },

  // Summary narrative
  narrativeBox: { backgroundColor: BG_ALT, borderLeftWidth: 3, borderLeftColor: BRAND, padding: 12, marginTop: 6, marginBottom: 8 },
  narrativeTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1, color: BRAND, marginBottom: 4 },
  narrativeText: { fontSize: 8.5, color: GRAY, lineHeight: 1.7 },
  narrativeBold: { fontFamily: "Helvetica-Bold", color: DARK },

  // Tables
  table: { marginTop: 2 },
  tHead: { flexDirection: "row", backgroundColor: BRAND, paddingVertical: 6, paddingHorizontal: 4 },
  th: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#ffffff", textTransform: "uppercase", letterSpacing: 0.5 },
  tRow: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0" },
  tRowAlt: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", backgroundColor: BG_ALT },
  td: { fontSize: 8, color: DARK },
  tdMono: { fontSize: 7.5, color: DARK, fontFamily: "Courier" },
  tdGray: { fontSize: 8, color: GRAY },
  tdRight: { fontSize: 7.5, color: DARK, fontFamily: "Courier", textAlign: "right" },
  tdRed: { fontSize: 8, color: RED, fontFamily: "Helvetica-Bold" },
  tdRedRight: { fontSize: 7.5, color: RED, fontFamily: "Courier-Bold", textAlign: "right" },
  tableTotal: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 4, borderTopWidth: 1.5, borderTopColor: BRAND, backgroundColor: BRAND_LIGHT },
  tableTotalLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: BRAND },
  tableTotalVal: { fontSize: 8, fontFamily: "Courier-Bold", color: BRAND, textAlign: "right" },

  // Empty / success states
  emptyText: { fontSize: 9, color: GRAY_LIGHT, fontStyle: "italic", paddingVertical: 20, textAlign: "center" },
  successBox: { backgroundColor: "#f0fdf4", borderWidth: 1, borderColor: "#86efac", borderRadius: 4, padding: 14, flexDirection: "row", alignItems: "center", gap: 8 },
  successDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: GREEN },
  successText: { fontSize: 9, color: GREEN, fontFamily: "Helvetica-Bold" },

  // Update cards
  updateCard: { borderWidth: 1, borderColor: BORDER, borderRadius: 4, marginBottom: 6, overflow: "hidden" },
  updateCardHeader: { flexDirection: "row", justifyContent: "space-between", backgroundColor: BG_ALT, paddingVertical: 5, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: BORDER },
  updateWbs: { fontSize: 8, fontFamily: "Courier-Bold", color: DARK },
  updateDate: { fontSize: 7.5, color: GRAY_LIGHT },
  updateBody: { padding: 10, gap: 4 },
  updateRow: { flexDirection: "row", gap: 24 },
  updateLabel: { fontSize: 8, color: GRAY },
  updateVal: { fontFamily: "Helvetica-Bold", color: DARK },
  updateComment: { fontSize: 8, color: GRAY, fontStyle: "italic", backgroundColor: "#fafafa", padding: 8, borderRadius: 3, borderWidth: 0.5, borderColor: "#e2e8f0", marginTop: 2 },
});

interface Props {
  project: any;
  revenueRows: any[];
  subcontracts: any[];
  dailyUpdates: any[];
  risks: any[];
  includedSections: { coverPage: boolean; kpiSummary: boolean; wbsTable: boolean; poTable: boolean; risksTable: boolean; updatesLog: boolean };
  periodLabel: string;
  costField: string;
  revenueField: string;
}

function Header({ projectCode }: { projectCode: string }) {
  return (
    <View style={s.pageHeader} fixed>
      <Text style={s.pageHeaderTitle}>DETASAD — Project Performance Report</Text>
      <Text style={s.pageHeaderRight}>{projectCode}</Text>
    </View>
  );
}

function Footer({ reportDate }: { reportDate: string }) {
  return (
    <View style={s.pageFooter} fixed>
      <Text style={s.pageFooterLeft}>Generated {reportDate} — Detasad Projects Dashboard</Text>
      <Text style={s.pageFooterRight} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

function SectionHead({ number, title, subtitle }: { number: string; title: string; subtitle: string }) {
  return (
    <View>
      <View style={s.sectionBar} />
      <Text style={s.sectionTitle}>{number}. {title}</Text>
      <Text style={s.sectionSub}>{subtitle}</Text>
    </View>
  );
}

export default function PdfReportDocument({ project, revenueRows, subcontracts, dailyUpdates, risks, includedSections, periodLabel, costField, revenueField }: Props) {
  const isGlobal = !project;
  const projectName = isGlobal ? "All Active Projects Portfolio" : project.project_name;
  const projectCode = isGlobal ? "Global Portfolio" : project.project_code;
  const now = new Date();
  const reportDate = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const reportTime = now.toLocaleTimeString("en-US", { hour12: false });

  const actualCost = revenueRows.reduce((t: number, r: any) => t + (r[costField] || 0), 0);
  const plannedCost = revenueRows.reduce((t: number, r: any) => t + (r.planned_cost || 0), 0);
  const plannedRevenue = revenueRows.reduce((t: number, r: any) => t + (r.planned_revenue || 0), 0);
  const recognizedRevenue = revenueRows.reduce((t: number, r: any) => t + (r[revenueField] || 0), 0);
  const margin = recognizedRevenue - actualCost;
  const marginPct = recognizedRevenue > 0 ? (margin / recognizedRevenue) * 100 : 0;
  const variance = plannedCost - actualCost;

  const totalPlannedCostWbs = revenueRows.reduce((t: number, r: any) => t + (r.planned_cost || 0), 0);
  const totalActualCostWbs = revenueRows.reduce((t: number, r: any) => t + (r[costField] || 0), 0);
  const totalRecRevWbs = revenueRows.reduce((t: number, r: any) => t + (r[revenueField] || 0), 0);

  const sectionNum = { current: 0 };
  const nextNum = () => String(++sectionNum.current);

  return (
    <Document title={`${projectCode} Performance Report`} author="DETASAD" subject="Project Performance Report">

      {/* ── COVER ── */}
      {includedSections.coverPage && (
        <Page size="A4" style={{ padding: 40, fontSize: 8.5, fontFamily: "Helvetica", color: DARK }}>
          <View style={s.coverStripe} />
          <View style={s.coverPage}>
            <View style={s.coverTopRow}>
              <View>
                <Text style={s.coverBrand}>DETASAD</Text>
                <Text style={s.coverBrandSub}>Detecon Al Saudia</Text>
              </View>
              <Text style={s.coverConfBadge}>Confidential</Text>
            </View>

            <View style={s.coverCenter}>
              <View style={s.coverLine} />
              <Text style={s.coverLabel}>Project Performance Report</Text>
              <Text style={s.coverProjectName}>{projectName}</Text>
              <View style={s.coverMeta}>
                <View style={s.coverMetaItem}>
                  <Text style={s.coverMetaLabel}>Project Code</Text>
                  <Text style={s.coverMetaValue}>{projectCode}</Text>
                </View>
                <View style={s.coverMetaItem}>
                  <Text style={s.coverMetaLabel}>Period</Text>
                  <Text style={s.coverMetaValue}>{periodLabel}</Text>
                </View>
                <View style={s.coverMetaItem}>
                  <Text style={s.coverMetaLabel}>WBS Lines</Text>
                  <Text style={s.coverMetaValue}>{revenueRows.length}</Text>
                </View>
              </View>
            </View>

            <View style={s.coverBottom}>
              <View>
                <Text style={s.coverBottomText}>Report Date: <Text style={s.coverBottomValue}>{reportDate}</Text></Text>
                <Text style={s.coverBottomText}>Time: <Text style={s.coverBottomValue}>{reportTime}</Text></Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={s.coverBottomText}>System: <Text style={s.coverBottomValue}>Detasad Projects Dashboard</Text></Text>
                <Text style={s.coverBottomText}>Classification: <Text style={{ fontFamily: "Helvetica-Bold", color: RED }}>Confidential</Text></Text>
              </View>
            </View>
          </View>
          <View style={s.coverBottomStripe} />
        </Page>
      )}

      {/* ── KPI SUMMARY ── */}
      {includedSections.kpiSummary && (
        <Page size="A4" style={s.page}>
          <Header projectCode={projectCode} />
          <SectionHead number={nextNum()} title="Executive KPI Summary" subtitle="Overview of key commercial and cost variances for the reporting period." />

          <View style={s.kpiRow}>
            <View style={s.kpiCard}>
              <Text style={s.kpiLabel}>Planned Cost</Text>
              <Text style={s.kpiVal}>{formatCurrency(plannedCost)}</Text>
            </View>
            <View style={s.kpiCardAccent}>
              <Text style={s.kpiLabelAccent}>Actual Cost ({periodLabel})</Text>
              <Text style={s.kpiValAccent}>{formatCurrency(actualCost)}</Text>
            </View>
          </View>
          <View style={s.kpiRow}>
            <View style={s.kpiCardAccent}>
              <Text style={s.kpiLabelAccent}>Recognized Revenue ({periodLabel})</Text>
              <Text style={s.kpiValAccent}>{formatCurrency(recognizedRevenue)}</Text>
            </View>
            <View style={s.kpiCard}>
              <Text style={s.kpiLabel}>Gross Margin</Text>
              <Text style={[s.kpiVal, margin < 0 ? { color: RED } : {}]}>
                {formatCurrency(margin)} <Text style={s.kpiSm}>({formatPercent(marginPct)})</Text>
              </Text>
            </View>
          </View>
          <View style={s.kpiRow}>
            <View style={s.kpiCard}>
              <Text style={s.kpiLabel}>Planned Revenue</Text>
              <Text style={s.kpiVal}>{formatCurrency(plannedRevenue)}</Text>
            </View>
            <View style={s.kpiCard}>
              <Text style={s.kpiLabel}>Cost Variance (Plan vs Actual)</Text>
              <Text style={[s.kpiVal, variance < 0 ? { color: RED } : { color: GREEN }]}>{formatCurrency(variance)}</Text>
            </View>
          </View>

          <View style={s.narrativeBox}>
            <Text style={s.narrativeTitle}>Performance Narrative</Text>
            <Text style={s.narrativeText}>
              The project scope <Text style={s.narrativeBold}>{projectCode}</Text> has a planned commercial ceiling of{" "}
              <Text style={s.narrativeBold}>{formatCurrency(plannedRevenue)}</Text>. Revenue recognized ({periodLabel.toLowerCase()}) stands at{" "}
              <Text style={s.narrativeBold}>{formatCurrency(recognizedRevenue)}</Text>, against actual costs of{" "}
              <Text style={s.narrativeBold}>{formatCurrency(actualCost)}</Text>, yielding a gross margin of{" "}
              <Text style={s.narrativeBold}>{formatCurrency(margin)} ({formatPercent(marginPct)})</Text>. The cost variance between planned baseline and actuals is{" "}
              <Text style={s.narrativeBold}>{formatCurrency(variance)}</Text>.
            </Text>
          </View>

          <Footer reportDate={reportDate} />
        </Page>
      )}

      {/* ── WBS TABLE ── */}
      {includedSections.wbsTable && (
        <Page size="A4" style={s.page} wrap>
          <Header projectCode={projectCode} />
          <SectionHead number={nextNum()} title="WBS Performance Breakdown" subtitle={`Planned vs actual metrics by WBS element — ${revenueRows.length} active lines.`} />

          <View style={s.table}>
            <View style={s.tHead} fixed>
              <Text style={[s.th, { width: "28%" }]}>WBS Code</Text>
              <Text style={[s.th, { width: "22%" }]}>Description</Text>
              <Text style={[s.th, { width: "17%", textAlign: "right" }]}>Planned Cost</Text>
              <Text style={[s.th, { width: "17%", textAlign: "right" }]}>Actual Cost</Text>
              <Text style={[s.th, { width: "16%", textAlign: "right" }]}>Rec. Revenue</Text>
            </View>
            {revenueRows.map((row: any, i: number) => (
              <View key={i} style={i % 2 === 0 ? s.tRow : s.tRowAlt} wrap={false}>
                <Text style={[s.tdMono, { width: "28%" }]}>{row.wbs_code}</Text>
                <Text style={[s.tdGray, { width: "22%" }]}>{row.link_name || "—"}</Text>
                <Text style={[s.tdRight, { width: "17%" }]}>{formatCurrency(row.planned_cost)}</Text>
                <Text style={[s.tdRight, { width: "17%" }]}>{formatCurrency(row[costField])}</Text>
                <Text style={[s.tdRight, { width: "16%" }]}>{formatCurrency(row[revenueField])}</Text>
              </View>
            ))}
            <View style={s.tableTotal}>
              <Text style={[s.tableTotalLabel, { width: "50%" }]}>Total ({revenueRows.length} lines)</Text>
              <Text style={[s.tableTotalVal, { width: "17%" }]}>{formatCurrency(totalPlannedCostWbs)}</Text>
              <Text style={[s.tableTotalVal, { width: "17%" }]}>{formatCurrency(totalActualCostWbs)}</Text>
              <Text style={[s.tableTotalVal, { width: "16%" }]}>{formatCurrency(totalRecRevWbs)}</Text>
            </View>
          </View>

          <Footer reportDate={reportDate} />
        </Page>
      )}

      {/* ── SUBCONTRACTOR POs ── */}
      {includedSections.poTable && (
        <Page size="A4" style={s.page} wrap>
          <Header projectCode={projectCode} />
          <SectionHead number={nextNum()} title="Subcontractor PO Commitments" subtitle="Commitment and actual expenditures by Purchasing Document." />

          {subcontracts.length > 0 ? (
            <View style={s.table}>
              <View style={s.tHead} fixed>
                <Text style={[s.th, { width: "22%" }]}>PO Number</Text>
                <Text style={[s.th, { width: "33%" }]}>Package Name</Text>
                <Text style={[s.th, { width: "15%" }]}>WBS Ref</Text>
                <Text style={[s.th, { width: "15%", textAlign: "right" }]}>Committed</Text>
                <Text style={[s.th, { width: "15%", textAlign: "right" }]}>Actual Spent</Text>
              </View>
              {subcontracts.map((sub: any, i: number) => (
                <View key={i} style={i % 2 === 0 ? s.tRow : s.tRowAlt} wrap={false}>
                  <Text style={[s.tdMono, { width: "22%" }]}>{sub.purchasing_document || "—"}</Text>
                  <Text style={[s.tdGray, { width: "33%" }]}>{sub.package_name || "—"}</Text>
                  <Text style={[s.tdMono, { width: "15%" }]}>{sub.wbs_code || "—"}</Text>
                  <Text style={[s.tdRight, { width: "15%" }]}>{formatCurrency(sub.committed_amount)}</Text>
                  <Text style={[s.tdRight, { width: "15%" }]}>{formatCurrency(sub.actual_spent || 0)}</Text>
                </View>
              ))}
              <View style={s.tableTotal}>
                <Text style={[s.tableTotalLabel, { width: "70%" }]}>Total ({subcontracts.length} POs)</Text>
                <Text style={[s.tableTotalVal, { width: "15%" }]}>{formatCurrency(subcontracts.reduce((t: number, x: any) => t + (x.committed_amount || 0), 0))}</Text>
                <Text style={[s.tableTotalVal, { width: "15%" }]}>{formatCurrency(subcontracts.reduce((t: number, x: any) => t + (x.actual_spent || 0), 0))}</Text>
              </View>
            </View>
          ) : (
            <Text style={s.emptyText}>No subcontractor contracts registered for this project scope.</Text>
          )}

          <Footer reportDate={reportDate} />
        </Page>
      )}

      {/* ── RISKS ── */}
      {includedSections.risksTable && (
        <Page size="A4" style={s.page} wrap>
          <Header projectCode={projectCode} />
          <SectionHead number={nextNum()} title="Cost Control Exceptions" subtitle={`Active alerts where actual spending exceeds planned thresholds — ${risks.length} alerts.`} />

          {risks.length > 0 ? (
            <View style={s.table}>
              <View style={s.tHead} fixed>
                <Text style={[s.th, { width: "28%" }]}>WBS Code</Text>
                <Text style={[s.th, { width: "45%" }]}>Exception Reason</Text>
                <Text style={[s.th, { width: "27%", textAlign: "right" }]}>Cost Variance</Text>
              </View>
              {risks.map((risk: any, i: number) => (
                <View key={i} style={i % 2 === 0 ? s.tRow : s.tRowAlt} wrap={false}>
                  <Text style={[s.tdMono, { width: "28%" }]}>{risk.wbs_code || "—"}</Text>
                  <Text style={[s.tdRed, { width: "45%" }]}>{risk.description}</Text>
                  <Text style={[s.tdRedRight, { width: "27%" }]}>{formatCurrency(risk.variance || 0)}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={s.successBox}>
              <View style={s.successDot} />
              <Text style={s.successText}>No budget overruns or exceptions detected across the selected scope.</Text>
            </View>
          )}

          <Footer reportDate={reportDate} />
        </Page>
      )}

      {/* ── DAILY UPDATES ── */}
      {includedSections.updatesLog && (
        <Page size="A4" style={s.page} wrap>
          <Header projectCode={projectCode} />
          <SectionHead number={nextNum()} title="Project Manager Daily Site Log" subtitle={`Latest progress updates from site operations — ${dailyUpdates.length} entries.`} />

          {dailyUpdates.length > 0 ? (
            <View>
              {dailyUpdates.map((up: any, i: number) => {
                const dateStr = up.reported_date || up.created_at;
                const d = dateStr ? new Date(dateStr) : null;
                const fmt = d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : "N/A";
                return (
                  <View key={i} style={s.updateCard} wrap={false}>
                    <View style={s.updateCardHeader}>
                      <Text style={s.updateWbs}>{up.wbs_code}</Text>
                      <Text style={s.updateDate}>{fmt}</Text>
                    </View>
                    <View style={s.updateBody}>
                      <View style={s.updateRow}>
                        <Text style={s.updateLabel}>Milestone: <Text style={s.updateVal}>{up.milestone_title || "N/A"}</Text></Text>
                        <Text style={s.updateLabel}>Progress: <Text style={s.updateVal}>{up.progress_percent ?? 0}%</Text></Text>
                      </View>
                      {up.comments ? <Text style={s.updateComment}>"{up.comments}"</Text> : null}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={s.emptyText}>No daily site logs reported for the active scope.</Text>
          )}

          <Footer reportDate={reportDate} />
        </Page>
      )}
    </Document>
  );
}
