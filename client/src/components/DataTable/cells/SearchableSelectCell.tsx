import { useState, useMemo, useRef, useEffect } from 'react';
import { useExclusiveOpen } from '../hooks/useExclusiveOpen';
import { FixedDropdown } from './FixedDropdown';

export function SearchableSelectCell({ value, options, onSave, placeholder, groups }: {
  value: string;
  options: readonly string[];
  onSave: (val: string) => void;
  placeholder?: string;
  groups?: Record<string, string[]>;
}) {
  const [open, setOpen] = useExclusiveOpen();
  const [search, setSearch] = useState('');
  const triggerRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!search) return options;
    const lower = search.toLowerCase();
    return options.filter(o => o.toLowerCase().includes(lower));
  }, [options, search]);

  useEffect(() => {
    if (open) {
      setSearch('');
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    if (open && listRef.current && filtered.length > 0) {
      const firstMatch = listRef.current.querySelector('[data-highlighted="true"]');
      if (firstMatch) firstMatch.scrollIntoView({ block: 'nearest' });
    }
  }, [filtered, open]);

  return (
    <>
      <span
        ref={triggerRef}
        className="truncate block cursor-text hover:bg-muted/40 rounded px-0.5 -mx-0.5"
        title={value || undefined}
        onMouseDown={e => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        data-testid="searchable-select-display"
        data-no-drag-select
      >
        {value || '-'}
      </span>
      {open && (
        <FixedDropdown anchorRef={triggerRef} onClose={() => setOpen(false)}>
          <input
            ref={inputRef}
            style={{ backgroundColor: 'hsl(var(--background))' }}
            className="w-full border-b border-border rounded-t px-2 py-1.5 text-xs outline-none"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && filtered.length > 0) { onSave(filtered[0]); setOpen(false); }
              if (e.key === 'Escape') { setSearch(''); setOpen(false); }
            }}
            placeholder={placeholder || 'Type to search...'}
            data-testid="searchable-select-input"
          />
          {filtered.length > 0 && (
            <div ref={listRef} className="max-h-[240px] overflow-y-auto">
              {(groups && !search) ? (
                Object.entries(groups).map(([cat, subs]) => (
                  <div key={cat}>
                    <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground select-none">
                      {cat}
                    </div>
                    {subs.map(opt => (
                      <div
                        key={opt}
                        className={`pl-5 pr-3 py-1.5 text-xs cursor-pointer hover:bg-accent whitespace-nowrap ${opt === value ? 'font-medium bg-accent/50' : ''}`}
                        onMouseDown={e => { e.preventDefault(); onSave(opt); setOpen(false); }}
                      >
                        {opt}
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                filtered.map((opt, i) => (
                  <div
                    key={opt}
                    data-highlighted={i === 0 ? 'true' : 'false'}
                    className={`px-3 py-1.5 text-xs cursor-pointer hover:bg-accent whitespace-nowrap ${opt === value ? 'font-medium' : ''}`}
                    style={(opt === value || i === 0) ? { backgroundColor: `hsl(var(--accent) / ${opt === value ? '0.5' : '0.3'})` } : undefined}
                    onMouseDown={e => { e.preventDefault(); onSave(opt); setOpen(false); }}
                  >
                    {opt}
                  </div>
                ))
              )}
            </div>
          )}
        </FixedDropdown>
      )}
    </>
  );
}
