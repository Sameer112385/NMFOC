import { cn, formatCurrency, formatNumber, formatPercent } from '@/lib/utils';
import type { ReactNode } from 'react';

export function PageShell({ title, subtitle, kicker, actions, children }: {
  title: string;
  subtitle?: string;
  kicker?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-line/50 pb-5 md:flex-row md:items-center md:justify-between no-print">
        <div>
          {kicker ? <div className="section-kicker text-accent font-bold tracking-[0.12em]">{kicker}</div> : null}
          <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-text md:text-3xl">{title}</h1>
          {subtitle ? <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-muted/90 font-medium">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2.5 shrink-0 self-start md:self-center">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function Card({ title, value, hint, tone = 'default' }: {
  title: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'accent' | 'warning' | 'danger' | 'success';
}) {
  const valueLength = value.replace(/\s+/g, '').length;
  const toneClass = {
    default: 'border-line/60 bg-panel',
    accent: 'border-accent/20 bg-gradient-to-br from-accent/5 via-panel to-panel shadow-sm',
    warning: 'border-warning/20 bg-gradient-to-br from-warning/5 via-panel to-panel shadow-sm',
    danger: 'border-danger/20 bg-gradient-to-br from-danger/5 via-panel to-panel shadow-sm',
    success: 'border-success/20 bg-gradient-to-br from-success/5 via-panel to-panel shadow-sm',
  }[tone];

  const valueClass =
    valueLength > 18
      ? 'text-[15px]'
      : valueLength > 14
        ? 'text-[17px]'
        : valueLength > 10
          ? 'text-[19px]'
          : 'text-[22px]';

  return (
    <div className={cn('relative min-w-0 overflow-hidden rounded-xl border p-5 shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md', toneClass)}>
      {tone !== 'default' && (
        <div className={cn('absolute inset-x-0 top-0 h-1 bg-gradient-to-r', {
          'from-accent/40 via-accent to-accent/40': tone === 'accent',
          'from-warning/40 via-warning to-warning/40': tone === 'warning',
          'from-danger/40 via-danger to-danger/40': tone === 'danger',
          'from-success/40 via-success to-success/40': tone === 'success',
        })} />
      )}
      <div className="section-kicker text-muted/70 font-semibold tracking-wider">{title}</div>
      <div className={cn('data-value mt-3.5 whitespace-nowrap text-right font-extrabold leading-none tracking-tight text-text', valueClass)}>
        {value}
      </div>
      {hint ? <div className="mt-3 text-[11px] font-medium leading-relaxed text-muted/80">{hint}</div> : null}
    </div>
  );
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'success' | 'warning' | 'danger' | 'accent' }) {
  const styles = {
    default: 'bg-panel2 text-text border-line/75',
    success: 'bg-success/8 text-success border-success/20',
    warning: 'bg-warning/8 text-warning border-warning/20',
    danger: 'bg-danger/8 text-danger border-danger/20',
    accent: 'bg-accent/8 text-accent border-accent/20',
  }[tone];

  return <span className={cn('inline-flex items-center rounded-md border px-2.5 py-1 text-[10px] font-bold tracking-wide uppercase', styles)}>{children}</span>;
}

export function StatRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/30 py-3 text-xs last:border-b-0">
      <span className="font-semibold text-muted">{label}</span>
      <span className={cn('data-value text-right text-[13px] font-bold text-text', valueClass)}>{value}</span>
    </div>
  );
}

export function MetricGrid({ items }: { items: { label: string; value: number; kind?: 'currency' | 'number' | 'percent' }[] }) {
  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
      {items.map((item) => (
        <div key={item.label} className="surface-card min-w-0 p-5 hover:border-accent/25 hover:shadow-md">
          <div className="section-kicker text-muted/70 font-semibold tracking-wider">{item.label}</div>
          <div className="data-value mt-3.5 whitespace-nowrap text-right text-[20px] font-extrabold leading-none text-text">
            {item.kind === 'currency'
              ? formatCurrency(item.value)
              : item.kind === 'percent'
                ? formatPercent(item.value)
                : formatNumber(item.value)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="surface-card px-8 py-14 text-center border-dashed border-2 bg-panel/30">
      <div className="text-base font-bold text-text">{title}</div>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted/85 font-medium">{description}</p>
    </div>
  );
}

export const surfaceCard = 'surface-card rounded-xl';

