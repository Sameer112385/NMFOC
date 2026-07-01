"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, Menu } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function Topbar({
  onOpenMobile,
  sidebarOpen,
}: {
  onOpenMobile: () => void;
  sidebarOpen: boolean;
}) {
  const pathname = usePathname() ?? '';
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const hasDemo = Boolean(window.localStorage.getItem('sap-cn41-demo-session'));
    if (hasDemo) {
      setIsLoggedIn(true);
      return;
    }

    const isSupabaseConfigured =
      Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
      Boolean(
        window.localStorage.getItem('sap-cn41-supabase-url') &&
          window.localStorage.getItem('sap-cn41-supabase-anon-key')
      );

    if (isSupabaseConfigured) {
      try {
        const supabase = createSupabaseBrowserClient();
        supabase.auth.getSession()
          .then(({ data }) => setIsLoggedIn(Boolean(data?.session)))
          .catch(() => {});
      } catch {
        // ignore
      }
    }
  }, []);

  let moduleName = "Dashboard";
  if (pathname.startsWith('/projects')) {
    moduleName = "Projects";
  } else if (pathname.startsWith('/reports')) {
    moduleName = "Reports";
  } else if (pathname.startsWith('/upload-cn41')) {
    moduleName = "Financial Sources";
  } else if (pathname.startsWith('/pm-daily-updates')) {
    moduleName = "PM Daily Updates";
  } else if (pathname.startsWith('/simulation')) {
    moduleName = "Financial Performance";
  } else if (pathname.startsWith('/sap-vs-simulation')) {
    moduleName = "Source Comparison";
  } else if (pathname.startsWith('/risk-alerts')) {
    moduleName = "Risk Alerts";
  } else if (pathname.startsWith('/comments')) {
    moduleName = "Comments";
  } else if (pathname.startsWith('/settings')) {
    moduleName = "Settings";
  }

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-panel shadow-[0_2px_12px_-2px_rgba(15,23,42,0.08)]">
      <div className="flex w-full items-center justify-between gap-4 px-6 py-4 md:px-8">
        {/* Left — mobile hamburger + page title */}
        <div className="flex min-w-0 items-center gap-4">
          <button
            type="button"
            onClick={onOpenMobile}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line/80 bg-panel shadow-sm lg:hidden hover:bg-panel2"
            aria-label="Open navigation"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="w-1 h-5 rounded-full bg-gradient-to-b from-indigo-500 to-violet-500 flex-none" />
              <div className="text-[16px] font-extrabold tracking-tight text-text">{moduleName}</div>
            </div>
          </div>
        </div>

        {/* Right — Log Out only */}
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-xl border border-line/60 bg-panel px-4 py-2 text-xs font-semibold text-text hover:border-accent hover:text-accent hover:bg-accent/5 transition shadow-sm"
          >
            <LogOut className="h-3.5 w-3.5" />
            {isLoggedIn ? 'Log Out' : 'Login'}
          </Link>
        </div>
      </div>
    </header>
  );
}
