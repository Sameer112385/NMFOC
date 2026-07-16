"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Loader2, RotateCcw, Save, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DASHBOARD_WIDGETS,
  type DashboardLayout,
  type WidgetStatus,
} from "@/lib/dashboard-widgets";

function statusHidden(status: WidgetStatus | undefined): boolean {
  return status === "hidden" || status === "archived";
}

export function DashboardCustomizePanel({
  projectId,
  projectName,
  onClose,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
}) {
  const [global, setGlobal] = useState<DashboardLayout>({});
  const [override, setOverride] = useState<DashboardLayout>({});
  const [initialOverride, setInitialOverride] = useState<DashboardLayout>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/dashboard-layout/${projectId}`);
        const data = (await res.json()) as { global?: DashboardLayout; project?: DashboardLayout };
        setGlobal(data.global ?? {});
        setOverride(data.project ?? {});
        setInitialOverride(data.project ?? {});
      } catch {
        setMessage("Could not load this project's layout.");
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof DASHBOARD_WIDGETS>();
    for (const w of DASHBOARD_WIDGETS) {
      const list = map.get(w.group) ?? [];
      list.push(w);
      map.set(w.group, list);
    }
    return Array.from(map.entries());
  }, []);

  const dirty = useMemo(
    () => JSON.stringify(override) !== JSON.stringify(initialOverride),
    [override, initialOverride],
  );
  const overrideCount = Object.keys(override).length;

  function toggle(id: string) {
    setMessage("");
    setOverride((prev) => {
      const next = { ...prev };
      const effectiveHidden = statusHidden(next[id] ?? global[id]);
      const newStatus: WidgetStatus = effectiveHidden ? "active" : "hidden";
      const globalStatus: WidgetStatus = global[id] ?? "active";
      // Keep the override minimal: if the new choice matches the global default, drop it
      // (inherit) rather than storing a redundant explicit value.
      if (newStatus === globalStatus) delete next[id];
      else next[id] = newStatus;
      return next;
    });
  }

  function resetToGlobal() {
    setMessage("");
    setOverride({});
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/dashboard-layout/${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout: override }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unable to save.");
      // Reload so the dashboard re-reads the effective layout on the server.
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save.");
      setSaving(false);
    }
  }

  return (
    <div className="no-print rounded-2xl border border-accent/30 bg-panel/95 p-5 shadow-card backdrop-blur-md">
      <div className="flex flex-col gap-3 border-b border-line/40 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-bold text-text">Customize this dashboard</h3>
          <p className="mt-0.5 text-xs text-muted">
            Show or hide visuals for <span className="font-semibold text-text">{projectName}</span> only. Inherits the
            global default; your changes here override it for this project.
            {overrideCount > 0 ? ` ${overrideCount} override${overrideCount === 1 ? "" : "s"} set.` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={resetToGlobal}
            disabled={loading || saving || overrideCount === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel2 px-3 py-2 text-[11px] font-bold text-muted transition hover:text-text disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to global
          </button>
          <button
            type="button"
            onClick={save}
            disabled={loading || saving || !dirty}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[11px] font-bold text-white shadow-sm transition hover:bg-accent/90 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save &amp; apply
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-panel2 text-muted transition hover:text-text"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {message ? (
        <div className="mt-4 rounded-lg border border-line/50 bg-panel2/50 px-3 py-2 text-xs font-medium text-muted">
          {message}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="mt-4 max-h-[460px] space-y-5 overflow-y-auto pr-1">
          {groups.map(([group, widgets]) => (
            <div key={group}>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted/80">{group}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {widgets.map((w) => {
                  const overridden = w.id in override;
                  const hidden = statusHidden(override[w.id] ?? global[w.id]);
                  return (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => toggle(w.id)}
                      title={hidden ? "Hidden — click to show" : "Visible — click to hide"}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition",
                        hidden
                          ? "border-line/50 bg-panel2/40 text-muted"
                          : "border-accent/25 bg-accent/5 text-text hover:border-accent/40",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className={cn("truncate text-xs font-semibold", hidden && "line-through")}>{w.title}</span>
                        {overridden ? (
                          <span className="shrink-0 rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-accent">
                            Override
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                          hidden ? "bg-panel text-muted" : "bg-accent/15 text-accent",
                        )}
                      >
                        {hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        {hidden ? "Hidden" : "Shown"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
