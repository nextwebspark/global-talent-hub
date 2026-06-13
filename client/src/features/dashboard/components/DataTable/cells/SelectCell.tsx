import { useRef } from 'react';
import { useExclusiveOpen } from '../hooks/useExclusiveOpen';
import { FixedDropdown } from './FixedDropdown';

export function SelectCell({ value, options, onSave, placeholder }: {
  value: string;
  options: readonly string[];
  onSave: (val: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useExclusiveOpen();
  const triggerRef = useRef<HTMLSpanElement>(null);

  return (
    <>
      <span
        ref={triggerRef}
        className="truncate block cursor-pointer hover:bg-muted/40 rounded px-0.5 -mx-0.5"
        title={value || undefined}
        onMouseDown={e => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        data-testid="select-cell-display"
        data-no-drag-select
      >
        {value || '-'}
      </span>
      {open && (
        <FixedDropdown anchorRef={triggerRef} onClose={() => setOpen(false)}>
          {options.map(opt => (
            <div
              key={opt}
              className={`px-3 py-1.5 text-xs cursor-pointer hover:bg-accent whitespace-nowrap ${opt === value ? 'font-medium' : ''}`}
              style={opt === value ? { backgroundColor: 'hsl(var(--accent) / 0.5)' } : undefined}
              onMouseDown={e => { e.preventDefault(); onSave(opt); setOpen(false); }}
            >
              {opt}
            </div>
          ))}
          {value && (
            <div
              className="px-3 py-1.5 text-xs cursor-pointer hover:bg-destructive/20 text-muted-foreground italic border-t border-border whitespace-nowrap"
              onMouseDown={e => { e.preventDefault(); onSave(''); setOpen(false); }}
            >
              Clear
            </div>
          )}
        </FixedDropdown>
      )}
    </>
  );
}
