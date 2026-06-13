import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import mapboxgl from 'mapbox-gl';
import type { Executive } from '@/lib/store';
import { useAppStore } from '@/lib/store';

interface ExecutiveSatellitesProps {
  map: mapboxgl.Map;
  companyId: string;
  companyLat: number;
  companyLng: number;
  companyRadius: number;
  companyStatus?: string;
  executives: Executive[];
  persistent?: boolean;
  onSelectExecutive: (execId: string | null, companyId: string) => void;
  onDismiss: () => void;
  onPillEnter?: () => void;
  onPillLeave?: () => void;
}

const EMPTY_HIERARCHY: Record<string, string> = {};
const MAX_SATELLITES = 8;

export const satelliteAnchors = new Map<string, mapboxgl.Marker>();
const SNAP_DISTANCE = 22;
const DRAG_THRESHOLD = 4;
const ROW_HEIGHT = 38;
const PILL_X = 20;
const CHILD_INDENT = 60;
const START_Y_GAP = 25;
const BRANCH_GAP = 10;

function getDescendants(id: string, hier: Record<string, string>): Set<string> {
  const result = new Set<string>();
  const stack = Object.entries(hier).filter(([, p]) => p === id).map(([c]) => c);
  while (stack.length) {
    const child = stack.pop()!;
    result.add(child);
    Object.entries(hier).filter(([, p]) => p === child).forEach(([c]) => stack.push(c));
  }
  return result;
}

export default function ExecutiveSatellites({
  map,
  companyId,
  companyLat,
  companyLng,
  companyRadius,
  companyStatus,
  executives,
  persistent = false,
  onSelectExecutive,
  onDismiss,
  onPillEnter: onPillEnterProp,
  onPillLeave: onPillLeaveProp,
}: ExecutiveSatellitesProps) {
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visible, setVisible] = useState(false);
  const [dragOffsets, setDragOffsets] = useState<Record<string, { dx: number; dy: number }>>({});
  const [snapTargetId, setSnapTargetId] = useState<string | null>(null);
  const [selectedExecId, setSelectedExecId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [unlockReadyId, setUnlockReadyId] = useState<string | null>(null);
  const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapTargetRef = useRef<string | null>(null);
  const draggingRef = useRef<{ id: string; startX: number; startY: number; origDx: number; origDy: number } | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const hoverCountRef = useRef(0);
  const isZoomingRef = useRef(false);
  const didDragRef = useRef(false);
  const thresholdPassedRef = useRef(false);
  const unlockReadyRef = useRef(false);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const anchorMarkerRef = useRef<mapboxgl.Marker | null>(null);

  const storeHierarchy = useAppStore((s) => s.satelliteHierarchies[companyId] ?? EMPTY_HIERARCHY);
  const setSatelliteHierarchy = useAppStore((s) => s.setSatelliteHierarchy);
  const savedOrder = useAppStore((s) => s.satelliteOrders[companyId]);
  const setSatelliteOrder = useAppStore((s) => s.setSatelliteOrder);
  const updateMapPosition = useAppStore((s) => s.updateMapPosition);

  const hierarchy = storeHierarchy;
  const setHierarchy = useCallback((updater: (prev: Record<string, string>) => Record<string, string>) => {
    const current = useAppStore.getState().satelliteHierarchies[companyId] || {};
    const next = updater(current);
    setSatelliteHierarchy(companyId, next);
  }, [companyId, setSatelliteHierarchy]);

  const hierarchyRef = useRef(hierarchy);
  hierarchyRef.current = hierarchy;

  const execs = executives.slice(0, MAX_SATELLITES);
  const execsRef = useRef(execs);
  execsRef.current = execs;

  const execIdKey = execs.map(e => e.id).join(',');
  const execIdSet = useMemo(() => new Set(execs.map(e => e.id)), [execIdKey]);

  useEffect(() => {
    const current = useAppStore.getState().satelliteHierarchies[companyId] || {};
    const pruned: Record<string, string> = {};
    let changed = false;
    for (const [childId, parentId] of Object.entries(current)) {
      if (execIdSet.has(childId) && execIdSet.has(parentId)) {
        pruned[childId] = parentId;
      } else {
        changed = true;
      }
    }
    if (changed) setSatelliteHierarchy(companyId, pruned);
    hoverCountRef.current = 0;
    setSelectedExecId(null);
    setDragOffsets({});
  }, [companyId, execIdKey, setSatelliteHierarchy]);

  const dragOffsetsRef = useRef(dragOffsets);
  dragOffsetsRef.current = dragOffsets;

  const overflow = executives.length - MAX_SATELLITES;

  const cancelDismiss = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const startDismiss = useCallback(() => {
    if (persistent || draggingRef.current || hoverCountRef.current > 0 || isZoomingRef.current) return;
    cancelDismiss();
    dismissTimerRef.current = setTimeout(() => {
      setSelectedExecId(null);
      onDismiss();
    }, 800);
  }, [onDismiss, cancelDismiss, persistent]);

  const startDismissRef = useRef(startDismiss);
  startDismissRef.current = startDismiss;

  const onPillEnterRef = useRef(onPillEnterProp);
  onPillEnterRef.current = onPillEnterProp;
  const onPillLeaveRef = useRef(onPillLeaveProp);
  onPillLeaveRef.current = onPillLeaveProp;

  const handlePillEnter = useCallback(() => {
    hoverCountRef.current++;
    cancelDismiss();
    onPillEnterRef.current?.();
  }, [cancelDismiss]);

  const handlePillLeave = useCallback(() => {
    hoverCountRef.current = Math.max(0, hoverCountRef.current - 1);
    if (hoverCountRef.current === 0 && !persistent) {
      startDismissRef.current();
      onPillLeaveRef.current?.();
    }
  }, [persistent]);

  useEffect(() => {
    const anchorDiv = document.createElement('div');
    anchorDiv.style.cssText = 'width:1px;height:1px;pointer-events:none;overflow:visible;';

    const marker = new mapboxgl.Marker({ element: anchorDiv, anchor: 'center' })
      .setLngLat([companyLng, companyLat])
      .addTo(map);

    anchorMarkerRef.current = marker;
    setAnchorEl(anchorDiv);
    satelliteAnchors.set(companyId, marker);

    return () => {
      satelliteAnchors.delete(companyId);
      marker.remove();
      anchorMarkerRef.current = null;
      setAnchorEl(null);
    };
  }, [map, companyId]);

  useEffect(() => {
    if (anchorMarkerRef.current) {
      anchorMarkerRef.current.setLngLat([companyLng, companyLat]);
    }
  }, [companyLat, companyLng]);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    return () => {
      cancelDismiss();
      if (dragCleanupRef.current) {
        dragCleanupRef.current();
        dragCleanupRef.current = null;
      }
    };
  }, [cancelDismiss]);

  useEffect(() => {
    const onZoomStart = () => {
      isZoomingRef.current = true;
      cancelDismiss();
    };
    const onZoomEnd = () => {
      isZoomingRef.current = false;
      hoverCountRef.current = 0;
    };
    map.on('zoomstart', onZoomStart);
    map.on('zoomend', onZoomEnd);
    return () => {
      map.off('zoomstart', onZoomStart);
      map.off('zoomend', onZoomEnd);
    };
  }, [map, cancelDismiss]);

  const orderedRootIds = useMemo(() => {
    const rootExecs = execs.filter(e => !hierarchy[e.id] || !execIdSet.has(hierarchy[e.id]));
    const rootIds = rootExecs.map(e => e.id);
    if (!savedOrder) return rootIds;
    const ordered: string[] = [];
    for (const id of savedOrder) {
      if (rootIds.includes(id)) ordered.push(id);
    }
    for (const id of rootIds) {
      if (!ordered.includes(id)) ordered.push(id);
    }
    return ordered;
  }, [execs, hierarchy, execIdSet, savedOrder]);

  const basePositions = useMemo(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    const startY = companyRadius + START_Y_GAP;
    let row = 0;

    const computeForExec = (execId: string, indent: number) => {
      positions[execId] = { x: PILL_X + indent, y: startY + row * ROW_HEIGHT };
      row++;
      const children = execs.filter(e => hierarchy[e.id] === execId && execIdSet.has(e.id));
      children.forEach(child => computeForExec(child.id, indent + CHILD_INDENT));
    };

    orderedRootIds.forEach(id => computeForExec(id, 0));
    return positions;
  }, [execs, execIdSet, hierarchy, companyRadius, orderedRootIds]);

  const orderedRootIdsRef = useRef(orderedRootIds);
  orderedRootIdsRef.current = orderedRootIds;

  const basePositionsRef = useRef(basePositions);
  basePositionsRef.current = basePositions;

  const displayPositions = useMemo(() => {
    const result: Record<string, { x: number; y: number }> = {};
    for (const exec of execs) {
      const base = basePositions[exec.id];
      if (!base) continue;
      const offset = dragOffsets[exec.id];
      if (offset) {
        result[exec.id] = { x: base.x + offset.dx, y: base.y + offset.dy };
      } else {
        result[exec.id] = { x: base.x, y: base.y };
      }
    }
    return result;
  }, [execs, basePositions, dragOffsets]);

  const displayPositionsRef = useRef(displayPositions);
  displayPositionsRef.current = displayPositions;

  const handleDragStart = useCallback((execId: string, clientX: number, clientY: number) => {
    cancelDismiss();
    didDragRef.current = false;
    thresholdPassedRef.current = false;
    unlockReadyRef.current = false;
    const currentDisplay = displayPositionsRef.current[execId];
    const base = basePositionsRef.current[execId];
    const origDx = currentDisplay && base ? currentDisplay.x - base.x : 0;
    const origDy = currentDisplay && base ? currentDisplay.y - base.y : 0;
    const isSubordinate = !!hierarchyRef.current[execId];
    const isRoot = !isSubordinate;
    draggingRef.current = { id: execId, startX: clientX, startY: clientY, origDx, origDy };

    const handleDragMove = (e: MouseEvent) => {
      if (!draggingRef.current || draggingRef.current.id !== execId) return;
      const totalDx = e.clientX - draggingRef.current.startX;
      const totalDy = e.clientY - draggingRef.current.startY;
      if (!thresholdPassedRef.current) {
        if (Math.sqrt(totalDx * totalDx + totalDy * totalDy) < DRAG_THRESHOLD) return;
        thresholdPassedRef.current = true;
        map.dragPan.disable();
        map.dragRotate.disable();
        setDraggingId(execId);
      }
      didDragRef.current = true;
      const dx = draggingRef.current.origDx + totalDx;
      const dy = draggingRef.current.origDy + totalDy;
      setDragOffsets(prev => ({ ...prev, [execId]: { dx, dy } }));

      if (isRoot) {
        const currentBase = basePositionsRef.current[execId];
        if (currentBase && Math.abs(dx) < 48) {
          const draggedY = currentBase.y + dy;
          const currentOrder = orderedRootIdsRef.current;
          const myIdx = currentOrder.indexOf(execId);
          if (myIdx >= 0) {
            let swapIdx = -1;
            if (myIdx > 0) {
              const aboveBase = basePositionsRef.current[currentOrder[myIdx - 1]];
              if (aboveBase && draggedY < aboveBase.y) swapIdx = myIdx - 1;
            }
            if (swapIdx < 0 && myIdx < currentOrder.length - 1) {
              const belowBase = basePositionsRef.current[currentOrder[myIdx + 1]];
              if (belowBase && draggedY > belowBase.y) swapIdx = myIdx + 1;
            }
            if (swapIdx >= 0) {
              const newOrder = [...currentOrder];
              newOrder[myIdx] = currentOrder[swapIdx];
              newOrder[swapIdx] = currentOrder[myIdx];
              orderedRootIdsRef.current = newOrder;
              setSatelliteOrder(companyId, newOrder);
              draggingRef.current!.origDy += (swapIdx - myIdx) * ROW_HEIGHT;
            }
          }
        }
      }

      if (isSubordinate && !unlockReadyRef.current) return;

      const currentBase = basePositionsRef.current[execId];
      if (!currentBase) return;
      const draggedX = currentBase.x + dx;
      const draggedY = currentBase.y + dy;
      const currentHierarchy = hierarchyRef.current;
      const descendants = getDescendants(execId, currentHierarchy);
      const currentExecs = execsRef.current;
      const currentDisplayPositions = displayPositionsRef.current;

      let closest: { id: string; dist: number } | null = null;
      for (const exec of currentExecs) {
        if (exec.id === execId) continue;
        if (descendants.has(exec.id)) continue;
        const displayPos = currentDisplayPositions[exec.id];
        if (!displayPos) continue;
        const dist = Math.sqrt((draggedX - displayPos.x) ** 2 + (draggedY - displayPos.y) ** 2);
        if (dist < SNAP_DISTANCE && (!closest || dist < closest.dist)) {
          closest = { id: exec.id, dist };
        }
      }
      const newSnap = closest?.id || null;
      snapTargetRef.current = newSnap;
      setSnapTargetId(newSnap);
    };

    const handleDragEnd = () => {
      const currentSnap = snapTargetRef.current;
      const wasDragged = thresholdPassedRef.current;
      const wasUnlockReady = unlockReadyRef.current;
      draggingRef.current = null;
      dragCleanupRef.current = null;
      unlockReadyRef.current = false;
      if (unlockTimerRef.current) {
        clearTimeout(unlockTimerRef.current);
        unlockTimerRef.current = null;
      }
      setUnlockingId(null);
      setUnlockReadyId(null);
      if (wasDragged) {
        map.dragPan.enable();
        map.dragRotate.enable();
      }
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);

      snapTargetRef.current = null;
      setSnapTargetId(null);
      setDraggingId(null);
      setDragOffsets(prev => { const next = { ...prev }; delete next[execId]; return next; });

      if (isSubordinate && !wasUnlockReady) {
        if (!persistent && hoverCountRef.current === 0) startDismissRef.current();
        return;
      } else if (wasDragged && currentSnap) {
        setHierarchy(prev => ({ ...prev, [execId]: currentSnap }));
        updateMapPosition(`exec:${execId}`, null);
      } else if (wasDragged && wasUnlockReady) {
        setHierarchy(prev => {
          if (!prev[execId]) return prev;
          const next = { ...prev }; delete next[execId]; return next;
        });
      }

      if (!persistent && hoverCountRef.current === 0) startDismissRef.current();
    };

    dragCleanupRef.current = () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
      draggingRef.current = null;
      snapTargetRef.current = null;
      unlockReadyRef.current = false;
      if (unlockTimerRef.current) { clearTimeout(unlockTimerRef.current); unlockTimerRef.current = null; }
      setUnlockingId(null);
      setUnlockReadyId(null);
      setSnapTargetId(null);
      setDraggingId(null);
      map.dragPan.enable();
      map.dragRotate.enable();
    };

    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
  }, [cancelDismiss, setHierarchy, map, persistent, updateMapPosition, companyId, setSatelliteOrder]);

  if (execs.length === 0 || !anchorEl) return null;

  const content = (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        pointerEvents: 'none',
      }}
    >
      <svg
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 1,
          height: 1,
          overflow: 'visible',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.3s ease',
          pointerEvents: 'none',
        }}
      >
        {(() => {
          const PILL_R = 15;
          const allY = execs.map(e => displayPositions[e.id]?.y).filter((y): y is number => y != null);
          if (allY.length === 0) return null;
          const maxY = Math.max(...allY);
          const spineTop = companyRadius;
          const spineBottom = maxY;
          return (
            <>
              <line
                x1={0} y1={spineTop}
                x2={0} y2={spineBottom}
                stroke="currentColor" strokeWidth={1.5} strokeOpacity={0.18}
                className="text-muted-foreground"
              />
              {execs.map((exec) => {
                const pos = displayPositions[exec.id];
                if (!pos) return null;
                const parentId = hierarchy[exec.id];
                if (parentId) {
                  const parentPos = displayPositions[parentId];
                  if (!parentPos) return null;
                  return (
                    <line
                      key={`h-${exec.id}`}
                      x1={parentPos.x + PILL_R + 4} y1={parentPos.y}
                      x2={pos.x - BRANCH_GAP} y2={pos.y}
                      stroke="hsl(35 92% 50%)" strokeWidth={1.5} strokeOpacity={0.5}
                      strokeDasharray="3 2"
                    />
                  );
                }
                return (
                  <line
                    key={`b-${exec.id}`}
                    x1={0} y1={pos.y}
                    x2={pos.x - BRANCH_GAP} y2={pos.y}
                    stroke="currentColor" strokeWidth={1} strokeOpacity={0.2}
                    strokeDasharray="4 3"
                    className="text-muted-foreground"
                  />
                );
              })}
            </>
          );
        })()}

        {draggingId && snapTargetRef.current && (() => {
          const dragPos = displayPositions[draggingId];
          const targetPos = displayPositions[snapTargetRef.current];
          if (!dragPos || !targetPos) return null;
          return (
            <line
              x1={targetPos.x} y1={targetPos.y}
              x2={dragPos.x} y2={dragPos.y}
              stroke="hsl(35 92% 50%)" strokeWidth={2}
              strokeDasharray="4 3" strokeOpacity={0.8}
            />
          );
        })()}
      </svg>

      {execs.map((exec, i) => {
        const pos = displayPositions[exec.id];
        if (!pos) return null;
        const isDragging = draggingId === exec.id;
        const isSnapTarget = snapTargetId === exec.id;
        const isConnected = !!hierarchy[exec.id];
        const isSelected = selectedExecId === exec.id;
        const isUnlocking = unlockingId === exec.id;
        const isUnlockReady = unlockReadyId === exec.id;
        const isFormerExec = /\b(ex|former|fmr|prev|past)\b/i.test(exec.title || '');
        const isExcluded = isFormerExec ? false : (companyStatus === 'Off-Limits') || exec.availability === 'Out of Scope' || exec.availability === 'Off-Limits' || exec.availability === 'Not Interested';

        return (
          <div
            key={exec.id}
            style={{
              position: 'absolute',
              left: pos.x,
              top: pos.y,
              transform: `translate(0, -50%) scale(${visible ? 1 : 0.3})`,
              opacity: visible ? 1 : 0,
              transition: isDragging ? 'none' : `all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 40}ms`,
              zIndex: isDragging ? 453 : isSelected ? 452 : 451,
              cursor: isDragging ? 'grabbing' : 'grab',
              pointerEvents: 'auto',
              userSelect: 'none',
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              cancelDismiss();
              if (isConnected) {
                if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
                setUnlockingId(exec.id);
                setUnlockReadyId(null);
                unlockReadyRef.current = false;
                unlockTimerRef.current = setTimeout(() => {
                  unlockReadyRef.current = true;
                  setUnlockReadyId(exec.id);
                  setUnlockingId(null);
                }, 3000);
              }
              handleDragStart(exec.id, e.clientX, e.clientY);
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (unlockTimerRef.current) { clearTimeout(unlockTimerRef.current); unlockTimerRef.current = null; }
              setUnlockingId(null);
              setUnlockReadyId(null);
              if (didDragRef.current) { didDragRef.current = false; return; }
              if (isSelected) {
                setSelectedExecId(null);
                onSelectExecutive(null, companyId);
              } else {
                setSelectedExecId(exec.id);
                onSelectExecutive(exec.id, companyId);
              }
            }}
            onMouseEnter={handlePillEnter}
            onMouseLeave={handlePillLeave}
            data-testid={`satellite-exec-${exec.id}`}
          >
            <div
              className="flex items-center gap-1.5 border rounded-full pl-1.5 pr-2.5 py-1 whitespace-nowrap max-w-[180px]"
              style={{
                backgroundColor: isExcluded
                  ? 'hsl(0 0% 82%)'
                  : isUnlockReady
                  ? 'hsl(0 84% 60% / 0.12)'
                  : isSnapTarget ? 'hsl(35 92% 50% / 0.15)' : 'hsl(var(--popover))',
                borderColor: isUnlockReady
                  ? 'hsl(0 84% 60%)'
                  : isSelected ? 'hsl(var(--primary))'
                  : isSnapTarget ? 'hsl(35 92% 50%)'
                  : isConnected ? 'hsl(35 92% 50% / 0.4)'
                  : 'hsl(var(--border))',
                boxShadow: isUnlockReady
                  ? '0 0 0 3px hsl(0 84% 60% / 0.4), 0 0 16px hsl(0 84% 60% / 0.3), 0 4px 12px rgba(0,0,0,0.15)'
                  : isUnlocking
                  ? '0 0 0 2px hsl(35 92% 50% / 0.3), 0 0 12px hsl(35 92% 50% / 0.2), 0 4px 12px rgba(0,0,0,0.15)'
                  : isSelected
                  ? '0 0 0 2px hsl(var(--primary) / 0.3), 0 4px 12px rgba(0,0,0,0.15)'
                  : isSnapTarget
                  ? '0 0 0 3px hsl(35 92% 50% / 0.3), 0 4px 16px hsl(35 92% 50% / 0.25)'
                  : isDragging
                  ? '0 8px 24px rgba(0,0,0,0.2), 0 0 0 1px hsl(var(--border))'
                  : '0 2px 8px rgba(0,0,0,0.1)',
                transition: 'background-color 0.2s, border-color 0.2s, box-shadow 0.2s',
                ...(isUnlocking ? { animation: 'unlockPulse 1s ease-in-out infinite' } : {}),
              }}
            >
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: isSelected
                    ? 'hsl(var(--primary) / 0.2)'
                    : isSnapTarget ? 'hsl(35 92% 50% / 0.3)'
                    : 'hsl(var(--primary) / 0.15)',
                  transition: 'background-color 0.2s',
                }}
              >
                <span className="text-[9px] font-bold text-primary">
                  {exec.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold truncate leading-tight">{exec.name}</div>
                {exec.title && (
                  <div className="text-[9px] text-muted-foreground truncate leading-tight">{exec.title}</div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {overflow > 0 && (() => {
        const allY = execs.map(e => basePositions[e.id]?.y).filter((y): y is number => y != null);
        const maxY = allY.length > 0 ? Math.max(...allY) : companyRadius + START_Y_GAP;
        const overflowY = maxY + ROW_HEIGHT;
        return (
          <div
            style={{
              position: 'absolute',
              left: PILL_X,
              top: overflowY,
              transform: `translate(0, -50%) scale(${visible ? 1 : 0.3})`,
              opacity: visible ? 1 : 0,
              transition: `all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) ${execs.length * 50}ms`,
              zIndex: 451,
              pointerEvents: 'auto',
            }}
            onMouseEnter={handlePillEnter}
            onMouseLeave={handlePillLeave}
          >
            <div className="flex items-center bg-muted/90 backdrop-blur-sm border border-border rounded-full px-2.5 py-1 shadow-md">
              <span className="text-[10px] font-medium text-muted-foreground">+{overflow} more</span>
            </div>
          </div>
        );
      })()}
    </div>
  );

  return createPortal(content, anchorEl);
}
