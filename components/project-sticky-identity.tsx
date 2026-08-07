"use client";

import { useEffect, useState } from "react";

export function ProjectStickyIdentity({ projectName, projectCode }: { projectName: string; projectCode: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setVisible(window.scrollY > 72);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      document.documentElement.style.removeProperty("--project-identity-height");
    };
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--project-identity-height", visible ? "44px" : "0px");
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="no-print fixed inset-x-0 top-[52px] z-30 border-b border-line bg-bg py-2 shadow-sm">
      <div className="flex items-center gap-3 px-4 text-sm md:px-6 lg:ml-[var(--app-sidebar-width,272px)] lg:px-8">
        <span className="font-bold text-text">Project: {projectName}</span>
        <span className="font-mono text-xs font-semibold text-muted">{projectCode}</span>
      </div>
    </div>
  );
}