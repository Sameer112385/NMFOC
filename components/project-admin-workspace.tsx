"use client";

import { useState } from "react";
import { ProjectAdminDetailsForm } from "@/components/project-admin-details-form";
import { ProjectMasterAdminPanel } from "@/components/project-master-admin-panel";
import { ProjectCostElementControlPanel } from "@/components/project-cost-element-control-panel";
import { ProjectWbsMasterPanel } from "@/components/project-wbs-master-panel";
import { ProjectTeamPanel } from "@/components/project-team-panel";
import { cn } from "@/lib/utils";
import type { Project, ProjectCostElementControl, ProjectManpowerRate, ProjectMaterialMaster, ProjectSubcontract, ProjectWbsMaster, RevenueWBS, UserProfile } from "@/lib/types";

type Props = {
  project: Project;
  revenueWbs: RevenueWBS[];
  manpowerRates: ProjectManpowerRate[];
  materialMasters: ProjectMaterialMaster[];
  projectSubcontracts: ProjectSubcontract[];
  projectWbsMaster: ProjectWbsMaster[];
  projectCostElements: ProjectCostElementControl[];
  projectManagers: UserProfile[];
  latestUpload: string | null;
  canEdit: boolean;
};

const tabs = [
  { key: "summary", label: "Project Summary" },
  { key: "wbs-master", label: "WBS Master" },
  { key: "cost-elements", label: "Cost Element Control" },
  { key: "manpower", label: "Manpower Master" },
  { key: "material", label: "Material Master" },
  { key: "subcontracts", label: "Subcontractor Management" },
  { key: "team", label: "Project Team" },
] as const;

export function ProjectAdminWorkspace({
  project,
  revenueWbs,
  manpowerRates,
  materialMasters,
  projectSubcontracts,
  projectWbsMaster,
  projectCostElements,
  projectManagers,
  latestUpload,
  canEdit,
}: Props) {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["key"]>("summary");

  return (
    <div className="space-y-6">
      {/* Read-only access banner */}
      {!canEdit && (
        <div className="flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning/5 px-5 py-3.5 text-sm font-semibold text-warning">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
          </span>
          <span>View Only — You do not have permission to edit project master data. Contact an Admin or Cost Controller.</span>
        </div>
      )}
      <div className="sticky top-[74px] z-10 rounded-xl border border-line bg-panel/85 p-2 shadow-sm backdrop-blur">
        <div className="flex flex-wrap gap-1.5">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
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
      </div>

      {activeTab === "summary" ? (
        <ProjectAdminDetailsForm
          project={project}
          revenueWbsCount={revenueWbs.length}
          latestUpload={latestUpload}
          manpowerRatesCount={manpowerRates.length}
          materialMastersCount={materialMasters.length}
          projectSubcontracts={projectSubcontracts}
          projectManagers={projectManagers}
          section="summary"
          canEdit={canEdit}
        />
      ) : null}

      {activeTab === "manpower" ? (
        <ProjectMasterAdminPanel
          projectId={project.id}
          projectName={project.project_name}
          revenueWbs={revenueWbs}
          projectWbsMaster={projectWbsMaster}
          manpowerRates={manpowerRates}
          materialMasters={materialMasters}
          section="manpower"
          canEdit={canEdit}
        />
      ) : null}

      {activeTab === "wbs-master" ? (
        <ProjectWbsMasterPanel
          projectId={project.id}
          rows={projectWbsMaster}
          canEdit={canEdit}
        />
      ) : null}

      {activeTab === "cost-elements" ? (
        <ProjectCostElementControlPanel
          projectId={project.id}
          rows={projectCostElements}
          canEdit={canEdit}
        />
      ) : null}

      {activeTab === "material" ? (
        <ProjectMasterAdminPanel
          projectId={project.id}
          projectName={project.project_name}
          revenueWbs={revenueWbs}
          projectWbsMaster={projectWbsMaster}
          manpowerRates={manpowerRates}
          materialMasters={materialMasters}
          section="material"
          canEdit={canEdit}
        />
      ) : null}

      {activeTab === "subcontracts" ? (
        <ProjectAdminDetailsForm
          project={project}
          revenueWbsCount={revenueWbs.length}
          latestUpload={latestUpload}
          manpowerRatesCount={manpowerRates.length}
          materialMastersCount={materialMasters.length}
          projectSubcontracts={projectSubcontracts}
          projectManagers={projectManagers}
          section="subcontracts"
          canEdit={canEdit}
        />
      ) : null}

      {activeTab === "team" ? (
        <ProjectTeamPanel
          projectId={project.id}
          initialMembers={project.assigned_users ?? []}
          canEdit={canEdit}
        />
      ) : null}
    </div>
  );
}

