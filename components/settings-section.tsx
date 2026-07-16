"use client";

import { useState, type ReactNode } from "react";
import {
  ChevronDown,
  LayoutDashboard,
  Palette,
  Users,
  Server,
  AlertTriangle,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { surfaceCard } from "@/components/ui";

// Icon lookup by name: a Server Component (the Settings page) cannot pass a component
// function across the client boundary, so it passes a string key instead.
const ICONS = {
  dashboard: LayoutDashboard,
  branding: Palette,
  users: Users,
  system: Server,
  danger: AlertTriangle,
  env: KeyRound,
  roles: ShieldCheck,
} as const;

export type SettingsIcon = keyof typeof ICONS;

// Collapsible settings "sub-module". Owns the card chrome and the accordion header so the
// panels it wraps can render in a header-less "embedded" mode without duplicate titles.
export function SettingsSection({
  title,
  description,
  icon,
  defaultOpen = false,
  tone = "default",
  children,
}: {
  title: string;
  description?: string;
  icon?: SettingsIcon;
  defaultOpen?: boolean;
  tone?: "default" | "danger";
  children: ReactNode;
}) {
  const Icon = icon ? ICONS[icon] : null;
  const [open, setOpen] = useState(defaultOpen);
  const danger = tone === "danger";

  return (
    <div className={cn(surfaceCard, "overflow-hidden", danger && "border-danger/40")}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-panel2/30"
      >
        <div className="flex items-center gap-3">
          {Icon ? (
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                danger ? "bg-danger/10 text-danger" : "bg-accent/10 text-accent",
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
          ) : null}
          <div>
            <h3 className={cn("text-base font-bold", danger ? "text-danger" : "text-text")}>{title}</h3>
            {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
          </div>
        </div>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open ? <div className="border-t border-line/40 p-5">{children}</div> : null}
    </div>
  );
}
