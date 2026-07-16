"use client";

import { Check, ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export type MultiSelectOption = {
  value: string;
  label: string;
};

type MultiWbsSelectProps = {
  selectedValues: string[];
  onChange: (values: string[]) => void;
  options: MultiSelectOption[];
  placeholder?: string;
  className?: string;
};

export function MultiWbsSelect({
  selectedValues,
  onChange,
  options,
  placeholder = 'All Elements',
  className,
}: MultiWbsSelectProps) {
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

  const filteredOptions = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(term) ||
        option.value.toLowerCase().includes(term)
    );
  }, [options, query]);

  const toggleOption = (val: string) => {
    if (selectedValues.includes(val)) {
      onChange(selectedValues.filter((v) => v !== val));
    } else {
      onChange([...selectedValues, val]);
    }
  };

  const handleSelectAll = () => {
    onChange(options.map((opt) => opt.value));
  };

  const handleClearAll = () => {
    onChange([]);
  };

  const selectedDisplayLabel = useMemo(() => {
    if (selectedValues.length === 0) return placeholder;
    if (selectedValues.length === options.length) {
      if (placeholder.toLowerCase().includes('po')) return 'All POs';
      if (placeholder.toLowerCase().includes('category')) return 'All Categories';
      return 'All WBS Elements';
    }
    if (selectedValues.length === 1) {
      const found = options.find((o) => o.value === selectedValues[0]);
      return found ? found.label : selectedValues[0];
    }
    if (placeholder.toLowerCase().includes('po')) return `${selectedValues.length} POs Selected`;
    if (placeholder.toLowerCase().includes('category')) return `${selectedValues.length} Categories Selected`;
    return `${selectedValues.length} WBS Selected`;
  }, [selectedValues, options, placeholder]);

  return (
    <div ref={rootRef} className={cn('relative w-full', className)}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-2.5 rounded-lg border border-line bg-panel px-3 py-2.5 text-left text-xs text-text outline-none transition focus:border-accent focus:ring-1 focus:ring-accent shadow-sm"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={cn('truncate font-semibold', selectedValues.length === 0 && 'text-muted/65')}>
          {selectedDisplayLabel}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {selectedValues.length > 0 && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                handleClearAll();
              }}
              className="rounded-full p-0.5 hover:bg-panel2 transition text-muted hover:text-text"
              title="Clear selection"
            >
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronDown className={cn('h-3.5 w-3.5 text-muted/80 transition-transform', open && 'rotate-180')} />
        </div>
      </button>
 
      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-xl border border-line bg-panel shadow-md max-h-72 flex flex-col">
          <div className="border-b border-line/75 p-2 shrink-0">
            <div className="flex items-center gap-2 rounded-lg border border-line bg-panel2/60 px-3 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted/70" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={
                  placeholder.toLowerCase().includes('po')
                    ? "Type to search PO..."
                    : placeholder.toLowerCase().includes('category')
                    ? "Type to search Category..."
                    : "Type to search WBS..."
                }
                className="w-full bg-transparent text-xs text-text outline-none placeholder:text-muted/60"
              />
            </div>
            <div className="mt-2 flex justify-between gap-2 px-1">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-[10px] font-bold text-accent hover:underline uppercase"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                className="text-[10px] font-bold text-muted hover:text-text hover:underline uppercase"
              >
                Clear All
              </button>
            </div>
          </div>

          <ul
            className="flex-1 min-h-0 overflow-y-auto divide-y divide-line/35 py-1"
            role="listbox"
            aria-multiselectable="true"
          >
            {filteredOptions.map((option) => {
              const selected = selectedValues.includes(option.value);
              return (
                <li
                  key={option.value}
                  role="option"
                  aria-selected={selected}
                  onClick={() => toggleOption(option.value)}
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 text-xs text-text transition hover:bg-panel2/50',
                    selected && 'bg-accent/5 font-semibold text-accent'
                  )}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => {}} // handled by li click
                      className="rounded border-line bg-panel2 text-accent focus:ring-accent shrink-0 h-3.5 w-3.5"
                    />
                    <span className="truncate" title={option.value === option.label ? option.value : `${option.value} - ${option.label}`}>
                      <span className="font-mono text-accent/85 mr-1.5">{option.value}</span>
                      {option.value !== option.label && <span className="text-muted">{option.label}</span>}
                    </span>
                  </div>
                  {selected ? <Check className="h-3.5 w-3.5 shrink-0 text-accent" /> : null}
                </li>
              );
            })}
            {!filteredOptions.length ? (
              <li className="px-3.5 py-6 text-center text-xs text-muted/65">
                {placeholder.toLowerCase().includes('po')
                  ? "No POs found"
                  : placeholder.toLowerCase().includes('category')
                  ? "No categories found"
                  : "No WBS elements found"}
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
