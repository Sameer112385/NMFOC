"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import {
  LayoutDashboard,
  FolderKanban,
  BarChart2,
  Upload,
  CalendarCheck,
  TrendingUp,
  GitCompare,
  ShieldAlert,
  MessageCircle,
  SlidersHorizontal,
  MoreHorizontal,
  Sun,
  Moon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const LOGO_BASE_SRC = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cn41-files/global/logo.png`
  : null;

const THEME_STORAGE_KEY = 'sap-cn41-theme';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  // icon background + color in light mode / dark mode (Tailwind classes)
  iconBgLight: string;
  iconColorLight: string;
  iconBgDark: string;
  iconColorDark: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard',  icon: LayoutDashboard,   iconBgLight: 'bg-blue-100',   iconColorLight: 'text-blue-600',   iconBgDark: 'bg-blue-500/20',   iconColorDark: 'text-blue-300'   },
      { href: '/projects',  label: 'Projects',   icon: FolderKanban,      iconBgLight: 'bg-sky-100',    iconColorLight: 'text-sky-600',    iconBgDark: 'bg-sky-500/20',    iconColorDark: 'text-sky-300'    },
      { href: '/reports',   label: 'Reports',    icon: BarChart2,          iconBgLight: 'bg-cyan-100',   iconColorLight: 'text-cyan-700',   iconBgDark: 'bg-cyan-500/20',   iconColorDark: 'text-cyan-300'   },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/upload-cn41',      label: 'Financial Sources', icon: Upload,        iconBgLight: 'bg-amber-100',  iconColorLight: 'text-amber-700',  iconBgDark: 'bg-amber-500/20',  iconColorDark: 'text-amber-300'  },
      { href: '/pm-daily-updates', label: 'PM Daily Updates',  icon: CalendarCheck, iconBgLight: 'bg-orange-100', iconColorLight: 'text-orange-700', iconBgDark: 'bg-orange-500/20', iconColorDark: 'text-orange-300' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { href: '/simulation',        label: 'Financial Performance', icon: TrendingUp,        iconBgLight: 'bg-violet-100',  iconColorLight: 'text-violet-700',  iconBgDark: 'bg-violet-500/20',  iconColorDark: 'text-violet-300'  },
      { href: '/sap-vs-simulation', label: 'Source Comparison',    icon: GitCompare,        iconBgLight: 'bg-purple-100',  iconColorLight: 'text-purple-700',  iconBgDark: 'bg-purple-500/20',  iconColorDark: 'text-purple-300'  },
      { href: '/risk-alerts',       label: 'Risk Alerts',          icon: ShieldAlert,       iconBgLight: 'bg-rose-100',    iconColorLight: 'text-rose-600',    iconBgDark: 'bg-rose-500/20',    iconColorDark: 'text-rose-300'    },
      { href: '/comments',          label: 'Comments',             icon: MessageCircle,     iconBgLight: 'bg-emerald-100', iconColorLight: 'text-emerald-700', iconBgDark: 'bg-emerald-500/20', iconColorDark: 'text-emerald-300' },
      { href: '/settings',          label: 'Settings',             icon: SlidersHorizontal, iconBgLight: 'bg-slate-100',   iconColorLight: 'text-slate-600',   iconBgDark: 'bg-slate-500/20',   iconColorDark: 'text-slate-300'   },
    ],
  },
];

export function Sidebar({
  open,
  mobileOpen,
  onCloseMobile,
  userRole,
  userName,
}: {
  open: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  userRole?: string | null;
  userName?: string | null;
}) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [logoError, setLogoError] = useState(false);
  const [logoTimestamp, setLogoTimestamp] = useState<string>('');
  const [companyName, setCompanyName] = useState('DETASAD');
  const [companySubtext, setCompanySubtext] = useState('Control Center');

  useEffect(() => {
    setLogoTimestamp(window.localStorage.getItem('logo_timestamp') || '');
    setCompanyName(window.localStorage.getItem('company_name') || 'DETASAD');
    setCompanySubtext(window.localStorage.getItem('company_subtext') || 'Control Center');

    const handleLogoUpdate = () => {
      setLogoTimestamp(window.localStorage.getItem('logo_timestamp') || String(Date.now()));
      setCompanyName(window.localStorage.getItem('company_name') || 'DETASAD');
      setCompanySubtext(window.localStorage.getItem('company_subtext') || 'Control Center');
      setLogoError(false);
    };
    window.addEventListener('logo-updated', handleLogoUpdate);
    return () => {
      window.removeEventListener('logo-updated', handleLogoUpdate);
    };
  }, []);

  const logoUrl = LOGO_BASE_SRC
    ? (logoTimestamp ? `${LOGO_BASE_SRC}?t=${logoTimestamp}` : LOGO_BASE_SRC)
    : null;

  useEffect(() => {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    const initial = saved === 'light' || saved === 'dark' ? saved : 'light';
    setTheme(initial);
    const sync = () => {
      const cur = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (cur === 'light' || cur === 'dark') setTheme(cur);
    };
    window.addEventListener('storage', sync);
    const t = setInterval(sync, 1000);
    return () => { window.removeEventListener('storage', sync); clearInterval(t); };
  }, []);

  const applyTheme = (next: 'light' | 'dark') => {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  };

  const isDark = theme === 'dark';

  const allowedRoutes = (() => {
    const role = userRole ?? 'Viewer';
    const map: Record<string, string[]> = {
      'Admin':            ['*'],
      'Cost Controller':  ['/dashboard', '/projects', '/reports', '/upload-cn41', '/pm-daily-updates', '/simulation', '/sap-vs-simulation', '/risk-alerts', '/comments'],
      'Project Manager':  ['/dashboard', '/projects', '/pm-daily-updates'],
      'Viewer':           ['/dashboard', '/projects'],
    };
    return map[role] ?? map['Viewer'];
  })();

  const visibleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        allowedRoutes.includes('*') || allowedRoutes.includes(item.href)
      ),
    }))
    .filter((section) => section.items.length > 0);

  const initials = (userName || userRole || 'U')
    .trim().split(/\s+/).map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  const email = userName
    ? `${userName.toLowerCase().replace(/\s+/g, '.')}@detasad.com`
    : 'user@detasad.com';

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={onCloseMobile}
          aria-label="Close navigation"
        />
      )}

      <aside
        className={cn(
          'sidebar-bg sidebar-border',
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r',
          isDark
            ? 'shadow-[6px_0_32px_-4px_rgba(0,0,0,0.5)]'
            : 'shadow-[4px_0_20px_-4px_rgba(15,23,42,0.08)]',
          'transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden',
          open ? 'w-[272px]' : 'w-[72px]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
        aria-label="Application navigation"
      >
        {/* Dark mode top glow — hidden in light mode via CSS */}
        <div className="sidebar-glow absolute inset-x-0 top-0 h-44 pointer-events-none" />

        {/* ── HEADER ─────────────────────────────────────────────── */}
        <div className={cn(
          'sidebar-header-border relative flex-none h-[65px] flex items-center border-b',
          open ? 'px-5' : 'px-0 justify-center',
        )}>
          {open ? (
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="relative w-12 h-12 flex-none">
                {logoUrl && !logoError ? (
                  <div className={cn(
                    'w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center',
                    isDark ? 'border border-white/15 bg-white/10' : 'border border-line bg-panel',
                  )}>
                    <Image src={logoUrl} alt="Logo" width={48} height={48}
                      className="object-contain w-full h-full p-1"
                      unoptimized
                      onError={() => { setLogoError(true); }} />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-[0_4px_14px_rgba(99,102,241,0.4)]">
                    <span className="text-[19px] font-black text-white tracking-tight">
                      {companyName ? companyName.charAt(0).toUpperCase() : 'D'}
                    </span>
                  </div>
                )}
                <span className={cn(
                  'absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2',
                  isDark ? 'border-[#0d1117]' : 'border-white',
                )} />
              </div>
              <div>
                <p className="sidebar-heading text-[17px] font-extrabold tracking-tight leading-none">{companyName}</p>
                <p className="sidebar-subtext text-[10px] font-bold uppercase mt-1 tracking-wider">{companySubtext}</p>
              </div>
            </div>
          ) : (
            <div className="relative w-12 h-12">
              {logoUrl && !logoError ? (
                <div className={cn(
                  'w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center',
                  isDark ? 'border border-white/15 bg-white/10' : 'border border-line bg-panel',
                )}>
                  <Image src={logoUrl} alt="Logo" width={48} height={48}
                    className="object-contain w-full h-full p-1"
                    unoptimized
                    onError={() => { setLogoError(true); }} />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-[0_4px_14px_rgba(99,102,241,0.35)]">
                  <span className="text-[19px] font-black text-white tracking-tight">
                    {companyName ? companyName.charAt(0).toUpperCase() : 'D'}
                  </span>
                </div>
              )}
              <span className={cn(
                'absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2',
                isDark ? 'border-[#0d1117]' : 'border-white',
              )} />
            </div>
          )}
        </div>

        {/* ── NAV ────────────────────────────────────────────────── */}
        <nav className="relative flex-1 overflow-y-auto overflow-x-hidden py-3" style={{ scrollbarWidth: 'none' }}>
          {visibleSections.map((section, sIdx) => (
            <div key={section.label} className={cn(sIdx > 0 && 'mt-1')}>
              {sIdx > 0 && (
                <div className="sidebar-divider mx-4 my-2 border-t" />
              )}

              {open && (
                <div className="px-5 py-1">
                  <span className="sidebar-section-label text-[9.5px] font-bold tracking-[0.16em] uppercase">
                    {section.label}
                  </span>
                </div>
              )}

              <div className={cn('space-y-0.5', open ? 'px-3' : 'px-3')}>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const iconBg = isDark ? item.iconBgDark : item.iconBgLight;
                  const iconColor = isDark ? item.iconColorDark : item.iconColorLight;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onCloseMobile}
                      title={!open ? item.label : undefined}
                      className={cn(
                        'group relative flex items-center rounded-xl transition-all duration-150',
                        'focus:outline-none',
                        open ? 'gap-3 px-2 py-2' : 'justify-center px-0 py-2.5',
                        isActive ? 'sidebar-item-active' : 'sidebar-item',
                      )}
                    >
                      {/* Active left indicator */}
                      {isActive && open && (
                        <span className="sidebar-active-bar absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full" />
                      )}

                      {/* Colored icon */}
                      <div className={cn(
                        'flex-none flex items-center justify-center rounded-lg transition-transform duration-150 group-hover:scale-[1.06]',
                        open ? 'w-8 h-8' : 'w-9 h-9',
                        iconBg,
                      )}>
                        <Icon className={cn(
                          open ? 'w-[15px] h-[15px]' : 'w-[17px] h-[17px]',
                          isActive ? (isDark ? 'text-white' : 'text-indigo-600') : iconColor,
                        )} />
                      </div>

                      {open && (
                        <span className="flex-1 truncate text-[12.5px] font-semibold tracking-[-0.01em]">
                          {item.label}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* ── FOOTER ─────────────────────────────────────────────── */}
        <div className={cn(
          'sidebar-header-border relative flex-none border-t pt-3 pb-4 space-y-2.5',
          open ? 'px-4' : 'px-3',
        )}>
          {/* Theme switcher */}
          {open ? (
            <div className={cn(
              'sidebar-footer-surface flex items-center gap-1 p-0.5 rounded-xl border',
            )}>
              {(['light', 'dark'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => applyTheme(t)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 h-7 rounded-[9px]',
                    'text-[11px] font-semibold capitalize transition-all duration-150 focus:outline-none',
                    theme === t
                      ? isDark
                        ? 'bg-white/15 text-white shadow-sm'
                        : 'bg-white text-text shadow-sm border border-line'
                      : isDark ? 'text-white/35 hover:text-white/65' : 'text-muted hover:text-text',
                  )}
                >
                  {t === 'light' ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
                  {t}
                </button>
              ))}
            </div>
          ) : (
            <button
              onClick={() => applyTheme(theme === 'dark' ? 'light' : 'dark')}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              className={cn(
                'sidebar-footer-surface w-full h-9 flex items-center justify-center rounded-xl border transition-all duration-150 focus:outline-none',
                isDark ? 'text-white/40 hover:text-white/80' : 'text-muted hover:text-text',
              )}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          )}

          {/* Profile card */}
          <div className={cn(
            'sidebar-footer-surface flex items-center rounded-xl border transition-all duration-150 cursor-pointer',
            isDark ? 'hover:bg-white/10' : 'hover:bg-panel2',
            open ? 'gap-2.5 px-3 py-2.5' : 'justify-center p-2',
          )}>
            <div className={cn(
              'flex-none flex items-center justify-center rounded-full select-none font-bold',
              'bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-white',
              'shadow-[0_2px_10px_rgba(99,102,241,0.35)]',
              open ? 'w-[34px] h-[34px] text-[11.5px]' : 'w-9 h-9 text-[12px]',
            )}>
              {initials}
            </div>
            {open && (
              <>
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    'text-[12.5px] font-semibold truncate leading-tight',
                    isDark ? 'text-white' : 'text-text',
                  )}>
                    {userName || 'Sameer Shaikh'}
                  </p>
                  <p className={cn(
                    'text-[10px] truncate mt-0.5',
                    isDark ? 'text-white/40' : 'text-muted',
                  )}>
                    {email}
                  </p>
                </div>
                <button
                  type="button"
                  className={cn(
                    'flex-none w-6 h-6 flex items-center justify-center rounded-lg transition-all duration-150 focus:outline-none',
                    isDark ? 'text-white/30 hover:text-white/70 hover:bg-white/10' : 'text-muted/50 hover:text-text hover:bg-panel2',
                  )}
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
