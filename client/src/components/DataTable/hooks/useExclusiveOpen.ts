import { useState, useCallback, useEffect, useId } from 'react';

let activeCellId: string | null = null;
export const CLOSE_EVENT = 'datatable:close-editors';
export function broadcastCloseEditors(exceptId: string) {
  activeCellId = exceptId;
  window.dispatchEvent(new CustomEvent(CLOSE_EVENT, { detail: exceptId }));
}
export function useExclusiveOpen() {
  const cellId = useId();
  const [open, setOpenRaw] = useState(false);
  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail !== cellId) setOpenRaw(false);
    };
    window.addEventListener(CLOSE_EVENT, handler);
    return () => window.removeEventListener(CLOSE_EVENT, handler);
  }, [cellId]);
  const setOpen = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    setOpenRaw(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      if (next) broadcastCloseEditors(cellId);
      return next;
    });
  }, [cellId]);
  return [open, setOpen] as const;
}
