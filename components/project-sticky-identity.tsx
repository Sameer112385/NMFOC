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
    <div className="no-print fixed left-0 right-0 top-[70px] z-30 border-b border-line/60 bg-page/95 px-4 py-2 shadow-sm backdrop-blur-md md:px-6 lg:left-[var(--app-sidebar-width,272px)] lg:px-8">
      <div className="mx-auto flex max-w-[1800px] items-center gap-3 text-sm">
        <span className="font-bold text-text">Project: {projectName}</span>
        <span className="font-mono text-xs font-semibold text-muted">{projectCode}</span>
      </div>
    </div>
  );
}