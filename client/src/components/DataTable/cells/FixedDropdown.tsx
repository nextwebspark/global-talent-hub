import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { findScrollableParent } from '../utils/dom';

export function FixedDropdown({ anchorRef, onClose, children, minWidth }: {
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  children: React.ReactNode;
  minWidth?: number;
}) {
  const dropRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  useEffect(() => {
    if (!anchorRef.current) return;
    const dropMaxH = 280;
    const gap = 4;
    const mw = minWidth ?? 140;

    const positionDropdown = () => {
      if (!anchorRef.current) return;
      const rect = anchorRef.current.getBoundingClientRect();
      let left = rect.left;
      if (left + mw > window.innerWidth - 8) left = window.innerWidth - mw - 8;
      if (left < 8) left = 8;
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const maxHeight = Math.min(dropMaxH, Math.max(spaceBelow, 80));
      setCoords({ top: rect.bottom + gap, left, maxHeight });
    };

    // Scroll to make room if near bottom
    const rect = anchorRef.current.getBoundingClientRect();
    const needed = dropMaxH + gap + 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < needed) {
      const scrollable = findScrollableParent(anchorRef.current);
      if (scrollable) {
        scrollable.scrollTop += needed - spaceBelow;
        requestAnimationFrame(positionDropdown);
        return;
      }
    }
    positionDropdown();
  }, [anchorRef, minWidth]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, anchorRef]);

  if (!coords) return null;

  return createPortal(
    <div
      ref={dropRef}
      style={{
        position: 'fixed',
        top: coords.top,
        left: coords.left,
        zIndex: 9999,
        backgroundColor: 'hsl(var(--popover))',
        color: 'hsl(var(--popover-foreground))',
        border: '1px solid hsl(var(--border))',
        borderRadius: '0.375rem',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        minWidth: minWidth ? `${minWidth}px` : '140px',
        maxHeight: `${coords.maxHeight}px`,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
      onClick={e => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
}
