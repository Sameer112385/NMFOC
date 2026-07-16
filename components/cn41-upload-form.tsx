"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DarkSelect } from "@/components/dark-select";
import { surfaceCard } from "@/components/ui";
import { cn } from "@/lib/utils";

type SourceType = "cn41" | "gr55" | "sales_order" | "historical_revenue";
type UploadItem = { file: File; sourceType: SourceType };

export function Cn41UploadForm({ projects }: { projects: { id: string; project_name: string }[] }) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [items, setItems] = useState<UploadItem[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [latestSources, setLatestSources] = useState<Record<SourceType, UploadLabel | null>>({
    cn41: null,
    gr55: null,
    sales_order: null,
    historical_revenue: null,
  });

  async function loadLatestSources(targetProjectId = projectId) {
    if (!targetProjectId) {
      setLatestSources({ cn41: null, gr55: null, sales_order: null, historical_revenue: null });
      return;
    }

    const response = await fetch(`/api/financial-sources/latest?projectId=${encodeURIComponent(targetProjectId)}`);
    if (!response.ok) {
      throw new Error("Failed to load latest source metadata.");
    }

    const payload = await response.json();
    setLatestSources({
      cn41: payload.latest?.cn41 ?? null,
      gr55: payload.latest?.gr55 ?? null,
      sales_order: payload.latest?.sales_order ?? null,
      historical_revenue: payload.latest?.historical_revenue ?? null,
    });
  }

  useEffect(() => {
    loadLatestSources(projectId).catch(() => {
      setLatestSources({ cn41: null, gr55: null, sales_order: null, historical_revenue: null });
    });
  }, [projectId]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!items.length || !projectId) {
      setMessage("Choose a project and at least one Excel file.");
      return;
    }

    setLoading(true);
    setMessage(items.some((item) => item.sourceType === "gr55") ? "Uploading GR55. Large SAP files can take a minute while the workbook is read and summarized." : "Uploading and recalculating financial sources.");
    const formData = new FormData();
    formData.set("project_id", projectId);
    for (const item of items) {
      formData.append("source_type", item.sourceType);
    }
    for (const item of items) {
      formData.append("file", item.file);
    }

    const response = await fetch("/api/financial-sources/upload", { method: "POST", body: formData });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setMessage(payload.error ?? "Upload failed.");
      return;
    }

    const totalRows = Array.isArray(payload.results)
      ? payload.results.reduce((sum: number, item: { rowCount?: number }) => sum + Number(item.rowCount ?? 0), 0)
      : 0;
    setMessage(
      `Uploaded ${items.length} file(s). ${totalRows ? `${totalRows} rows processed.` : ""} ${
        Array.isArray(payload.results) ? `${payload.results.length} result(s) returned.` : ""
      }`,
    );
    setItems([]);
    await loadLatestSources(projectId);
    router.refresh();
  }

  async function handleRecalculate() {
    if (!projectId) {
      setMessage("Choose a project first.");
      return;
    }

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

    setMessage(`Recalculated ${payload.rowCount ?? 0} revenue WBS row(s) from the current source data.`);
    await loadLatestSources(projectId);
    window.location.reload();
  }

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-6 p-6", surfaceCard)}>
      <div className="border-b border-line/30 pb-5">
        <div className="section-kicker text-accent font-bold tracking-[0.12em]">Data Ingestion</div>
        <h3 className="mt-1 text-lg font-bold text-text">Upload Financial Source</h3>
        <p className="mt-1 text-xs text-muted/90 font-medium">
          Upload CN41 for planned cost, GR55 for actual cost, Sales Order report for planned revenue, or Historical pre-2026 revenue.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-muted">Target Project</label>
          <DarkSelect
            value={projectId}
            onChange={setProjectId}
            name="project_id"
            placeholder="Select project"
            options={projects.map((project) => ({ value: project.id, label: project.project_name }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-muted">Select Excel Spreadsheet(s)</label>
          <input
            type="file"
            accept=".xlsx,.xls"
            multiple
            onChange={(e) => {
              const selected = Array.from(e.target.files ?? []);
              setItems((current) => [
                ...current,
                ...selected.map((file) => ({ file, sourceType: inferSourceType(file.name) })),
              ]);
              e.currentTarget.value = "";
            }}
            className="rounded-lg border border-line bg-panel px-3 py-2 text-xs text-text file:mr-3 file:rounded file:border-0 file:bg-accent file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-white file:hover:bg-accent-hover file:cursor-pointer outline-none focus:border-accent focus:ring-1 focus:ring-accent transition shadow-sm w-full"
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-xs font-bold text-muted uppercase tracking-wider">Latest Source Versions</div>
        <div className="grid gap-3 rounded-xl border border-line bg-panel2/10 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <SourceVersionLabel label="CN41" source={latestSources.cn41} />
          <SourceVersionLabel label="GR55" source={latestSources.gr55} />
          <SourceVersionLabel label="Sales Order" source={latestSources.sales_order} />
          <SourceVersionLabel label="Hist. Revenue" source={latestSources.historical_revenue} />
        </div>

        {items.length ? (
          <div className="space-y-2">
            <div className="text-xs font-bold text-muted uppercase tracking-wider pt-2">Selected Files to Upload</div>
            {items.map((item, index) => (
              <div key={`${item.file.name}-${index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel2/20 px-4 py-3 hover:border-line-hover transition">
                <div className="min-w-0 flex-1 truncate text-xs font-bold text-text">{item.file.name}</div>
                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  <select
                    className="rounded-lg border border-line bg-panel px-3 py-1.5 text-xs text-text outline-none focus:border-accent focus:ring-1 focus:ring-accent transition cursor-pointer"
                    value={item.sourceType}
                    onChange={(e) =>
                      setItems((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, sourceType: e.target.value as SourceType } : row,
                        ),
                      )
                    }
                  >
                    <option value="cn41">CN41 planned cost</option>
                    <option value="gr55">GR55 actual cost</option>
                    <option value="sales_order">Sales order revenue</option>
                    <option value="historical_revenue">Historical pre-2026 revenue</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setItems((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                    className="rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger/10 transition"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs font-medium text-muted bg-panel/30 border border-dashed border-line p-4 text-center rounded-xl">
            No files chosen for upload yet. Choose Excel files above to start.
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line/30 pt-4">
        <button
          disabled={loading || !items.length}
          className="rounded-lg bg-accent text-white px-4 py-2.5 text-xs font-semibold shadow hover:bg-accent-hover active:scale-[0.98] transition disabled:opacity-60"
        >
          {loading ? "Uploading..." : "Upload and recalculate"}
        </button>
        <button
          type="button"
          onClick={handleRecalculate}
          disabled={recalculating}
          className="rounded-lg border border-line bg-panel/60 px-4 py-2.5 text-xs font-semibold text-text hover:bg-panel2/80 active:scale-[0.98] transition disabled:opacity-60"
        >
          {recalculating ? "Recalculating..." : "Recalculate from WBS config"}
        </button>
        {message ? (
          <span className="text-xs font-semibold text-accent/90 bg-accent/5 border border-accent/10 px-3.5 py-2.5 rounded-lg ml-2">
            {message}
          </span>
        ) : null}
      </div>
    </form>
  );
}

type UploadLabel = {
  file_name: string;
  upload_date: string;
  version_no: number;
  is_latest: boolean;
} | null;

function SourceVersionLabel({ label, source }: { label: string; source: UploadLabel }) {
  const dateLabel = source?.upload_date ? new Date(source.upload_date).toLocaleDateString("en-GB") : "none uploaded";
  const versionLabel = source ? `v${source.version_no}` : "no version";
  return (
    <div className="rounded-lg border border-line bg-panel px-3.5 py-3 transition hover:border-line-hover">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className="mt-1 truncate text-xs font-bold text-text">{source ? source.file_name : "No file uploaded"}</div>
      <div className="mt-0.5 text-[10px] font-semibold text-muted/80">
        {versionLabel} {source ? `• ${dateLabel}` : ""}
      </div>
    </div>
  );
}

function inferSourceType(name: string): SourceType {
  const lowered = name.toLowerCase();
  if (lowered.includes("historical") || lowered.includes("hist") || lowered.includes("rev")) return "historical_revenue";
  if (lowered.includes("gr55")) return "gr55";
  if (lowered.includes("sales") || lowered.includes("order") || lowered.includes("so")) return "sales_order";
  return "cn41";
}

