"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { surfaceCard } from "@/components/ui";
import type { ProjectCostElementControl } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  projectId: string;
  rows: ProjectCostElementControl[];
  canEdit?: boolean;
};

type EditableRow = ProjectCostElementControl & { localId: string };

export function ProjectCostElementControlPanel({ projectId, rows, canEdit = true }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [message, setMessage] = useState("");
  const [items, setItems] = useState<EditableRow[]>(() => mapRows(rows));
  const [query, setQuery] = useState("");

  useEffect(() => {
    setItems(mapRows(rows));
  }, [rows]);

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      [item.cost_element, item.cost_element_name, item.remarks ?? ""].some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [items, query]);

  const stats = useMemo(() => {
    const included = items.filter((item) => item.include_in_cost).length;
    return { total: items.length, included, excluded: items.length - included };
  }, [items]);

  function updateRow(localId: string, key: keyof EditableRow, value: string | boolean) {
    setItems((current) => current.map((row) => (row.localId === localId ? { ...row, [key]: value } : row)));
  }

  async function saveRows() {
    setSaving(true);
    setMessage("");

    const response = await fetch("/api/project-cost-elements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        rows: items.map(({ cost_element, cost_element_name, include_in_cost, remarks }) => ({
          cost_element,
          cost_element_name,
          include_in_cost,
          remarks,
        })),
      }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setSaving(false);
      setMessage(payload.error ?? "Unable to save cost element control.");
      return;
    }

    setMessage("Cost element control saved. Recalculating financials...");
    const recalcResponse = await fetch("/api/financial-sources/recalculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId }),
    });
    const recalcPayload = await recalcResponse.json().catch(() => ({}));
    setSaving(false);

    if (!recalcResponse.ok) {
      setMessage(recalcPayload.error ?? "Cost element control saved, but financial recalculation failed.");
      return;
    }

    setMessage(`Cost element control saved. Recalculated ${recalcPayload.rowCount ?? 0} financial WBS row(s).`);
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

    setMessage(`Recalculated ${payload.rowCount ?? 0} WBS row(s) from current cost element settings.`);
    window.location.reload();
  }

  return (
    <div className={cn("space-y-6 p-6", surfaceCard)}>
      <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between border-b border-line/30 pb-5">
        <div>
          <div className="section-kicker text-accent font-bold tracking-[0.12em]">Control Center</div>
          <h3 className="mt-1 text-lg font-bold text-text">Cost Element Control</h3>
          <p className="mt-1 text-xs text-muted/90 font-medium">
            Control which GR55 cost elements are included in WBS actual cost. Excluded elements are ignored in calculations.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 shrink-0">
          <SummaryCard label="Total Elements" value={String(stats.total)} tone="default" />
          <SummaryCard label="Included" value={String(stats.included)} tone="success" />
          <SummaryCard label="Excluded" value={String(stats.excluded)} tone="warning" />
        </div>
      </div>

      <div className="relative">
        <input
          className="w-full rounded-lg border border-line bg-panel px-4 py-2.5 text-xs text-text outline-none focus:border-accent focus:ring-1 focus:ring-accent transition shadow-sm placeholder:text-muted/60"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search cost element code, name, or remarks..."
        />
      </div>

      <fieldset disabled={!canEdit} className="overflow-x-auto rounded-xl border border-line bg-panel2/10 shadow-sm">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-line bg-panel2/40">
              <th className="px-4 py-3.5 text-left font-bold uppercase tracking-[0.12em] text-muted/90">Cost Element</th>
              <th className="px-4 py-3.5 text-left font-bold uppercase tracking-[0.12em] text-muted/90">Cost Element Name</th>
              <th className="px-4 py-3.5 text-left font-bold uppercase tracking-[0.12em] text-muted/90">Include in Actual Cost</th>
              <th className="px-4 py-3.5 text-left font-bold uppercase tracking-[0.12em] text-muted/90">Remarks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/40">
            {filteredItems.map((row) => (
              <tr key={row.localId} className="hover:bg-panel2/20 transition-colors">
                <td className="px-4 py-3 align-middle font-mono font-bold text-text">{row.cost_element}</td>
                <td className="px-4 py-3 align-middle">
                  <input
                    className={inputClass}
                    value={row.cost_element_name}
                    onChange={(event) => updateRow(row.localId, "cost_element_name", event.target.value)}
                  />
                </td>
                <td className="px-4 py-3 align-middle">
                  <label className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-1.5 text-xs text-text cursor-pointer hover:border-line-hover transition">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-line bg-panel text-accent focus:ring-accent/50 cursor-pointer"
                      checked={row.include_in_cost}
                      onChange={(event) => updateRow(row.localId, "include_in_cost", event.target.checked)}
                    />
                    <span className="font-medium text-[11px]">{row.include_in_cost ? "Include in Cost" : "Exclude"}</span>
                  </label>
                </td>
                <td className="px-4 py-3 align-middle">
                  <input
                    className={inputClass}
                    value={row.remarks ?? ""}
                    placeholder="Remarks"
                    onChange={(event) => updateRow(row.localId, "remarks", event.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </fieldset>

      {!items.length ? (
        <div className="rounded-lg border border-warning/20 bg-warning/5 px-4 py-3 text-xs font-semibold text-warning">
          No GR55 cost elements detected yet. Upload GR55 first, then return here to include or exclude cost elements.
        </div>
      ) : null}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            onClick={saveRows}
            disabled={saving || !items.length}
            className="rounded-lg bg-accent text-white px-4 py-2.5 text-xs font-semibold shadow hover:bg-accent-hover active:scale-[0.98] transition disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save cost element control"}
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

function mapRows(rows: ProjectCostElementControl[]) {
  return rows.map((row) => ({
    ...row,
    localId: row.id ?? `${row.cost_element}-${crypto.randomUUID()}`,
    cost_element_name: row.cost_element_name || row.cost_element,
    include_in_cost: row.include_in_cost !== false,
    remarks: row.remarks ?? "",
  }));
}

const inputClass = "min-w-[260px] rounded-lg border border-line bg-panel px-3 py-2 text-xs text-text outline-none focus:border-accent focus:ring-1 focus:ring-accent transition shadow-sm w-full";

