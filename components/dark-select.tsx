"use client";

import { Check, ChevronDown, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export type DarkSelectOption = {
  value: string;
  label: string;
};

type DarkSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: DarkSelectOption[];
  placeholder?: string;
  name?: string;
  className?: string;
  searchable?: boolean;
  // When true, dropdown option labels wrap instead of truncating — use for long labels
  // (e.g. "code - description") so the full text stays visible while searching.
  noTruncate?: boolean;
};

export function DarkSelect({
  value,
  onChange,
  options,
  placeholder = 'Select an option',
  name,
  className,
  searchable = true,
  noTruncate = false,
}: DarkSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      window.setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open]);

  const selectedLabel = useMemo(() => options.find((option) => option.value === value)?.label ?? '', [options, value]);
  const filteredOptions = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!searchable || !term) return options;
    return options.filter((option) => option.label.toLowerCase().includes(term) || option.value.toLowerCase().includes(term));
  }, [options, query, searchable]);

  return (
    <div ref={rootRef} className={cn('relative w-full', className)}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-2.5 rounded-lg border border-line bg-panel px-3 py-2.5 text-left text-xs text-text outline-none transition focus:border-accent focus:ring-1 focus:ring-accent shadow-sm"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={cn('truncate font-semibold', !selectedLabel && 'text-muted/65')}>{selectedLabel || placeholder}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted/80 transition-transform', open && 'rotate-180')} />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-xl border border-line bg-panel shadow-md">
          {searchable ? (
            <div className="border-b border-line/75 p-2">
              <div className="flex items-center gap-2 rounded-lg border border-line bg-panel2/60 px-3 py-2">
                <Search className="h-3.5 w-3.5 shrink-0 text-muted/70" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Type to search..."
                  className="w-full bg-transparent text-xs text-text outline-none placeholder:text-muted/60"
                />
              </div>
            </div>
          ) : null}
          <div className="max-h-60 overflow-auto p-1 space-y-0.5">
            {!filteredOptions.length ? <div className="px-3 py-2.5 text-xs text-muted/70">No matches found</div> : null}
            {filteredOptions.map((option) => (
              <button
                key={option.value || '__empty__'}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full justify-between gap-3 rounded-md px-3 py-2 text-left text-xs font-semibold transition',
                  noTruncate ? 'items-start' : 'items-center',
                  option.value === value ? 'bg-accent/8 text-accent' : 'text-muted hover:bg-panel2/70 hover:text-text',
                )}
              >
                <span className={cn(noTruncate ? 'whitespace-normal break-words' : 'truncate')}>{option.label}</span>
                {option.value === value ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" /> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
