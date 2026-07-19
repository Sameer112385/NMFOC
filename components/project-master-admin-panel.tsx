"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DarkSelect } from "@/components/dark-select";
import { surfaceCard } from "@/components/ui";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { Download, Upload, Search } from "lucide-react";
import type { Project, ProjectManpowerRate, ProjectMaterialMaster, ProjectWbsMaster, RevenueWBS } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  projects?: Project[];
  revenueWbs: RevenueWBS[];
  projectWbsMaster?: ProjectWbsMaster[];
  manpowerRates: ProjectManpowerRate[];
  materialMasters: ProjectMaterialMaster[];
  projectId?: string;
  projectName?: string;
  section?: "full" | "manpower" | "material";
  canEdit?: boolean;
};

export function ProjectMasterAdminPanel({
  projects = [],
  revenueWbs,
  projectWbsMaster = [],
  manpowerRates,
  materialMasters,
  projectId: fixedProjectId,
  projectName,
  section = "full",
  canEdit = true,
}: Props) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(fixedProjectId ?? projects[0]?.id ?? "");
  const [activeTab, setActiveTab] = useState<"summary" | "manpower" | "material">("summary");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingType, setUploadingType] = useState<"" | "manpower" | "material">("");
  const [selectedManpowerFile, setSelectedManpowerFile] = useState<File | null>(null);
  const [selectedMaterialFile, setSelectedMaterialFile] = useState<File | null>(null);
  const manpowerFileRef = useRef<HTMLInputElement | null>(null);
  const materialFileRef = useRef<HTMLInputElement | null>(null);

  const [rateForm, setRateForm] = useState({
    revenue_wbs_code: "",
    work_center: "",
    cost_center: "",
    labor_category: "",
    hourly_rate: "",
  });

  const [materialForm, setMaterialForm] = useState({
    revenue_wbs_code: "",
    material_code: "",
    material_description: "",
    unit_of_measure: "",
    planned_quantity: "",
    unit_price: "",
  });

  const [localRates, setLocalRates] = useState<ProjectManpowerRate[]>(manpowerRates);
  const [localMaterials, setLocalMaterials] = useState<ProjectMaterialMaster[]>(materialMasters);
  const [materialSearch, setMaterialSearch] = useState("");

  useEffect(() => {
    setLocalRates(manpowerRates);
  }, [manpowerRates]);

  useEffect(() => {
    setLocalMaterials(materialMasters);
  }, [materialMasters]);

  const projectCostWbs = useMemo(
    () =>
      projectWbsMaster
        .filter((item) => item.project_id === projectId && item.is_active !== false && item.include_in_cost)
        .map((item) => ({
          project_id: item.project_id,
          wbs_code: item.wbs_code,
          wbs_description: item.wbs_description,
        }))
        .sort((a, b) => a.wbs_code.localeCompare(b.wbs_code)),
    [projectId, projectWbsMaster],
  );
  const projectWbs = useMemo(
    () => revenueWbs.filter((item) => item.project_id === projectId).sort((a, b) => a.wbs_code.localeCompare(b.wbs_code)),
    [projectId, revenueWbs],
  );
  const materialWbsOptions = projectCostWbs.length ? projectCostWbs : projectWbs;
  const projectRates = useMemo(
    () => localRates.filter((item) => item.project_id === projectId),
    [projectId, localRates],
  );
  const projectMaterials = useMemo(
    () =>
      localMaterials
        .filter((item) => item.project_id === projectId)
        .sort((a, b) => a.revenue_wbs_code.localeCompare(b.revenue_wbs_code) || a.material_code.localeCompare(b.material_code)),
    [projectId, localMaterials],
  );
  // wbs_code -> description, so the material search can also match on the WBS description
  // (which is not stored on the material row itself).
  const wbsDescriptionByCode = useMemo(() => {
    const map = new Map<string, string>();
    materialWbsOptions.forEach((row) => {
      if (row.wbs_code) map.set(row.wbs_code, row.wbs_description ?? "");
    });
    return map;
  }, [materialWbsOptions]);
  const filteredMaterials = useMemo(() => {
    const term = materialSearch.trim().toLowerCase();
    if (!term) return projectMaterials;
    return projectMaterials.filter((m) => {
      const wbsDesc = wbsDescriptionByCode.get(m.revenue_wbs_code ?? "") ?? "";
      return [m.material_code, m.material_description, m.revenue_wbs_code, wbsDesc]
        .some((field) => String(field ?? "").toLowerCase().includes(term));
    });
  }, [projectMaterials, materialSearch, wbsDescriptionByCode]);
  const showProjectSelector = !fixedProjectId;
  const resolvedTab = section === "full" ? activeTab : section;

  useEffect(() => {
    if (fixedProjectId) {
      setProjectId(fixedProjectId);
    }
  }, [fixedProjectId]);

  useEffect(() => {
    setMaterialForm((current) => ({
      ...current,
      revenue_wbs_code:
        materialWbsOptions.some((item) => item.wbs_code === current.revenue_wbs_code) ? current.revenue_wbs_code : materialWbsOptions[0]?.wbs_code ?? "",
    }));
  }, [materialWbsOptions]);

  async function saveRate() {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/project-masters/manpower", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        revenue_wbs_code: "",
        work_center: rateForm.work_center,
        cost_center: rateForm.cost_center,
        labor_category: rateForm.labor_category,
        hourly_rate: Number(rateForm.hourly_rate || 0),
      }),
    });
    const payload = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(payload.error ?? "Unable to save manpower rate.");
      return;
    }
    if (payload.row) {
      setLocalRates((current) => [payload.row, ...current]);
    }
    setRateForm({
      revenue_wbs_code: "",
      work_center: "",
      cost_center: "",
      labor_category: "",
      hourly_rate: "",
    });
    setMessage("Manpower rate master saved.");
    router.refresh();
  }

  async function saveMaterial() {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/project-masters/materials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        revenue_wbs_code: materialForm.revenue_wbs_code,
        material_code: materialForm.material_code,
        material_description: materialForm.material_description,
        unit_of_measure: materialForm.unit_of_measure,
        planned_quantity: Number(materialForm.planned_quantity || 0),
        unit_price: Number(materialForm.unit_price || 0),
      }),
    });
    const payload = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(payload.error ?? "Unable to save material master.");
      return;
    }
    if (payload.row) {
      setLocalMaterials((current) => [payload.row, ...current]);
    }
    setMaterialForm((current) => ({
      revenue_wbs_code: current.revenue_wbs_code,
      material_code: "",
      material_description: "",
      unit_of_measure: "",
      planned_quantity: "",
      unit_price: "",
    }));
    setMessage("Project material master saved.");
    router.refresh();
  }

  async function deleteRate(id?: string) {
    if (!id) return;
    setSaving(true);
    const response = await fetch("/api/project-masters/manpower", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setMessage(payload.error ?? "Unable to delete manpower rate.");
      return;
    }
    setLocalRates((current) => current.filter((item) => item.id !== id));
    setMessage("Manpower rate master deleted.");
    router.refresh();
  }

  async function deleteMaterial(id?: string) {
    if (!id) return;
    setSaving(true);
    const response = await fetch("/api/project-masters/materials", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setMessage(payload.error ?? "Unable to delete material master.");
      return;
    }
    setLocalMaterials((current) => current.filter((item) => item.id !== id));
    setMessage("Project material master deleted.");
    router.refresh();
  }

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<"manpower" | "material" | null>(null);
  const [editingManpowerForm, setEditingManpowerForm] = useState({
    work_center: "",
    cost_center: "",
    labor_category: "",
    hourly_rate: "",
  });
  const [editingMaterialForm, setEditingMaterialForm] = useState({
    revenue_wbs_code: "",
    material_code: "",
    material_description: "",
    unit_of_measure: "",
    planned_quantity: "",
    unit_price: "",
  });

  async function updateRate(id: string) {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/project-masters/manpower", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        work_center: editingManpowerForm.work_center,
        cost_center: editingManpowerForm.cost_center,
        labor_category: editingManpowerForm.labor_category,
        hourly_rate: Number(editingManpowerForm.hourly_rate || 0),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setMessage(payload.error ?? "Unable to update manpower rate.");
      return;
    }
    if (payload.row) {
      setLocalRates((current) => current.map((item) => item.id === id ? payload.row : item));
    }
    setEditingId(null);
    setEditingType(null);
    setMessage("Manpower rate master updated.");
    router.refresh();
  }

  async function updateMaterial(id: string) {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/project-masters/materials", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        project_id: projectId,
        revenue_wbs_code: editingMaterialForm.revenue_wbs_code,
        material_code: editingMaterialForm.material_code,
        material_description: editingMaterialForm.material_description,
        unit_of_measure: editingMaterialForm.unit_of_measure,
        planned_quantity: Number(editingMaterialForm.planned_quantity || 0),
        unit_price: Number(editingMaterialForm.unit_price || 0),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setMessage(payload.error ?? "Unable to update material master.");
      return;
    }
    if (payload.row) {
      setLocalMaterials((current) => current.map((item) => item.id === id ? payload.row : item));
    }
    setEditingId(null);
    setEditingType(null);
    setMessage("Project material master updated.");
    router.refresh();
  }

  async function uploadBulk(type: "manpower" | "material", file?: File | null) {
    if (!projectId || !file) return;
    setUploadingType(type);
    setMessage("");
    const formData = new FormData();
    formData.set("project_id", projectId);
    formData.set("type", type);
    formData.set("file", file);

    const response = await fetch("/api/project-masters/bulk", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json().catch(() => ({}));
    setUploadingType("");

    if (!response.ok) {
      setMessage(payload.error ?? `Unable to upload ${type} template.`);
      return;
    }

    if (type === "manpower") {
      if (manpowerFileRef.current) manpowerFileRef.current.value = "";
      setSelectedManpowerFile(null);
    }
    if (type === "material") {
      if (materialFileRef.current) materialFileRef.current.value = "";
      setSelectedMaterialFile(null);
    }
    setMessage(`${payload.imported ?? 0} ${type} rows imported successfully.`);
    router.refresh();
  }

  return (
    <div className={cn("space-y-6 p-6", surfaceCard)}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between border-b border-line/30 pb-5">
        <div>
          <div className="section-kicker text-accent font-bold tracking-[0.12em]">Operational Rate Sheets</div>
          <h3 className="mt-1 text-lg font-bold text-text">Project Cost Masters</h3>
          <p className="mt-1 text-xs text-muted/95 font-medium">
            Maintain project manpower rates and planned material master here. PM daily updates will calculate from these masters automatically.
          </p>
        </div>
        {showProjectSelector ? (
          <div className="min-w-[260px] shrink-0">
            <div className="mb-1.5 text-xs font-semibold text-muted">Project Selection</div>
            <DarkSelect
              value={projectId}
              onChange={setProjectId}
              options={projects.map((project) => ({ value: project.id, label: `${project.project_name} (${project.project_code})` }))}
              placeholder="Select project"
            />
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-panel2/40 px-4 py-3 min-w-[200px] shrink-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Project</div>
            <div className="mt-1.5 text-sm font-extrabold text-text leading-none">{projectName ?? "Selected project"}</div>
          </div>
        )}
      </div>

      {section === "full" ? (
        <div className="flex flex-wrap gap-1.5 border-b border-line/30 pb-3">
          {[
            { key: "summary", label: "Project Summary" },
            { key: "manpower", label: "Manpower Master" },
            { key: "material", label: "Project Material Master" },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={cn(
                "rounded-lg px-4 py-2 text-xs font-bold transition-all duration-100",
                activeTab === tab.key
                  ? "bg-accent text-white shadow-sm"
                  : "text-muted hover:bg-panel2 hover:text-text",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}

      {resolvedTab === "summary" ? (
        <div className="space-y-4">
          <div className="border-l-2 border-accent pl-3">
            <div className="text-sm font-bold text-text">Project Summary</div>
            <div className="mt-0.5 text-xs text-muted/90 font-medium">
              Quick view of project-linked master readiness for this selected project.
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <SummaryStat label="Cost WBS Count" value={String(materialWbsOptions.length)} />
            <SummaryStat label="Manpower Rate Records" value={String(projectRates.length)} />
            <SummaryStat label="Material Master Records" value={String(projectMaterials.length)} />
            <SummaryStat
              label="Project"
              value={projectName ?? projects.find((project) => project.id === projectId)?.project_name ?? "Selected project"}
            />
            <SummaryStat
              label="Latest WBS"
              value={materialWbsOptions[0] ? `${materialWbsOptions[0].wbs_code}` : "No cost WBS found"}
            />
            <SummaryStat
              label="Masters Status"
              value={projectRates.length || projectMaterials.length ? "Configured" : "Pending setup"}
            />
          </div>
        </div>
      ) : null}

      {resolvedTab === "manpower" ? (
        <div className="space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-line/30 pb-4">
            <div>
              <div className="text-sm font-bold text-text">Manpower Rate Master</div>
              <div className="mt-0.5 text-xs text-muted/90 font-medium">Maintain project labor categories, work center/cost center, and hourly rates.</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canEdit && (
                <>
                  <a
                    href={projectId ? `/api/project-masters/template?type=manpower&projectId=${projectId}` : "#"}
                    className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel/60 px-3 py-2 text-xs font-semibold text-text hover:bg-panel2/80 transition"
                  >
                    <Download className="h-3.5 w-3.5 text-muted" />
                    <span>Template</span>
                  </a>
                  <input
                    ref={manpowerFileRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => setSelectedManpowerFile(e.target.files?.[0] ?? null)}
                  />
                  <button
                    type="button"
                    onClick={() => manpowerFileRef.current?.click()}
                    disabled={!projectId}
                    className={secondaryButtonClass}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Upload className="h-3.5 w-3.5 text-muted" />
                      {selectedManpowerFile ? "Change File" : "Choose Excel"}
                    </span>
                  </button>
                  {selectedManpowerFile && (
                    <button
                      type="button"
                      onClick={() => uploadBulk("manpower", selectedManpowerFile)}
                      disabled={!projectId || uploadingType === "manpower"}
                      className="rounded-lg bg-accent text-white px-4 py-2 text-xs font-semibold shadow hover:bg-accent-hover transition"
                    >
                      {uploadingType === "manpower" ? "Uploading..." : "Upload"}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {selectedManpowerFile && (
            <div className="text-xs font-semibold text-accent bg-accent/5 border border-accent/10 px-3.5 py-2.5 rounded-lg">
              Selected file: <span className="font-mono">{selectedManpowerFile.name}</span>
            </div>
          )}

          <fieldset disabled={!canEdit} className="bg-panel2/10 border border-line p-5 rounded-xl space-y-4">
            <div className="text-xs font-bold text-text uppercase tracking-wider">Add Manpower Rate</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <input value={rateForm.work_center} onChange={(e) => setRateForm((c) => ({ ...c, work_center: e.target.value }))} placeholder="Work center" className={inputClass} />
              <input value={rateForm.cost_center} onChange={(e) => setRateForm((c) => ({ ...c, cost_center: e.target.value }))} placeholder="Cost center" className={inputClass} />
              <input value={rateForm.labor_category} onChange={(e) => setRateForm((c) => ({ ...c, labor_category: e.target.value }))} placeholder="Labor category (e.g. Supervisor)" className={inputClass} />
              <input value={rateForm.hourly_rate} onChange={(e) => setRateForm((c) => ({ ...c, hourly_rate: e.target.value }))} placeholder="Hourly rate (SAR/hr)" type="number" step="0.01" className={inputClass} />
            </div>
            {canEdit && (
              <div className="flex items-center justify-end">
                <button type="button" disabled={saving || !projectId || !rateForm.labor_category || !rateForm.hourly_rate} onClick={saveRate} className={primaryButtonClass}>
                  Save manpower rate
                </button>
              </div>
            )}
          </fieldset>

          <div className="space-y-2">
            <div className="text-xs font-bold text-muted uppercase tracking-wider pb-1">Current Manpower Rates (Double click to edit)</div>
            {projectRates.length ? projectRates.map((rate) => {
              const isEditing = editingId === rate.id && editingType === "manpower";
              return (
                <div
                  key={rate.id}
                  onDoubleClick={() => {
                    if (!canEdit) return;
                    setEditingId(rate.id ?? null);
                    setEditingType("manpower");
                    setEditingManpowerForm({
                      work_center: rate.work_center ?? "",
                      cost_center: rate.cost_center ?? "",
                      labor_category: rate.labor_category ?? "",
                      hourly_rate: String(rate.hourly_rate ?? ""),
                    });
                  }}
                  className="rounded-xl border border-line bg-panel2/20 px-4 py-3 hover:border-line-hover transition"
                >
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <input
                          value={editingManpowerForm.labor_category}
                          onChange={(e) => setEditingManpowerForm((c) => ({ ...c, labor_category: e.target.value }))}
                          placeholder="Labor category"
                          className={inputClass}
                        />
                        <input
                          value={editingManpowerForm.work_center}
                          onChange={(e) => setEditingManpowerForm((c) => ({ ...c, work_center: e.target.value }))}
                          placeholder="Work center"
                          className={inputClass}
                        />
                        <input
                          value={editingManpowerForm.cost_center}
                          onChange={(e) => setEditingManpowerForm((c) => ({ ...c, cost_center: e.target.value }))}
                          placeholder="Cost center"
                          className={inputClass}
                        />
                        <input
                          value={editingManpowerForm.hourly_rate}
                          onChange={(e) => setEditingManpowerForm((c) => ({ ...c, hourly_rate: e.target.value }))}
                          placeholder="Hourly rate"
                          type="number"
                          step="0.01"
                          className={inputClass}
                        />
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setEditingType(null);
                          }}
                          className={secondaryButtonClass}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={saving || !editingManpowerForm.labor_category || !editingManpowerForm.hourly_rate}
                          onClick={() => updateRate(rate.id!)}
                          className={primaryButtonClass}
                        >
                          {saving ? "Saving..." : "Save changes"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-text">{rate.labor_category}</div>
                        <div className="text-[11px] font-medium text-muted mt-0.5">
                          {[rate.work_center, rate.cost_center].filter(Boolean).join(" | ") || "No work / cost center linked"}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-xs font-bold text-text tabular-nums">{formatCurrency(rate.hourly_rate)}</div>
                        {canEdit && (
                          <button type="button" onClick={() => deleteRate(rate.id)} className={dangerButtonClass}>Delete</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            }) : <div className="text-xs font-medium text-muted bg-panel/30 border border-dashed border-line p-4 text-center rounded-xl">No manpower rates maintained for this project yet.</div>}
          </div>
        </div>
      ) : null}

      {resolvedTab === "material" ? (
        <div className="space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-line/30 pb-4">
            <div>
              <div className="text-sm font-bold text-text">Project Material Master</div>
              <div className="mt-0.5 text-xs text-muted/90 font-medium">Maintain planned materials by revenue WBS, including planned quantity and unit price.</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canEdit && (
                <>
                  <a
                    href={projectId ? `/api/project-masters/template?type=material&projectId=${projectId}` : "#"}
                    className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel/60 px-3 py-2 text-xs font-semibold text-text hover:bg-panel2/80 transition"
                  >
                    <Download className="h-3.5 w-3.5 text-muted" />
                    <span>Template</span>
                  </a>
                  <input
                    ref={materialFileRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => setSelectedMaterialFile(e.target.files?.[0] ?? null)}
                  />
                  <button
                    type="button"
                    onClick={() => materialFileRef.current?.click()}
                    disabled={!projectId}
                    className={secondaryButtonClass}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Upload className="h-3.5 w-3.5 text-muted" />
                      {selectedMaterialFile ? "Change File" : "Choose Excel"}
                    </span>
                  </button>
                  {selectedMaterialFile && (
                    <button
                      type="button"
                      onClick={() => uploadBulk("material", selectedMaterialFile)}
                      disabled={!projectId || uploadingType === "material"}
                      className="rounded-lg bg-accent text-white px-4 py-2 text-xs font-semibold shadow hover:bg-accent-hover transition"
                    >
                      {uploadingType === "material" ? "Uploading..." : "Upload"}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {selectedMaterialFile && (
            <div className="text-xs font-semibold text-accent bg-accent/5 border border-accent/10 px-3.5 py-2.5 rounded-lg">
              Selected file: <span className="font-mono">{selectedMaterialFile.name}</span>
            </div>
          )}

          <fieldset disabled={!canEdit} className="bg-panel2/10 border border-line p-5 rounded-xl space-y-4">
            <div className="text-xs font-bold text-text uppercase tracking-wider">Add Material Master Entry</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex flex-col gap-1">
                <div className="text-[10px] font-bold text-muted uppercase tracking-wider">WBS Element</div>
                <DarkSelect
                  value={materialForm.revenue_wbs_code}
                  onChange={(value) => setMaterialForm((c) => ({ ...c, revenue_wbs_code: value }))}
                  options={materialWbsOptions.map((row) => ({ value: row.wbs_code, label: `${row.wbs_code} - ${row.wbs_description}` }))}
                  placeholder="Select WBS"
                />
              </div>
              <div className="flex flex-col gap-1 justify-end">
                <input value={materialForm.material_code} onChange={(e) => setMaterialForm((c) => ({ ...c, material_code: e.target.value }))} placeholder="Material code" className={inputClass} />
              </div>
              <div className="flex flex-col gap-1 justify-end">
                <input value={materialForm.material_description} onChange={(e) => setMaterialForm((c) => ({ ...c, material_description: e.target.value }))} placeholder="Material description" className={inputClass} />
              </div>
              <input value={materialForm.unit_of_measure} onChange={(e) => setMaterialForm((c) => ({ ...c, unit_of_measure: e.target.value }))} placeholder="Unit of measure (e.g. Meters)" className={inputClass} />
              <input value={materialForm.planned_quantity} onChange={(e) => setMaterialForm((c) => ({ ...c, planned_quantity: e.target.value }))} placeholder="Planned quantity" type="number" step="0.01" className={inputClass} />
              <input value={materialForm.unit_price} onChange={(e) => setMaterialForm((c) => ({ ...c, unit_price: e.target.value }))} placeholder="Unit price (SAR)" type="number" step="0.01" className={inputClass} />
            </div>
            {canEdit && (
              <div className="flex items-center justify-end">
                <button type="button" disabled={saving || !projectId || !materialForm.revenue_wbs_code} onClick={saveMaterial} className={primaryButtonClass}>
                  Save material
                </button>
              </div>
            )}
          </fieldset>

          <div className="space-y-2">
            <div className="flex flex-col gap-2 pb-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs font-bold text-muted uppercase tracking-wider">Current Material Master (Double click to edit)</div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted/70" />
                <input
                  value={materialSearch}
                  onChange={(e) => setMaterialSearch(e.target.value)}
                  placeholder="Search material, WBS, or description..."
                  className="w-full rounded-lg border border-line bg-panel pl-9 pr-3 py-2 text-xs text-text outline-none placeholder:text-muted/60 focus:border-accent focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>
            {!projectMaterials.length ? (
              <div className="text-xs font-medium text-muted bg-panel/30 border border-dashed border-line p-4 text-center rounded-xl">No project material master maintained for this project yet.</div>
            ) : !filteredMaterials.length ? (
              <div className="text-xs font-medium text-muted bg-panel/30 border border-dashed border-line p-4 text-center rounded-xl">
                No materials match “{materialSearch}”.
              </div>
            ) : filteredMaterials.map((material) => {
              const isEditing = editingId === material.id && editingType === "material";
              return (
                <div
                  key={material.id}
                  onDoubleClick={() => {
                    if (!canEdit) return;
                    setEditingId(material.id ?? null);
                    setEditingType("material");
                    setEditingMaterialForm({
                      revenue_wbs_code: material.revenue_wbs_code ?? "",
                      material_code: material.material_code ?? "",
                      material_description: material.material_description ?? "",
                      unit_of_measure: material.unit_of_measure ?? "",
                      planned_quantity: String(material.planned_quantity ?? ""),
                      unit_price: String(material.unit_price ?? ""),
                    });
                  }}
                  className="rounded-xl border border-line bg-panel2/20 px-4 py-3 hover:border-line-hover transition"
                >
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="flex flex-col gap-1">
                          <div className="text-[10px] font-bold text-muted uppercase tracking-wider">WBS Element</div>
                          <DarkSelect
                            value={editingMaterialForm.revenue_wbs_code}
                            onChange={(value) => setEditingMaterialForm((c) => ({ ...c, revenue_wbs_code: value }))}
                            options={materialWbsOptions.map((row) => ({ value: row.wbs_code, label: `${row.wbs_code} - ${row.wbs_description}` }))}
                            placeholder="Select WBS"
                          />
                        </div>
                        <div className="flex flex-col gap-1 justify-end">
                          <input
                            value={editingMaterialForm.material_code}
                            onChange={(e) => setEditingMaterialForm((c) => ({ ...c, material_code: e.target.value }))}
                            placeholder="Material code"
                            className={inputClass}
                          />
                        </div>
                        <div className="flex flex-col gap-1 justify-end">
                          <input
                            value={editingMaterialForm.material_description}
                            onChange={(e) => setEditingMaterialForm((c) => ({ ...c, material_description: e.target.value }))}
                            placeholder="Material description"
                            className={inputClass}
                          />
                        </div>
                        <input
                          value={editingMaterialForm.unit_of_measure}
                          onChange={(e) => setEditingMaterialForm((c) => ({ ...c, unit_of_measure: e.target.value }))}
                          placeholder="Unit of measure"
                          className={inputClass}
                        />
                        <input
                          value={editingMaterialForm.planned_quantity}
                          onChange={(e) => setEditingMaterialForm((c) => ({ ...c, planned_quantity: e.target.value }))}
                          placeholder="Planned quantity"
                          type="number"
                          step="0.01"
                          className={inputClass}
                        />
                        <input
                          value={editingMaterialForm.unit_price}
                          onChange={(e) => setEditingMaterialForm((c) => ({ ...c, unit_price: e.target.value }))}
                          placeholder="Unit price"
                          type="number"
                          step="0.01"
                          className={inputClass}
                        />
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setEditingType(null);
                          }}
                          className={secondaryButtonClass}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={saving || !editingMaterialForm.revenue_wbs_code || !editingMaterialForm.material_code || !editingMaterialForm.material_description}
                          onClick={() => updateMaterial(material.id!)}
                          className={primaryButtonClass}
                        >
                          {saving ? "Saving..." : "Save changes"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-text">{material.material_code} - {material.material_description}</div>
                        <div className="text-[11px] font-medium text-muted mt-0.5">
                          <span className="font-mono text-accent">{material.revenue_wbs_code}</span>
                          <span className="mx-2 text-line">|</span>
                          <span>UoM: {material.unit_of_measure || "-"}</span>
                          <span className="mx-2 text-line">|</span>
                          <span>Planned Qty: <span className="font-bold text-text tabular-nums">{formatNumber(material.planned_quantity)}</span></span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-xs font-bold text-text tabular-nums">{formatCurrency(material.unit_price)}</div>
                        {canEdit && (
                          <button type="button" onClick={() => deleteMaterial(material.id)} className={dangerButtonClass}>Delete</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {message ? (
        <div className="text-xs font-semibold text-accent/90 bg-accent/5 border border-accent/10 px-4 py-3 rounded-lg mt-3">
          {message}
        </div>
      ) : null}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel/40 px-4 py-3.5 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className="mt-1.5 text-sm font-extrabold text-text leading-none">{value}</div>
    </div>
  );
}

const inputClass = "rounded-lg border border-line bg-panel px-3 py-2.5 text-xs text-text outline-none focus:border-accent focus:ring-1 focus:ring-accent transition shadow-sm w-full";
const primaryButtonClass = "rounded-lg bg-accent text-white px-4 py-2.5 text-xs font-semibold shadow hover:bg-accent-hover active:scale-[0.98] transition disabled:opacity-60";
const secondaryButtonClass = "rounded-lg border border-line bg-panel/60 px-3.5 py-2 text-xs font-semibold text-text hover:bg-panel2/80 active:scale-[0.98] transition disabled:opacity-60";
const dangerButtonClass = "rounded-lg border border-danger/30 px-3 py-1.5 text-[11px] font-semibold text-danger hover:bg-danger/10 transition";

