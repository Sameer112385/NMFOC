"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { surfaceCard, StatRow } from "@/components/ui";
import type { Project, ProjectSubcontract, UserProfile } from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";

type EditableSubcontractRow = {
  id: string;
  package_name: string;
  subcontractor_name: string;
  po_number: string;
  po_amount: string;
  scope: string;
  status: string;
};

export function ProjectAdminDetailsForm({
  project,
  revenueWbsCount,
  latestUpload,
  manpowerRatesCount,
  materialMastersCount,
  projectSubcontracts,
  projectManagers,
  section = "summary",
  canEdit = true,
}: {
  project: Project;
  revenueWbsCount: number;
  latestUpload: string | null;
  manpowerRatesCount: number;
  materialMastersCount: number;
  projectSubcontracts: ProjectSubcontract[];
  projectManagers: UserProfile[];
  section?: "summary" | "subcontracts";
  canEdit?: boolean;
}) {
  const router = useRouter();
  const resolveManager = (managerId: string) =>
    projectManagers.find((manager) => manager.user_id === managerId || manager.id === managerId) ?? null;
  const initialManager = resolveManager(project.project_manager_user_id ?? "") ?? projectManagers.find((manager) => manager.full_name === project.project_manager_name || manager.email === project.project_manager_email) ?? null;
  const [showEditor, setShowEditor] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [form, setForm] = useState({
    project_code: project.project_code ?? "",
    project_name: project.project_name ?? "",
    client_name: project.client_name ?? "",
    project_manager_user_id: initialManager?.user_id ?? project.project_manager_user_id ?? "",
    project_manager_name: project.project_manager_name ?? "",
    project_manager_email: project.project_manager_email ?? "",
    project_manager_phone: project.project_manager_phone ?? "",
    site_location: project.site_location ?? "",
    status: project.status ?? "Active",
  });
  const [subcontractRows, setSubcontractRows] = useState<EditableSubcontractRow[]>(
    projectSubcontracts.length
      ? projectSubcontracts.map((row) => ({
          id: row.id ?? crypto.randomUUID(),
          package_name: row.package_name ?? "",
          subcontractor_name: row.subcontractor_name ?? "",
          po_number: row.po_number ?? "",
          po_amount: row.po_amount?.toString() ?? "",
          scope: row.scope ?? "",
          status: row.status ?? "Active",
        }))
      : [createEmptySubcontractRow()],
  );

  useEffect(() => {
    const manager =
      resolveManager(project.project_manager_user_id ?? "") ??
      projectManagers.find((item) => item.full_name === project.project_manager_name || item.email === project.project_manager_email) ??
      null;

    setForm({
      project_code: project.project_code ?? "",
      project_name: project.project_name ?? "",
      client_name: project.client_name ?? "",
      project_manager_user_id: manager?.user_id ?? project.project_manager_user_id ?? "",
      project_manager_name: project.project_manager_name ?? manager?.full_name ?? "",
      project_manager_email: project.project_manager_email ?? manager?.email ?? "",
      project_manager_phone: project.project_manager_phone ?? manager?.phone ?? "",
      site_location: project.site_location ?? "",
      status: project.status ?? "Active",
    });
  }, [
    project,
    projectManagers,
  ]);

  useEffect(() => {
    setSubcontractRows(
      projectSubcontracts.length
        ? projectSubcontracts.map((row) => ({
            id: row.id ?? crypto.randomUUID(),
            package_name: row.package_name ?? "",
            subcontractor_name: row.subcontractor_name ?? "",
            po_number: row.po_number ?? "",
            po_amount: row.po_amount?.toString() ?? "",
            scope: row.scope ?? "",
            status: row.status ?? "Active",
          }))
        : [createEmptySubcontractRow()],
    );
  }, [projectSubcontracts]);

  const subcontractSummary = useMemo(() => {
    const activeRows = projectSubcontracts.filter((row) => (row.status ?? "Active") !== "Closed");
    const totalPoAmount = projectSubcontracts.reduce((sum, row) => sum + Number(row.po_amount ?? 0), 0);
    const packageNames = projectSubcontracts.map((row) => row.package_name).filter(Boolean);

    return {
      activeCount: activeRows.length,
      totalPoAmount,
      packageNames: packageNames.length ? packageNames.join(", ") : "-",
    };
  }, [projectSubcontracts]);

  async function saveProjectDetails(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const projectResponse = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_code: form.project_code,
        project_name: form.project_name,
        client_name: form.client_name,
        project_manager_user_id: form.project_manager_user_id,
        project_manager_name: form.project_manager_name,
        project_manager_email: form.project_manager_email,
        project_manager_phone: form.project_manager_phone,
        site_location: form.site_location,
        status: form.status,
      }),
    });

    const projectPayload = await projectResponse.json().catch(() => ({}));
    if (!projectResponse.ok) {
      setSaving(false);
      setMessage(projectPayload.error ?? "Unable to update project details.");
      return;
    }

    setSaving(false);
    setMessage("Project details updated.");
    router.refresh();
  }

  async function saveSubcontracts(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const subcontractResponse = await fetch("/api/project-subcontracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: project.id,
        rows: subcontractRows.map((row) => ({
          package_name: row.package_name,
          subcontractor_name: row.subcontractor_name,
          po_number: row.po_number,
          po_amount: row.po_amount,
          scope: row.scope,
          status: row.status,
        })),
      }),
    });

    const subcontractPayload = await subcontractResponse.json().catch(() => ({}));
    setSaving(false);

    if (!subcontractResponse.ok) {
      setMessage(subcontractPayload.error ?? "Unable to save project subcontracts.");
      return;
    }

    setMessage("Project subcontract packages updated.");
    router.refresh();
  }

  async function recalculateFinancials() {
    setRecalculating(true);
    setMessage("Recalculating financials from latest source data...");
    const response = await fetch("/api/financial-sources/recalculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: project.id }),
    });
    const payload = await response.json().catch(() => ({}));
    setRecalculating(false);

    if (!response.ok) {
      setMessage(payload.error ?? "Unable to recalculate financial data.");
      return;
    }

    setMessage("Financials recalculated. " + (payload.rowCount ?? 0) + " WBS row(s) updated.");
    window.location.reload();
  }

  function updateSubcontractRow(id: string, key: keyof EditableSubcontractRow, value: string) {
    setSubcontractRows((current) =>
      current.map((row) => (row.id === id ? { ...row, [key]: value } : row)),
    );
  }

  function addSubcontractRow() {
    setSubcontractRows((current) => [...current, createEmptySubcontractRow()]);
  }

  function removeSubcontractRow(id: string) {
    setSubcontractRows((current) => (current.length > 1 ? current.filter((row) => row.id !== id) : [createEmptySubcontractRow()]));
  }

  function applySelectedManager(managerId: string) {
    const manager = resolveManager(managerId);
    setForm((current) => ({
      ...current,
      project_manager_user_id: manager?.user_id ?? "",
      project_manager_name: manager?.full_name ?? "",
      project_manager_email: manager?.email ?? "",
      project_manager_phone: manager?.phone ?? "",
    }));
  }

  return (
    <div className="space-y-6">
      {section === "summary" ? (
        <>
          <section className={`space-y-6 p-6 border border-line/40 bg-panel/30 shadow-card ${surfaceCard}`}>
            <div>
              <h3 className="text-base font-bold text-text">Project Admin Summary</h3>
              <p className="mt-1 text-xs text-muted/80 font-medium">
                Review operational status, ownership details, and configuration readiness.
              </p>
            </div>

            <section className="rounded-xl border border-line bg-panel2/50 p-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <SummaryField label="Project Name" value={form.project_name || "-"} />
                <SummaryField label="Project Code" value={form.project_code || "-"} />
                <SummaryField label="WBS Count" value={String(revenueWbsCount)} />
                <SummaryField label="Latest CN41 Refresh" value={latestUpload ? new Date(latestUpload).toLocaleDateString() : "-"} />
                <SummaryField label="Status" value={form.status || "Active"} />
                <SummaryField label="Project Manager" value={form.project_manager_name || "-"} />
                <SummaryField label="Subcontracts POs" value={String(projectSubcontracts.length)} />
                <SummaryField label="Active Accruals" value={String(subcontractSummary.activeCount)} />
                <SummaryField label="Total Accrued PO" value={projectSubcontracts.length ? formatCurrency(subcontractSummary.totalPoAmount) : "-"} />
                <SummaryField label="Calculations Base" value={`${manpowerRatesCount} Rates | ${materialMastersCount} Materials`} />
              </div>
            </section>

            <div className="grid gap-1.5 pt-2">
              <StatRow label="Client Name" value={form.client_name || "-"} />
              <StatRow label="Project Manager Email" value={form.project_manager_email || "-"} />
              <StatRow label="Project Manager Phone" value={form.project_manager_phone || "-"} />
              <StatRow label="Site Location" value={form.site_location || "-"} />
              <StatRow label="Subcontract Package Names" value={subcontractSummary.packageNames} />
            </div>

            <div className="flex flex-wrap justify-end gap-3 pt-3 border-t border-line/35">
              {canEdit && (
                <button
                  type="button"
                  onClick={recalculateFinancials}
                  disabled={recalculating}
                  className="rounded-lg bg-accent px-4 py-2.5 text-xs font-bold text-white hover:opacity-90 transition disabled:opacity-60 shadow-sm"
                >
                  {recalculating ? "Recalculating..." : "Recalculate WBS data"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowEditor((current) => !current)}
                className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-2.5 text-xs font-bold text-text hover:bg-panel2 transition shadow-sm"
              >
                {showEditor ? "Hide Edit Section" : (canEdit ? "Edit Project Details" : "View Project Details")}
                <ChevronDown className={cn("h-4 w-4 transition-transform", showEditor && "rotate-180")} />
              </button>
            </div>
          </section>

          {showEditor ? (
            <form onSubmit={saveProjectDetails} className={`space-y-6 p-6 border border-line/40 bg-panel/30 shadow-card ${surfaceCard}`}>
              <div>
                <h3 className="text-base font-bold text-text">{canEdit ? "Edit Project Details" : "Project Details"}</h3>
                <p className="mt-1 text-xs text-muted/80 font-medium font-sans">
                  {canEdit ? "Modify project attributes, owner profile tags, and execution status." : "View project attributes and owner profile tags."}
                </p>
              </div>

              <fieldset disabled={!canEdit} className="space-y-6">
                <section className="space-y-4">
                <div className="text-xs font-bold uppercase tracking-wider text-muted/95">Project Headers</div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <input className={inputClass} placeholder="Project code" value={form.project_code} onChange={(e) => setForm((c) => ({ ...c, project_code: e.target.value }))} />
                  <input className={inputClass} placeholder="Project name" value={form.project_name} onChange={(e) => setForm((c) => ({ ...c, project_name: e.target.value }))} />
                  <input className={inputClass} placeholder="Client name" value={form.client_name} onChange={(e) => setForm((c) => ({ ...c, client_name: e.target.value }))} />
                  <input className={inputClass} placeholder="Site location" value={form.site_location} onChange={(e) => setForm((c) => ({ ...c, site_location: e.target.value }))} />
                </div>
                <div className="max-w-xs">
                  <select className={inputClass} value={form.status} onChange={(e) => setForm((c) => ({ ...c, status: e.target.value }))}>
                    <option value="Active">Active</option>
                    <option value="On Hold">On Hold</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>
              </section>

              <section className="space-y-4">
                <div className="text-xs font-bold uppercase tracking-wider text-muted/95">Project Management</div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <select
                    className={inputClass}
                    value={form.project_manager_user_id}
                    onChange={(e) => applySelectedManager(e.target.value)}
                  >
                    <option value="">Select project manager</option>
                    {projectManagers.map((manager) => (
                      <option key={manager.user_id} value={manager.user_id}>
                        {manager.full_name || manager.email}
                      </option>
                    ))}
                  </select>
                  <input
                    className={`${inputClass} bg-panel2/50`}
                    placeholder="Project manager email"
                    value={form.project_manager_email}
                    readOnly
                  />
                  <input
                    className={`${inputClass} bg-panel2/50`}
                    placeholder="Project manager phone"
                    value={form.project_manager_phone}
                    readOnly
                  />
                </div>
                <div className="text-[11px] text-muted font-medium">
                  Note: Selection references user profiles. Email and phone details load automatically.
                </div>
              </section>

              </fieldset>

              {canEdit && (
                <div className="flex items-center gap-3 pt-3 border-t border-line/35">
                  <button disabled={saving} className="rounded-lg bg-accent px-5 py-3 text-xs font-bold text-white hover:opacity-90 transition disabled:opacity-60 shadow-sm">
                    {saving ? "Saving..." : "Save Project Details"}
                  </button>
                  {message ? (
                    <span className="text-xs font-bold text-accent bg-accent/5 border border-accent/15 px-3 py-2 rounded-md">
                      {message}
                    </span>
                  ) : null}
                </div>
              )}
            </form>
          ) : null}
        </>
      ) : null}

      {section === "subcontracts" ? (
        <form onSubmit={saveSubcontracts} className={`space-y-6 p-6 border border-line/40 bg-panel/30 shadow-card ${surfaceCard}`}>
          <div>
            <h3 className="text-base font-bold text-text">Subcontractor Packages Configuration</h3>
            <p className="mt-1 text-xs text-muted/80 font-medium">
              Maintain project subcontractor packages. Registered lines display inside PM updates wizards.
            </p>
          </div>

          <fieldset disabled={!canEdit} className="space-y-4">
            <div className="flex items-center justify-between gap-3 border-b border-line/35 pb-2">
              <div>
                <div className="text-xs font-bold text-text">Package Registers</div>
                <div className="text-[10px] text-muted font-medium mt-1">
                  Define structural PO amounts and contract titles (Civil, Fiber, Mechanical).
                </div>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={addSubcontractRow}
                  className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-3.5 py-2 text-xs font-bold text-text hover:bg-panel2 transition shadow-sm"
                >
                  <Plus className="h-4 w-4 text-accent" />
                  Add Package
                </button>
              )}
            </div>

            <div className="space-y-4">
              {subcontractRows.map((row, index) => (
                <div key={row.id} className="rounded-xl border border-line bg-panel/40 p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between gap-3 border-b border-line/35 pb-2">
                    <div className="text-xs font-bold text-text">Accrual Package #{index + 1}</div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => removeSubcontractRow(row.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-danger/20 bg-danger/5 px-3 py-1.5 text-[10px] font-bold text-danger hover:bg-danger hover:text-white transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    <input className={inputClass} placeholder="Package name (Civil / Fiber)" value={row.package_name} onChange={(e) => updateSubcontractRow(row.id, "package_name", e.target.value)} />
                    <input className={inputClass} placeholder="Subcontractor / Vendor" value={row.subcontractor_name} onChange={(e) => updateSubcontractRow(row.id, "subcontractor_name", e.target.value)} />
                    <input className={inputClass} placeholder="PO reference" value={row.po_number} onChange={(e) => updateSubcontractRow(row.id, "po_number", e.target.value)} />
                    <input className={inputClass} type="number" step="0.01" placeholder="PO value amount" value={row.po_amount} onChange={(e) => updateSubcontractRow(row.id, "po_amount", e.target.value)} />
                    <select className={inputClass} value={row.status} onChange={(e) => updateSubcontractRow(row.id, "status", e.target.value)}>
                      <option value="Active">Active</option>
                      <option value="On Hold">On Hold</option>
                      <option value="Closed">Closed</option>
                    </select>
                  </div>

                  <textarea
                    className="w-full rounded-lg border border-line bg-panel px-4 py-3 text-xs text-text outline-none focus:border-accent shadow-sm min-h-[90px]"
                    placeholder="Describe PO scope or remarks..."
                    value={row.scope}
                    onChange={(e) => updateSubcontractRow(row.id, "scope", e.target.value)}
                  />
                </div>
              ))}
            </div>
          </fieldset>

          {canEdit && (
            <div className="flex items-center gap-3 pt-3 border-t border-line/35">
              <button disabled={saving} className="rounded-lg bg-accent px-5 py-3 text-xs font-bold text-white hover:opacity-90 transition disabled:opacity-60 shadow-sm">
                {saving ? "Saving..." : "Save Subcontracts"}
              </button>
              {message ? (
                <span className="text-xs font-bold text-accent bg-accent/5 border border-accent/15 px-3 py-2 rounded-md">
                  {message}
                </span>
              ) : null}
            </div>
          )}
        </form>
      ) : null}
    </div>
  );
}

const inputClass = "rounded-lg border border-line bg-panel px-3 py-2.5 text-xs text-text outline-none focus:border-accent focus:ring-1 focus:ring-accent transition shadow-sm w-full";

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-4 shadow-sm">
      <div className="section-kicker text-muted/70 font-semibold tracking-wider">{label}</div>
      <div className="mt-2 text-xs font-bold text-text truncate">{value}</div>
    </div>
  );
}

function createEmptySubcontractRow(): EditableSubcontractRow {
  return {
    id: crypto.randomUUID(),
    package_name: "",
    subcontractor_name: "",
    po_number: "",
    po_amount: "",
    scope: "",
    status: "Active",
  };
}

