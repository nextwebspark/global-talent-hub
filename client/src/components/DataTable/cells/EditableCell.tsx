import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useExclusiveOpen } from '../hooks/useExclusiveOpen';
import { findScrollableParent } from '../utils/dom';

export function EditableCell({ value, onSave, isNumeric, formatFn }: {
  value: string;
  onSave: (val: string) => void;
  isNumeric?: boolean;
  formatFn?: (val: string) => string;
}) {
  const [editing, setEditing] = useExclusiveOpen();
  const [editValue, setEditValue] = useState(value);
  const editValueRef = useRef(editValue);
  editValueRef.current = editValue;
  const valueRef = useRef(value);
  valueRef.current = value;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cellRef = useRef<HTMLSpanElement>(null);
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null);
  const usePopup = !isNumeric && !formatFn;

  useEffect(() => {
    if (!editing && editValueRef.current !== valueRef.current) {
      onSaveRef.current(editValueRef.current);
    }
  }, [editing]);

  useEffect(() => {
    if (editing) {
      if (usePopup && cellRef.current) {
        const popupW = 320;
        const popupH = 160;
        const gap = 4;

        const positionPopup = () => {
          if (!cellRef.current) return;
          const rect = cellRef.current.getBoundingClientRect();
          let left = rect.left;
          if (left + popupW > window.innerWidth - 16) left = window.innerWidth - popupW - 16;
          if (left < 8) left = 8;
          setPopupPos({ top: rect.bottom + gap, left });
          requestAnimationFrame(() => {
            if (textareaRef.current) {
              textareaRef.current.focus();
              textareaRef.current.setSelectionRange(textareaRef.current.value.length, textareaRef.current.value.length);
            }
          });
        };

        const rect = cellRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        if (spaceBelow < popupH + gap + 8) {
          const scrollable = findScrollableParent(cellRef.current);
          if (scrollable) {
            scrollable.scrollTop += popupH + gap + 8 - spaceBelow;
            requestAnimationFrame(positionPopup);
          } else {
            positionPopup();
          }
        } else {
          positionPopup();
        }
      } else {
        requestAnimationFrame(() => {
          if (inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
        });
      }
    } else {
      setPopupPos(null);
    }
  }, [editing, usePopup]);

  const commit = () => {
    setEditing(false);
    if (editValue !== value) {
      onSave(editValue);
    }
  };

  if (editing && !usePopup) {
    return (
      <input
        ref={inputRef}
        className="w-full bg-transparent border border-primary/50 rounded px-1 py-0 text-xs outline-none focus:border-primary"
        value={editValue}
        onChange={e => setEditValue(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setEditValue(value); setEditing(false); }
        }}
        onClick={e => e.stopPropagation()}
        data-testid="editable-cell-input"
      />
    );
  }

  const display = formatFn ? formatFn(value) : (value || '-');
  return (
    <>
      <span
        ref={cellRef}
        className="truncate block cursor-text hover:bg-muted/40 rounded px-0.5 -mx-0.5"
        title={value || undefined}
        onMouseDown={e => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setEditValue(value); setEditing(true); }}
        data-testid="editable-cell-display"
        data-no-drag-select
      >
        {display}
      </span>
      {editing && usePopup && popupPos && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={(e) => { e.stopPropagation(); commit(); }} />
          <div
            className="fixed z-[9999] rounded-lg border border-border shadow-xl"
            style={{ top: popupPos.top, left: popupPos.left, width: 320, backgroundColor: 'hsl(var(--popover))' }}
            onClick={e => e.stopPropagation()}
          >
            <textarea
              ref={textareaRef}
              className="w-full bg-transparent rounded-lg px-3 py-2 text-xs outline-none resize-none"
              style={{ height: 140 }}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
                if (e.key === 'Escape') { setEditValue(value); setEditing(false); }
              }}
              data-testid="editable-cell-textarea"
            />
            <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/50 text-[10px] text-muted-foreground">
              <span>Shift+Enter for new line</span>
              <div className="flex gap-1.5">
                <button className="px-2 py-0.5 rounded hover:bg-muted" onClick={() => { setEditValue(value); setEditing(false); }}>Cancel</button>
                <button className="px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90" onClick={commit}>Save</button>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
