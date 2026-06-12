import { useEffect, useState } from 'react';

/** Drag-to-resize state for the map view right panel (desktop only). */
export function useRightPanelResize(initialWidth = 384) {
  const [rightPanelWidth, setRightPanelWidth] = useState(initialWidth);
  const [isResizingRight, setIsResizingRight] = useState(false);

  useEffect(() => {
    if (!isResizingRight) return;

    const onMove = (e: MouseEvent) => {
      const w = Math.max(320, Math.min(700, window.innerWidth - e.clientX));
      setRightPanelWidth(w);
    };
    const onUp = () => {
      setIsResizingRight(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [isResizingRight]);

  return { rightPanelWidth, isResizingRight, setIsResizingRight };
}
