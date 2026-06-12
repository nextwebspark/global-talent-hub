import { useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';

/**
 * Debounced persistence of dashboard UI state (satellite layout, map positions, table config)
 * back to the active search project on the server.
 */
export function useDashboardProjectPersist() {
  const hierarchySaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevHierarchiesRef = useRef<Record<string, Record<string, string>>>({});
  useEffect(() => {
    prevHierarchiesRef.current = useAppStore.getState().satelliteHierarchies;
    const unsub = useAppStore.subscribe((state) => {
      const hierarchies = state.satelliteHierarchies;
      if (hierarchies === prevHierarchiesRef.current) return;
      prevHierarchiesRef.current = hierarchies;
      const projectId = state.currentProject?.id;
      if (!projectId) return;
      if (hierarchySaveTimerRef.current) clearTimeout(hierarchySaveTimerRef.current);
      hierarchySaveTimerRef.current = setTimeout(() => {
        fetch(`/api/search/${projectId}/satellite-hierarchies`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hierarchies }),
        }).catch(() => {});
      }, 1000);
    });
    return () => {
      unsub();
      if (hierarchySaveTimerRef.current) clearTimeout(hierarchySaveTimerRef.current);
    };
  }, []);

  const ordersSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevOrdersRef = useRef<Record<string, string[]>>({});
  useEffect(() => {
    prevOrdersRef.current = useAppStore.getState().satelliteOrders;
    const unsub = useAppStore.subscribe((state) => {
      const orders = state.satelliteOrders;
      if (orders === prevOrdersRef.current) return;
      prevOrdersRef.current = orders;
      const projectId = state.currentProject?.id;
      if (!projectId) return;
      if (ordersSaveTimerRef.current) clearTimeout(ordersSaveTimerRef.current);
      ordersSaveTimerRef.current = setTimeout(() => {
        fetch(`/api/search/${projectId}/satellite-orders`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orders }),
        }).catch(() => {});
      }, 1000);
    });
    return () => {
      unsub();
      if (ordersSaveTimerRef.current) clearTimeout(ordersSaveTimerRef.current);
    };
  }, []);

  const mapPositionsSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevMapPositionsRef = useRef<Record<string, unknown>>({});
  const prevMapPositionsProjectRef = useRef<string | undefined>(useAppStore.getState().currentProject?.id);
  useEffect(() => {
    prevMapPositionsRef.current = useAppStore.getState().mapPositions;
    prevMapPositionsProjectRef.current = useAppStore.getState().currentProject?.id;
    const unsub = useAppStore.subscribe((state) => {
      const projectId = state.currentProject?.id;
      if (projectId !== prevMapPositionsProjectRef.current) {
        if (mapPositionsSaveTimerRef.current) clearTimeout(mapPositionsSaveTimerRef.current);
        prevMapPositionsProjectRef.current = projectId;
        prevMapPositionsRef.current = state.mapPositions;
        return;
      }
      const positions = state.mapPositions;
      if (positions === prevMapPositionsRef.current) return;
      prevMapPositionsRef.current = positions;
      if (!projectId) return;
      if (mapPositionsSaveTimerRef.current) clearTimeout(mapPositionsSaveTimerRef.current);
      mapPositionsSaveTimerRef.current = setTimeout(() => {
        fetch(`/api/search/${projectId}/map-positions`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ positions }),
        }).catch(() => {});
      }, 1000);
    });
    return () => {
      unsub();
      if (mapPositionsSaveTimerRef.current) clearTimeout(mapPositionsSaveTimerRef.current);
    };
  }, []);

  const tableConfigSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevTableConfigRef = useRef<Record<string, unknown> | null>(useAppStore.getState().tableConfig);
  const prevTableConfigProjectRef = useRef<string | undefined>(useAppStore.getState().currentProject?.id);
  useEffect(() => {
    prevTableConfigRef.current = useAppStore.getState().tableConfig;
    prevTableConfigProjectRef.current = useAppStore.getState().currentProject?.id;
    const unsub = useAppStore.subscribe((state) => {
      const config = state.tableConfig;
      const currentPid = state.currentProject?.id;
      if (currentPid !== prevTableConfigProjectRef.current) {
        prevTableConfigProjectRef.current = currentPid;
        prevTableConfigRef.current = config;
        if (tableConfigSaveTimerRef.current) {
          clearTimeout(tableConfigSaveTimerRef.current);
          tableConfigSaveTimerRef.current = null;
        }
        return;
      }
      if (config === prevTableConfigRef.current) return;
      prevTableConfigRef.current = config;
      if (!currentPid || !config) return;
      if (tableConfigSaveTimerRef.current) clearTimeout(tableConfigSaveTimerRef.current);
      tableConfigSaveTimerRef.current = setTimeout(() => {
        fetch(`/api/search/${currentPid}/table-config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config }),
        }).catch(() => {});
      }, 1000);
    });
    return () => {
      unsub();
      if (tableConfigSaveTimerRef.current) clearTimeout(tableConfigSaveTimerRef.current);
    };
  }, []);
}
