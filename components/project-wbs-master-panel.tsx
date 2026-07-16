"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { surfaceCard } from "@/components/ui";
import type { ProjectWbsMaster } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  projectId: string;
  rows: ProjectWbsMaster[];
  canEdit?: boolean;
};

type EditableRow = ProjectWbsMaster & { localId: string };

export function ProjectWbsMasterPanel({ projectId, rows, canEdit = true }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [message, setMessage] = useState("");
  const [items, setItems] = useState<EditableRow[]>(() => mapRowsToEditable(rows));

  useEffect(() => {
    setItems(mapRowsToEditable(rows));
  }, [rows]);

  const stats = useMemo(() => {
    const revenueCount = items.filter((item) => item.is_revenue_generating && item.is_active).length;
    const costCount = items.filter((item) => item.include_in_cost && item.is_active).length;
    const excludedCount = items.filter((item) => !item.is_revenue_generating && !item.include_in_cost).length;
    return { revenueCount, costCount, excludedCount };
  }, [items]);

  function updateRow(localId: string, key: keyof EditableRow, value: string | boolean) {
    setItems((current) => current.map((row) => (row.localId === localId ? { ...row, [key]: value } : row)));
  }

  async function saveRows() {
    setSaving(true);
    setMessage("");

    const response = await fetch("/api/project-wbs-master", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        rows: items.map(({ wbs_code, wbs_description, is_revenue_generating, include_in_cost, is_active, remarks }) => ({
          wbs_code,
          wbs_description,
          is_revenue_generating,
          include_in_cost,
          is_active,
          remarks,
        })),
      }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setSaving(false);
      setMessage(payload.error ?? "Unable to save WBS configuration.");
      return;
    }

    setMessage("WBS configuration saved. Recalculating financials...");
    const recalcResponse = await fetch("/api/financial-sources/recalculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId }),
    });
    const recalcPayload = await recalcResponse.json().catch(() => ({}));
    setSaving(false);

    if (!recalcResponse.ok) {
      setMessage(recalcPayload.error ?? "WBS configuration saved, but financial recalculation failed.");
      return;
    }

    setMessage(`WBS configuration saved. Recalculated ${recalcPayload.rowCount ?? 0} financial WBS row(s).`);
    window.location.reload();
  }

  async function recalculateRows() {
    setRecalculating(true);
    setMessage("");

    const response = await fetch("/api/financial-sources/recalculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId }),
    });
    const payload = await response.json().catch(() => ({}));
    setRecalculating(false);

    if (!response.ok) {
      setMessage(payload.error ?? "Unable to recalculate financial data.");
      return;
    }

    setMessage(`Recalculated ${payload.rowCount ?? 0} WBS row(s) from the current source data.`);
    window.location.reload();
  }

  return (
    <div className={cn("space-y-6 p-6", surfaceCard)}>
      <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between border-b border-line/30 pb-5">
        <div>
          <div className="section-kicker text-accent font-bold tracking-[0.12em]">WBS Configuration</div>
          <h3 className="mt-1 text-lg font-bold text-text">WBS Master Configuration</h3>
          <p className="mt-1 text-xs text-muted/90 font-medium">
            Control how each WBS contributes to revenue recognition, cost calculations, and project progress logic.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 shrink-0">
          <SummaryCard label="Total WBS" value={String(items.length)} tone="default" />
          <SummaryCard label="Revenue WBS" value={String(stats.revenueCount)} tone="accent" />
          <SummaryCard label="Cost WBS" value={String(stats.costCount)} tone="success" />
          <SummaryCard label="Excluded WBS" value={String(stats.excludedCount)} tone="warning" />
        </div>
      </div>

      <fieldset disabled={!canEdit} className="overflow-x-auto rounded-xl border border-line bg-panel2/10 shadow-sm">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-line bg-panel2/40">
              <th className="px-4 py-3.5 text-left font-bold uppercase tracking-[0.12em] text-muted/90">WBS Code</th>
              <th className="px-4 py-3.5 text-left font-bold uppercase tracking-[0.12em] text-muted/90">WBS Description</th>
              <th className="px-4 py-3.5 text-left font-bold uppercase tracking-[0.12em] text-muted/90">Revenue-Generating</th>
              <th className="px-4 py-3.5 text-left font-bold uppercase tracking-[0.12em] text-muted/90">Include in Cost</th>
              <th className="px-4 py-3.5 text-left font-bold uppercase tracking-[0.12em] text-muted/90">Active Status</th>
              <th className="px-4 py-3.5 text-left font-bold uppercase tracking-[0.12em] text-muted/90">Remarks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/40">
            {items.map((row) => (
              <tr key={row.localId} className="hover:bg-panel2/20 transition-colors">
                <td className="px-4 py-3 align-middle font-mono font-bold text-text">{row.wbs_code}</td>
                <td className="px-4 py-3 align-middle">
                  <input
                    className={inputClass}
                    value={row.wbs_description}
                    onChange={(e) => updateRow(row.localId, "wbs_description", e.target.value)}
                  />
                </td>
                <td className="px-4 py-3 align-middle">
                  <label className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-1.5 text-xs text-text cursor-pointer hover:border-line-hover transition">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-line bg-panel text-accent focus:ring-accent/50 cursor-pointer"
                      checked={row.is_revenue_generating}
                      onChange={(e) => updateRow(row.localId, "is_revenue_generating", e.target.checked)}
                    />
                    <span className="font-medium text-[11px]">{row.is_revenue_generating ? "Revenue WBS" : "Not Revenue"}</span>
                  </label>
                </td>
                <td className="px-4 py-3 align-middle">
                  <label className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-1.5 text-xs text-text cursor-pointer hover:border-line-hover transition">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-line bg-panel text-accent focus:ring-accent/50 cursor-pointer"
                      checked={row.include_in_cost}
                      onChange={(e) => updateRow(row.localId, "include_in_cost", e.target.checked)}
                    />
                    <span className="font-medium text-[11px]">{row.include_in_cost ? "Include in Cost" : "Exclude"}</span>
                  </label>
                </td>
                <td className="px-4 py-3 align-middle">
                  <select
                    className={selectClass}
                    value={row.is_active ? "active" : "inactive"}
                    onChange={(e) => updateRow(row.localId, "is_active", e.target.value === "active")}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </td>
                <td className="px-4 py-3 align-middle">
                  <input
                    className={inputClass}
                    value={row.remarks ?? ""}
                    placeholder="Remarks"
                    onChange={(e) => updateRow(row.localId, "remarks", e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </fieldset>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            onClick={saveRows}
            disabled={saving}
            className="rounded-lg bg-accent text-white px-4 py-2.5 text-xs font-semibold shadow hover:bg-accent-hover active:scale-[0.98] transition disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save WBS configuration"}
          </button>
          <button
            type="button"
            onClick={recalculateRows}
            disabled={recalculating}
            className="rounded-lg border border-line bg-panel/60 px-4 py-2.5 text-xs font-semibold text-text hover:bg-panel2/80 active:scale-[0.98] transition disabled:opacity-60"
          >
            {recalculating ? "Recalculating..." : "Recalculate from sources"}
          </button>
          {message ? (
            <span className="text-xs font-semibold text-accent/90 bg-accent/5 border border-accent/10 px-3.5 py-2 rounded-lg ml-2">
              {message}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "accent" | "warning" | "success" }) {
  const borderTone = {
    default: "border-line bg-panel/40",
    accent: "border-accent/20 bg-gradient-to-br from-accent/5 via-panel/40 to-panel/40 shadow-sm",
    warning: "border-warning/20 bg-gradient-to-br from-warning/5 via-panel/40 to-panel/40 shadow-sm",
    success: "border-success/20 bg-gradient-to-br from-success/5 via-panel/40 to-panel/40 shadow-sm",
  }[tone];

  return (
    <div className={cn("rounded-xl border px-4 py-3 min-w-[120px] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm", borderTone)}>
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className="mt-1.5 text-lg font-extrabold text-text leading-none">{value}</div>
    </div>
  );
}

function mapRowsToEditable(rows: ProjectWbsMaster[]) {
  return rows.map((row) => ({
    ...row,
    localId: row.id ?? `${row.wbs_code}-${crypto.randomUUID()}`,
    remarks: row.remarks ?? "",
  }));
}

const inputClass = "min-w-[220px] rounded-lg border border-line bg-panel px-3 py-2 text-xs text-text outline-none focus:border-accent focus:ring-1 focus:ring-accent transition shadow-sm w-full";
const selectClass = "min-w-[140px] rounded-lg border border-line bg-panel px-3 py-2 text-xs text-text outline-none focus:border-accent focus:ring-1 focus:ring-accent transition shadow-sm w-full cursor-pointer";

