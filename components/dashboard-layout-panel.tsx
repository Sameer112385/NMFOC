"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Loader2, RotateCcw, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DASHBOARD_WIDGETS,
  type DashboardLayout,
  type WidgetStatus,
} from "@/lib/dashboard-widgets";

// The panel treats visibility as a simple two-state toggle. "archived" is kept as a
// valid stored status (for a future review area) but is shown here as Hidden.
function isHidden(status: WidgetStatus | undefined): boolean {
  return status === "hidden" || status === "archived";
}

export function DashboardLayoutPanel() {
  const [layout, setLayout] = useState<DashboardLayout>({});
  const [initialLayout, setInitialLayout] = useState<DashboardLayout>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings/dashboard-layout");
        const data = (await res.json()) as { layout?: DashboardLayout };
        setLayout(data.layout ?? {});
        setInitialLayout(data.layout ?? {});
      } catch {
        setMessage("Could not load the current dashboard layout.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Preserve registry order within each group.
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
    () => JSON.stringify(layout) !== JSON.stringify(initialLayout),
    [layout, initialLayout],
  );

  const hiddenCount = DASHBOARD_WIDGETS.filter((w) => isHidden(layout[w.id])).length;

  function toggle(id: string) {
    setMessage("");
    setLayout((prev) => {
      const next = { ...prev };
      if (isHidden(next[id])) {
        delete next[id]; // restoring => remove the override (default is active)
      } else {
        next[id] = "hidden";
      }
      return next;
    });
  }

  function showAll() {
    setMessage("");
    setLayout({});
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/settings/dashboard-layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unable to save.");
      const saved = (data.layout ?? {}) as DashboardLayout;
      setLayout(saved);
      setInitialLayout(saved);
      setMessage("Saved. Reload the dashboard to see the changes.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-medium text-muted">
          {hiddenCount > 0 ? `${hiddenCount} visual${hiddenCount === 1 ? "" : "s"} currently hidden.` : "All visuals are shown."}
        </p>
        <div className="no-print flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={showAll}
            disabled={loading || saving || hiddenCount === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel2 px-3 py-2 text-[11px] font-bold text-muted transition hover:text-text disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Show all
          </button>
          <button
            type="button"
            onClick={save}
            disabled={loading || saving || !dirty}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[11px] font-bold text-white shadow-sm transition hover:bg-accent/90 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save changes
          </button>
        </div>
      </div>

      {message ? (
        <div className="mt-4 rounded-lg border border-line/50 bg-panel2/50 px-3 py-2 text-xs font-medium text-muted">
          {message}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading layout…
        </div>
      ) : (
        <div className="mt-4 space-y-6">
          {groups.map(([group, widgets]) => (
            <div key={group}>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted/80">{group}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {widgets.map((w) => {
                  const hidden = isHidden(layout[w.id]);
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
                      <span className={cn("truncate text-xs font-semibold", hidden && "line-through")}>
                        {w.title}
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
