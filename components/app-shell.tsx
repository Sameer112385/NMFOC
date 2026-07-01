"use client";

import { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'sap-cn41-sidebar-open';

export function AppShell({ children, userRole, userName }: { children: React.ReactNode; userRole?: string | null; userName?: string | null }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved !== null) setSidebarOpen(saved === 'true');
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(sidebarOpen));
    } catch {
      // ignore
    }
  }, [sidebarOpen]);

  return (
    <div className="min-h-screen bg-bg text-text">
      <Sidebar open={sidebarOpen} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} userRole={userRole} userName={userName} />

      {mobileOpen ? (
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-slate-950/35 backdrop-blur-[1px] lg:hidden"
          aria-label="Close navigation"
        />
      ) : null}

      <div
        className={cn(
          'min-h-screen transition-[margin-left] duration-300 ease-out',
          sidebarOpen ? 'lg:ml-[272px]' : 'lg:ml-[72px]',
        )}
      >
        <Topbar onOpenMobile={() => setMobileOpen(true)} sidebarOpen={sidebarOpen} />
        <main className="px-4 pb-8 pt-5 md:px-6 lg:px-8">
          <div className="w-full">{children}</div>
        </main>
      </div>

      <button
        type="button"
        onClick={() => setSidebarOpen((value) => !value)}
        className={cn(
          'fixed top-[26px] z-50 hidden h-8 w-8 items-center justify-center rounded-lg border border-line bg-panel shadow-sm text-muted hover:text-accent hover:border-accent/40 hover:bg-panel2 transition-all lg:inline-flex',
          sidebarOpen ? 'left-[256px]' : 'left-[56px]',
        )}
        aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        <Menu className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-40 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-panel shadow-sm text-text lg:hidden hover:bg-panel2"
        aria-label="Open navigation"
      >
        <Menu className="h-4 w-4" />
      </button>
    </div>
  );
}

