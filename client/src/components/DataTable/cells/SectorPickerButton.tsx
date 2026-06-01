import { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { FixedDropdown } from './FixedDropdown';
import { ALL_SUB_SECTORS, SECTOR_TAXONOMY, SECTOR_TO_CATEGORY } from '../utils/constants';

export function SectorPickerButton({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const btnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!search) return null;
    const lower = search.toLowerCase();
    return ALL_SUB_SECTORS.filter(s => s.toLowerCase().includes(lower));
  }, [search]);

  useEffect(() => {
    if (open) { setSearch(''); setTimeout(() => inputRef.current?.focus(), 10); }
  }, [open]);

  return (
    <div className={className}>
      <button
        ref={btnRef}
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 text-sm border border-input rounded-md bg-background hover:bg-muted/40 transition-colors"
        onClick={() => setOpen(v => !v)}
        data-testid="sector-picker-button"
      >
        <span className={value ? '' : 'text-muted-foreground'}>{value || 'Select sector...'}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
      </button>
      {open && (
        <FixedDropdown anchorRef={btnRef} onClose={() => setOpen(false)} minWidth={240}>
          <input
            ref={inputRef}
            style={{ backgroundColor: 'hsl(var(--background))' }}
            className="w-full border-b border-border rounded-t px-2 py-1.5 text-xs outline-none"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search sector..."
          />
          <div className="max-h-[280px] overflow-y-auto">
            {filtered ? (
              filtered.map(opt => (
                <div
                  key={opt}
                  className={`px-3 py-1.5 text-xs cursor-pointer hover:bg-accent whitespace-nowrap ${opt === value ? 'font-medium bg-accent/50' : ''}`}
                  onMouseDown={e => { e.preventDefault(); onChange(opt); setOpen(false); }}
                >
                  <span className="text-muted-foreground mr-1">{SECTOR_TO_CATEGORY[opt]} ›</span>{opt}
                </div>
              ))
            ) : (
              Object.entries(SECTOR_TAXONOMY).map(([cat, subs]) => (
                <div key={cat}>
                  <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground select-none">
                    {cat}
                  </div>
                  {subs.map(opt => (
                    <div
                      key={opt}
                      className={`pl-5 pr-3 py-1.5 text-xs cursor-pointer hover:bg-accent whitespace-nowrap ${opt === value ? 'font-medium bg-accent/50' : ''}`}
                      onMouseDown={e => { e.preventDefault(); onChange(opt); setOpen(false); }}
                    >
                      {opt}
                    </div>
                  ))}
                </div>
              ))
            )}
            {filtered && filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">No matches</div>
            )}
          </div>
        </FixedDropdown>
      )}
    </div>
  );
}
