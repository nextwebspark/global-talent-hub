import { useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import type { ViewMode } from '@/components/layout/Sidebar';

/** Global keyboard shortcuts for the dashboard workspace (⌘K, 1/2/3 view switch). */
export function useDashboardKeyboard(setActiveView: (view: ViewMode) => void) {
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!useAppStore.getState().commandPaletteOpen);
      }
      if (e.key === '1' && !e.metaKey && !e.ctrlKey && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        setActiveView('map');
      }
      if (e.key === '2' && !e.metaKey && !e.ctrlKey && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        setActiveView('table');
      }
      if (e.key === '3' && !e.metaKey && !e.ctrlKey && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        setActiveView('dashboard');
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [setActiveView, setCommandPaletteOpen]);
}
