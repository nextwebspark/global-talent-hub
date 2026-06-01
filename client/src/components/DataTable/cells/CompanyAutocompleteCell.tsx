import { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@/lib/store';
import { useExclusiveOpen } from '../hooks/useExclusiveOpen';
import { findScrollableParent } from '../utils/dom';
import type { TableRowData } from '../types';

export function CompanyAutocompleteCell({ value, companyId, execId, row, onRename, onReassign }: {
  value: string;
  companyId: string;
  execId: string;
  row: TableRowData;
  onRename: (val: string) => void;
  onReassign: (targetCompanyId: string) => void;
}) {
  const [editing, setEditing] = useExclusiveOpen();
  const [search, setSearch] = useState(value);
  const cellRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [popupPos, setPopupPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const companies = useAppStore(s => s.companies);

  const suggestions = useMemo(() => {
    if (!search || search.length < 2) return [];
    const lower = search.toLowerCase();
    return companies
      .filter(c => c.id !== companyId && c.name.toLowerCase().includes(lower))
      .slice(0, 8);
  }, [search, companies, companyId]);

  useEffect(() => {
    if (!editing || !cellRef.current) { setPopupPos(null); return; }
    const popupW = 300;
    const popupMaxH = 300;
    const gap = 4;

    const positionPopup = () => {
      if (!cellRef.current) return;
      const rect = cellRef.current.getBoundingClientRect();
      let left = rect.left;
      if (left + popupW > window.innerWidth - 16) left = window.innerWidth - popupW - 16;
      if (left < 8) left = 8;
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const maxHeight = Math.min(popupMaxH, Math.max(spaceBelow, 80));
      setPopupPos({ top: rect.bottom + gap, left, maxHeight });
      requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select(); });
    };

    // Scroll table to reveal room below the cell before positioning
    const rect = cellRef.current.getBoundingClientRect();
    const needed = popupMaxH + gap + 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < needed) {
      const scrollable = findScrollableParent(cellRef.current);
      if (scrollable) {
        scrollable.scrollTop += needed - spaceBelow;
        requestAnimationFrame(positionPopup);
        return;
      }
    }
    positionPopup();
  }, [editing]);

  const commitRename = () => {
    setEditing(false);
    if (search !== value && search.trim()) {
      onRename(search.trim());
    }
  };

  return (
    <>
      <span
        ref={cellRef}
        className="truncate block cursor-text hover:bg-muted/40 rounded px-0.5 -mx-0.5"
        title={value || undefined}
        onMouseDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); setSearch(value); setEditing(true); }}
        data-testid="company-autocomplete-display"
        data-no-drag-select
      >
        {value || '-'}
      </span>
      {editing && popupPos && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={(e) => { e.stopPropagation(); commitRename(); }} />
          <div
            className="fixed z-[9999] rounded-lg border border-border shadow-xl overflow-hidden"
            style={{ top: popupPos.top, left: popupPos.left, width: 300, maxHeight: popupPos.maxHeight, backgroundColor: 'hsl(var(--popover))', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              className="w-full bg-transparent rounded-t-lg px-3 py-2 text-xs outline-none border-b border-border/50 shrink-0"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') { setSearch(value); setEditing(false); }
              }}
              placeholder="Type company name..."
              data-testid="company-autocomplete-input"
            />
            {suggestions.length > 0 && (
              <div className="flex-1 overflow-y-auto min-h-0">
                <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
                  Assign to existing company
                </div>
                {suggestions.map(c => (
                  <div
                    key={c.id}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-accent"
                    onMouseDown={e => {
                      e.preventDefault();
                      onReassign(c.id);
                      setEditing(false);
                    }}
                  >
                    <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color || '#1e3a8a' }} />
                    <span className="truncate">{c.name}</span>
                    {c.hq_country && <span className="text-muted-foreground ml-auto shrink-0">{c.hq_country}</span>}
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/50 text-[10px] text-muted-foreground shrink-0">
              <span>Enter to rename company</span>
              <div className="flex gap-1.5">
                <button className="px-2 py-0.5 rounded hover:bg-muted" onClick={() => { setSearch(value); setEditing(false); }}>Cancel</button>
                <button className="px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90" onClick={commitRename}>Rename</button>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
