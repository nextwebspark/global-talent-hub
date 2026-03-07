import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Executive } from '@/lib/store';
import { useAppStore } from '@/lib/store';

interface ExecutiveSatellitesProps {
  companyId: string;
  companyLat: number;
  companyLng: number;
  companyRadius: number;
  executives: Executive[];
  persistent?: boolean;
  onSelectExecutive: (execId: string | null, companyId: string) => void;
  onDismiss: () => void;
}

const MAX_SATELLITES = 8;
const SNAP_DISTANCE = 50;
const DRAG_THRESHOLD = 4;
const CHILD_VERTICAL_OFFSET = 38;
const CHILD_HORIZONTAL_STAGGER = 75;

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
  companyId,
  companyLat,
  companyLng,
  companyRadius,
  executives,
  persistent = false,
  onSelectExecutive,
  onDismiss,
}: ExecutiveSatellitesProps) {
  const map = useMap();
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visible, setVisible] = useState(false);
  const [dragOffsets, setDragOffsets] = useState<Record<string, { dx: number; dy: number }>>({});
  const [snapTargetId, setSnapTargetId] = useState<string | null>(null);
  const [selectedExecId, setSelectedExecId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const snapTargetRef = useRef<string | null>(null);
  const draggingRef = useRef<{ id: string; startX: number; startY: number; origDx: number; origDy: number } | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const hoverCountRef = useRef(0);
  const didDragRef = useRef(false);
  const thresholdPassedRef = useRef(false);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const anchorMarkerRef = useRef<L.Marker | null>(null);

  const storeHierarchy = useAppStore((s) => s.satelliteHierarchies[companyId] || {});
  const setSatelliteHierarchy = useAppStore((s) => s.setSatelliteHierarchy);

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

  const execIdSet = useMemo(() => new Set(execs.map(e => e.id)), [execs]);

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
    if (changed) {
      setSatelliteHierarchy(companyId, pruned);
    }
    hoverCountRef.current = 0;
    setSelectedExecId(null);
    setDragOffsets({});
  }, [companyId, execIdSet, setSatelliteHierarchy]);

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
    if (persistent || draggingRef.current || hoverCountRef.current > 0) return;
    cancelDismiss();
    dismissTimerRef.current = setTimeout(() => {
      setSelectedExecId(null);
      onDismiss();
    }, 800);
  }, [onDismiss, cancelDismiss, persistent]);

  const startDismissRef = useRef(startDismiss);
  startDismissRef.current = startDismiss;

  const handlePillEnter = useCallback(() => {
    hoverCountRef.current++;
    cancelDismiss();
  }, [cancelDismiss]);

  const handlePillLeave = useCallback(() => {
    hoverCountRef.current = Math.max(0, hoverCountRef.current - 1);
    if (hoverCountRef.current === 0 && !persistent) {
      startDismissRef.current();
    }
  }, [persistent]);

  useEffect(() => {
    const icon = L.divIcon({
      className: 'satellite-anchor',
      html: '<div></div>',
      iconSize: [1, 1],
      iconAnchor: [0, 0],
    });

    const marker = L.marker([companyLat, companyLng], {
      icon,
      interactive: false,
      zIndexOffset: -1000,
    });

    anchorMarkerRef.current = marker;

    const onAdd = () => {
      const el = marker.getElement();
      if (el) {
        el.style.pointerEvents = 'none';
        el.style.overflow = 'visible';
        setAnchorEl(el);
      }
    };

    marker.on('add', onAdd);
    marker.addTo(map);

    return () => {
      marker.off('add', onAdd);
      marker.remove();
      anchorMarkerRef.current = null;
      setAnchorEl(null);
    };
  }, [map]);

  useEffect(() => {
    if (anchorMarkerRef.current) {
      anchorMarkerRef.current.setLatLng([companyLat, companyLng]);
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

  const orbitRadius = companyRadius + 65;
  const arcStart = Math.PI / 6;
  const arcEnd = (5 * Math.PI) / 6;
  const arcSpan = arcEnd - arcStart;

  const basePositions = useMemo(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    const rootExecs = execs.filter(e => !hierarchy[e.id] || !execIdSet.has(hierarchy[e.id]));
    const totalRoots = rootExecs.length + (overflow > 0 ? 1 : 0);
    const rootAngleStep = totalRoots > 1 ? arcSpan / (totalRoots - 1) : 0;

    const computeForExec = (exec: typeof execs[0], bx: number, by: number) => {
      positions[exec.id] = { x: bx, y: by };
      const children = execs.filter(e => hierarchy[e.id] === exec.id && execIdSet.has(e.id));
      if (children.length > 0) {
        const startX = bx - ((children.length - 1) * CHILD_HORIZONTAL_STAGGER) / 2;
        children.forEach((child, ci) => {
          computeForExec(child, startX + ci * CHILD_HORIZONTAL_STAGGER, by + CHILD_VERTICAL_OFFSET);
        });
      }
    };

    rootExecs.forEach((exec, i) => {
      const angle = totalRoots > 1 ? arcStart + i * rootAngleStep : Math.PI / 2;
      computeForExec(exec, Math.cos(angle) * orbitRadius, Math.sin(angle) * orbitRadius);
    });

    return positions;
  }, [execs, execIdSet, hierarchy, orbitRadius, arcStart, arcSpan, overflow]);

  const basePositionsRef = useRef(basePositions);
  basePositionsRef.current = basePositions;

  const displayPositions = useMemo(() => {
    const result: Record<string, { x: number; y: number }> = {};
    for (const exec of execs) {
      const base = basePositions[exec.id];
      if (!base) continue;
      const offset = dragOffsets[exec.id];
      result[exec.id] = {
        x: base.x + (offset?.dx || 0),
        y: base.y + (offset?.dy || 0),
      };
    }
    return result;
  }, [execs, basePositions, dragOffsets]);

  const displayPositionsRef = useRef(displayPositions);
  displayPositionsRef.current = displayPositions;

  const handleDragStart = useCallback((execId: string, clientX: number, clientY: number) => {
    cancelDismiss();
    didDragRef.current = false;
    thresholdPassedRef.current = false;
    const currentOffset = dragOffsetsRef.current[execId] || { dx: 0, dy: 0 };
    draggingRef.current = { id: execId, startX: clientX, startY: clientY, origDx: currentOffset.dx, origDy: currentOffset.dy };

    const handleDragMove = (e: MouseEvent) => {
      if (!draggingRef.current || draggingRef.current.id !== execId) return;

      const totalDx = e.clientX - draggingRef.current.startX;
      const totalDy = e.clientY - draggingRef.current.startY;

      if (!thresholdPassedRef.current) {
        if (Math.sqrt(totalDx * totalDx + totalDy * totalDy) < DRAG_THRESHOLD) return;
        thresholdPassedRef.current = true;
        map.dragging.disable();
        setDraggingId(execId);
      }

      didDragRef.current = true;
      const dx = draggingRef.current.origDx + totalDx;
      const dy = draggingRef.current.origDy + totalDy;
      setDragOffsets(prev => ({ ...prev, [execId]: { dx, dy } }));

      const base = basePositionsRef.current[execId];
      if (!base) return;
      const draggedX = base.x + dx;
      const draggedY = base.y + dy;

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
      draggingRef.current = null;
      dragCleanupRef.current = null;
      if (wasDragged) map.dragging.enable();
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);

      snapTargetRef.current = null;
      setSnapTargetId(null);
      setDraggingId(null);

      if (wasDragged && currentSnap) {
        setHierarchy(prev => ({ ...prev, [execId]: currentSnap }));
        setDragOffsets(prev => {
          const next = { ...prev };
          delete next[execId];
          return next;
        });
      } else if (wasDragged && didDragRef.current) {
        setHierarchy(prev => {
          if (!prev[execId]) return prev;
          const next = { ...prev };
          delete next[execId];
          return next;
        });
        setDragOffsets(prev => {
          const next = { ...prev };
          delete next[execId];
          return next;
        });
      }

      if (!persistent && hoverCountRef.current === 0) {
        startDismissRef.current();
      }
    };

    dragCleanupRef.current = () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
      draggingRef.current = null;
      snapTargetRef.current = null;
      setSnapTargetId(null);
      setDraggingId(null);
      map.dragging.enable();
    };

    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
  }, [cancelDismiss, setHierarchy, map, persistent]);

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
                x1={parentPos.x}
                y1={parentPos.y}
                x2={pos.x}
                y2={pos.y}
                stroke="hsl(35 92% 50%)"
                strokeWidth={2}
                strokeOpacity={0.6}
              />
            );
          }

          return (
            <line
              key={`c-${exec.id}`}
              x1={0}
              y1={0}
              x2={pos.x}
              y2={pos.y}
              stroke="currentColor"
              strokeWidth={1.5}
              strokeOpacity={0.25}
              className="text-muted-foreground"
            />
          );
        })}

        {draggingId && snapTargetRef.current && (() => {
          const dragPos = displayPositions[draggingId];
          const targetPos = displayPositions[snapTargetRef.current];
          if (!dragPos || !targetPos) return null;
          return (
            <line
              x1={targetPos.x}
              y1={targetPos.y}
              x2={dragPos.x}
              y2={dragPos.y}
              stroke="hsl(35 92% 50%)"
              strokeWidth={2}
              strokeDasharray="4 3"
              strokeOpacity={0.8}
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

        return (
          <div
            key={exec.id}
            style={{
              position: 'absolute',
              left: pos.x,
              top: pos.y,
              transform: `translate(-50%, -50%) scale(${visible ? 1 : 0.3})`,
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
              handleDragStart(exec.id, e.clientX, e.clientY);
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (didDragRef.current) {
                didDragRef.current = false;
                return;
              }
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
              className="flex items-center gap-1.5 backdrop-blur-sm border rounded-full pl-1.5 pr-2.5 py-1 whitespace-nowrap max-w-[180px]"
              style={{
                backgroundColor: isSnapTarget ? 'hsl(35 92% 50% / 0.15)' : 'hsl(var(--popover) / 0.95)',
                borderColor: isSelected
                  ? 'hsl(var(--primary))'
                  : isSnapTarget
                  ? 'hsl(35 92% 50%)'
                  : isConnected
                  ? 'hsl(35 92% 50% / 0.4)'
                  : 'hsl(var(--border))',
                boxShadow: isSelected
                  ? '0 0 0 2px hsl(var(--primary) / 0.3), 0 4px 12px rgba(0,0,0,0.15)'
                  : isSnapTarget
                  ? '0 0 0 3px hsl(35 92% 50% / 0.3), 0 4px 16px hsl(35 92% 50% / 0.25)'
                  : isDragging
                  ? '0 8px 24px rgba(0,0,0,0.2), 0 0 0 1px hsl(var(--border))'
                  : '0 2px 8px rgba(0,0,0,0.1)',
                transition: 'background-color 0.2s, border-color 0.2s, box-shadow 0.2s',
              }}
            >
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: isSelected
                    ? 'hsl(var(--primary) / 0.2)'
                    : isSnapTarget
                    ? 'hsl(35 92% 50% / 0.3)'
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
        const rootCount = execs.filter(e => !hierarchy[e.id]).length;
        const totalRoots = rootCount + 1;
        const rootAngleStep = totalRoots > 1 ? arcSpan / (totalRoots - 1) : 0;
        const angle = totalRoots > 1 ? arcStart + rootCount * rootAngleStep : Math.PI / 2;
        const x = Math.cos(angle) * orbitRadius;
        const y = Math.sin(angle) * orbitRadius;
        return (
          <div
            style={{
              position: 'absolute',
              left: x,
              top: y,
              transform: `translate(-50%, -50%) scale(${visible ? 1 : 0.3})`,
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
