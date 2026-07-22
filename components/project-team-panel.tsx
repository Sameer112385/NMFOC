"use client";

import { useState, useEffect } from "react";
import { UserPlus, X, Loader2, Users } from "lucide-react";
import type { ProjectTeamMember } from "@/lib/types";

interface Props {
  projectId: string;
  initialMembers: ProjectTeamMember[];
  canEdit: boolean;
}

export function ProjectTeamPanel({ projectId, initialMembers, canEdit }: Props) {
  const [members, setMembers] = useState<ProjectTeamMember[]>(initialMembers);
  const [availableUsers, setAvailableUsers] = useState<ProjectTeamMember[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [roleLabel, setRoleLabel] = useState("Coordinator");
  const [saving, setSaving] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    (async () => {
      setLoadingUsers(true);
      try {
        const res = await fetch("/api/admin/users");
        if (res.ok) {
          const data = await res.json();
          setAvailableUsers(
            (data.users || []).map((u: any) => ({
              user_id: u.user_id || u.id,
              email: u.email,
              full_name: u.full_name,
              role_label: u.role,
            }))
          );
        }
      } catch {
        // ignore
      } finally {
        setLoadingUsers(false);
      }
    })();
  }, []);

  const unassigned = availableUsers.filter(
    (u) => !members.some((m) => m.user_id === u.user_id || m.email === u.email)
  );

  async function saveMembers(updated: ProjectTeamMember[]) {
    setSaving(true);
    try {
      const res = await fetch(`/api/project-team/${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_users: updated }),
      });
      if (res.ok) {
        setMembers(updated);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  function handleAdd() {
    const user = availableUsers.find((u) => u.user_id === selectedUserId);
    if (!user) return;
    const newMember: ProjectTeamMember = {
      user_id: user.user_id,
      email: user.email,
      full_name: user.full_name,
      role_label: roleLabel,
    };
    const updated = [...members, newMember];
    setSelectedUserId("");
    saveMembers(updated);
  }

  function handleRemove(userId: string) {
    saveMembers(members.filter((m) => m.user_id !== userId));
  }

  function handleRoleChange(userId: string, newRole: string) {
    const updated = members.map((m) =>
      m.user_id === userId ? { ...m, role_label: newRole } : m
    );
    saveMembers(updated);
  }

  return (
    <div className="space-y-6">
      <div className="surface-card border border-line bg-panel/30 rounded-3xl p-6">
        <h3 className="text-sm font-bold text-text uppercase tracking-wider mb-1 flex items-center gap-2">
          <Users className="h-4 w-4 text-accent" />
          Project Team
        </h3>
        <p className="text-xs text-muted mb-5">
          Assigned team members can submit PM Daily Updates for this project.
        </p>

        {/* Current members */}
        {members.length > 0 ? (
          <div className="space-y-2 mb-5">
            {members.map((m) => (
              <div
                key={m.user_id}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-text truncate">
                    {m.full_name || m.email}
                  </p>
                  <p className="text-[10px] text-muted truncate">{m.email}</p>
                </div>
                <select
                  value={m.role_label}
                  disabled={!canEdit || saving}
                  onChange={(e) => handleRoleChange(m.user_id, e.target.value)}
                  className="rounded-lg border border-line bg-panel2 px-3 py-1.5 text-[10px] font-bold text-text outline-none focus:border-accent transition disabled:opacity-50"
                >
                  <option value="Coordinator">Coordinator</option>
                  <option value="Engineer">Engineer</option>
                  <option value="Supervisor">Supervisor</option>
                  <option value="Inspector">Inspector</option>
                  <option value="Planner">Planner</option>
                </select>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleRemove(m.user_id)}
                    disabled={saving}
                    className="rounded-lg p-1.5 text-muted hover:text-red-500 hover:bg-red-500/10 transition disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-line bg-panel2/20 px-4 py-8 text-center mb-5">
            <p className="text-xs text-muted">No team members assigned yet.</p>
            <p className="text-[10px] text-muted/70 mt-1">
              Only the Project Manager can submit updates until team members are added.
            </p>
          </div>
        )}

        {/* Add member */}
        {canEdit && (
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <label className="block text-[10px] font-bold text-muted uppercase tracking-wider">
                Add Team Member
              </label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                disabled={loadingUsers || saving}
                className="w-full rounded-xl border border-line bg-panel px-4 py-2.5 text-xs text-text outline-none focus:border-accent transition disabled:opacity-50"
              >
                <option value="">
                  {loadingUsers ? "Loading users..." : "Select a user..."}
                </option>
                {unassigned.map((u) => (
                  <option key={u.user_id} value={u.user_id}>
                    {u.full_name || u.email} ({u.role_label})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-muted uppercase tracking-wider">
                Role
              </label>
              <select
                value={roleLabel}
                onChange={(e) => setRoleLabel(e.target.value)}
                disabled={saving}
                className="rounded-xl border border-line bg-panel px-4 py-2.5 text-xs text-text outline-none focus:border-accent transition disabled:opacity-50"
              >
                <option value="Coordinator">Coordinator</option>
                <option value="Engineer">Engineer</option>
                <option value="Supervisor">Supervisor</option>
                <option value="Inspector">Inspector</option>
                <option value="Planner">Planner</option>
              </select>
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!selectedUserId || saving}
              className="flex items-center gap-2 rounded-xl bg-accent text-white px-4 py-2.5 text-xs font-semibold shadow hover:bg-accent-hover active:scale-[0.98] transition disabled:opacity-50 disabled:pointer-events-none"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UserPlus className="h-3.5 w-3.5" />
              )}
              Add
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
