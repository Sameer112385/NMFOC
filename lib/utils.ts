import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatCurrency(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  if (amount < 0) {
    const formatted = new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 2,
    }).format(Math.abs(amount));
    return `(SAR ${formatted})`;
  }
  return `SAR ${new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

export function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

export function formatCompactNumber(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';

  if (abs >= 1_000_000_000_000) return `${sign}${(abs / 1_000_000_000_000).toFixed(2)}T`;
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(2)}K`;
  return `${sign}${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(abs)}`;
}

export function formatCompactCurrency(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  if (amount < 0) {
    return `(SAR ${formatCompactNumber(Math.abs(amount))})`;
  }
  return `SAR ${formatCompactNumber(amount)}`;
}

export function formatPercent(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  return `${amount.toFixed(2)}%`;
}

export function safeNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}
