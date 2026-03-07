import { useEffect, useRef, useCallback, useState } from 'react';
import { useMap } from 'react-leaflet';
import type { Executive } from '@/lib/store';

interface ExecutiveSatellitesProps {
  companyId: string;
  companyLat: number;
  companyLng: number;
  companyRadius: number;
  executives: Executive[];
  onSelectExecutive: (execId: string, companyId: string) => void;
  onDismiss: () => void;
}

const MAX_SATELLITES = 8;

export default function ExecutiveSatellites({
  companyId,
  companyLat,
  companyLng,
  companyRadius,
  executives,
  onSelectExecutive,
  onDismiss,
}: ExecutiveSatellitesProps) {
  const map = useMap();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visible, setVisible] = useState(false);
  const [dragOffsets, setDragOffsets] = useState<Record<string, { dx: number; dy: number }>>({});
  const draggingRef = useRef<{ id: string; startX: number; startY: number; origDx: number; origDy: number } | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const interactingRef = useRef(false);

  const execs = executives.slice(0, MAX_SATELLITES);
  const overflow = executives.length - MAX_SATELLITES;

  const cancelDismiss = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const startDismiss = useCallback(() => {
    if (draggingRef.current || interactingRef.current) return;
    cancelDismiss();
    dismissTimerRef.current = setTimeout(() => {
      onDismiss();
    }, 400);
  }, [onDismiss, cancelDismiss]);

  const handleContainerEnter = useCallback(() => {
    interactingRef.current = true;
    cancelDismiss();
  }, [cancelDismiss]);

  const handleContainerLeave = useCallback(() => {
    interactingRef.current = false;
    startDismiss();
  }, [startDismiss]);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    return () => {
      cancelDismiss();
      if (dragCleanupRef.current) dragCleanupRef.current();
    };
  }, [cancelDismiss]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updatePosition = () => {
      const point = map.latLngToContainerPoint([companyLat, companyLng]);
      const mapContainer = map.getContainer();
      const rect = mapContainer.getBoundingClientRect();
      container.style.left = `${rect.left + point.x}px`;
      container.style.top = `${rect.top + point.y}px`;
    };

    updatePosition();
    map.on('move', updatePosition);
    map.on('zoom', updatePosition);
    map.on('resize', updatePosition);

    return () => {
      map.off('move', updatePosition);
      map.off('zoom', updatePosition);
      map.off('resize', updatePosition);
    };
  }, [map, companyLat, companyLng]);

  const handleDragStart = useCallback((execId: string, clientX: number, clientY: number) => {
    cancelDismiss();
    const current = dragOffsets[execId] || { dx: 0, dy: 0 };
    draggingRef.current = { id: execId, startX: clientX, startY: clientY, origDx: current.dx, origDy: current.dy };

    const maxDragDistance = 150;

    const handleDragMove = (e: MouseEvent) => {
      if (!draggingRef.current || draggingRef.current.id !== execId) return;
      let dx = draggingRef.current.origDx + (e.clientX - draggingRef.current.startX);
      let dy = draggingRef.current.origDy + (e.clientY - draggingRef.current.startY);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > maxDragDistance) {
        dx = (dx / dist) * maxDragDistance;
        dy = (dy / dist) * maxDragDistance;
      }
      setDragOffsets(prev => ({ ...prev, [execId]: { dx, dy } }));
    };

    const handleDragEnd = () => {
      draggingRef.current = null;
      dragCleanupRef.current = null;
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
      if (!interactingRef.current) {
        startDismiss();
      }
    };

    const cleanup = () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
      draggingRef.current = null;
    };
    dragCleanupRef.current = cleanup;

    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
  }, [dragOffsets, cancelDismiss, startDismiss]);

  if (execs.length === 0) return null;

  const orbitRadius = companyRadius + 65;
  const totalItems = execs.length + (overflow > 0 ? 1 : 0);
  const arcStart = Math.PI / 6;
  const arcEnd = (5 * Math.PI) / 6;
  const arcSpan = arcEnd - arcStart;
  const angleStep = totalItems > 1 ? arcSpan / (totalItems - 1) : 0;
  const hitAreaSize = (orbitRadius + 80) * 2;

  return (
    <div
      ref={containerRef}
      className="fixed z-[450]"
      style={{ transform: 'translate(-50%, -50%)' }}
    >
      <div
        className="absolute"
        style={{
          width: hitAreaSize,
          height: hitAreaSize * 0.7,
          left: `calc(50% - ${hitAreaSize / 2}px)`,
          top: -10,
        }}
        onMouseEnter={handleContainerEnter}
        onMouseLeave={handleContainerLeave}
      />

      <svg
        className="absolute left-1/2 top-1/2 pointer-events-none"
        style={{
          width: 1,
          height: 1,
          overflow: 'visible',
          opacity: visible ? 0.4 : 0,
          transition: 'opacity 0.3s ease',
        }}
      >
        {execs.map((exec, i) => {
          const baseAngle = totalItems > 1 ? arcStart + i * angleStep : Math.PI / 2;
          const baseX = Math.cos(baseAngle) * orbitRadius;
          const baseY = Math.sin(baseAngle) * orbitRadius;
          const offset = dragOffsets[exec.id];
          const finalX = baseX + (offset?.dx || 0);
          const finalY = baseY + (offset?.dy || 0);

          return (
            <line
              key={exec.id}
              x1={0}
              y1={0}
              x2={finalX}
              y2={finalY}
              stroke="currentColor"
              strokeWidth={1.5}
              className="text-muted-foreground/60"
            />
          );
        })}
      </svg>

      {execs.map((exec, i) => {
        const baseAngle = totalItems > 1 ? arcStart + i * angleStep : Math.PI / 2;
        const baseX = Math.cos(baseAngle) * orbitRadius;
        const baseY = Math.sin(baseAngle) * orbitRadius;
        const offset = dragOffsets[exec.id];
        const finalX = baseX + (offset?.dx || 0);
        const finalY = baseY + (offset?.dy || 0);
        const isDragging = draggingRef.current?.id === exec.id;

        return (
          <div
            key={exec.id}
            className="absolute select-none"
            style={{
              left: `calc(50% + ${finalX}px)`,
              top: `calc(50% + ${finalY}px)`,
              transform: `translate(-50%, -50%) scale(${visible ? 1 : 0.3})`,
              opacity: visible ? 1 : 0,
              transition: isDragging ? 'none' : `all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 50}ms`,
              zIndex: isDragging ? 452 : 451,
              cursor: isDragging ? 'grabbing' : 'grab',
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleDragStart(exec.id, e.clientX, e.clientY);
            }}
            onClick={(e) => {
              e.stopPropagation();
              const off = dragOffsets[exec.id];
              if (off && (Math.abs(off.dx) > 3 || Math.abs(off.dy) > 3)) return;
              onSelectExecutive(exec.id, companyId);
            }}
            onMouseEnter={handleContainerEnter}
            onMouseLeave={handleContainerLeave}
            data-testid={`satellite-exec-${exec.id}`}
          >
            <div className="flex items-center gap-1.5 bg-popover/95 backdrop-blur-sm border border-border rounded-full pl-1.5 pr-2.5 py-1 shadow-lg hover:shadow-xl hover:border-primary/50 hover:bg-popover transition-shadow whitespace-nowrap max-w-[180px]">
              <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
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
        const angle = totalItems > 1 ? arcStart + execs.length * angleStep : Math.PI / 2;
        const x = Math.cos(angle) * orbitRadius;
        const y = Math.sin(angle) * orbitRadius;
        return (
          <div
            className="absolute"
            style={{
              left: `calc(50% + ${x}px)`,
              top: `calc(50% + ${y}px)`,
              transform: `translate(-50%, -50%) scale(${visible ? 1 : 0.3})`,
              opacity: visible ? 1 : 0,
              transition: `all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) ${execs.length * 50}ms`,
              zIndex: 451,
            }}
            onMouseEnter={handleContainerEnter}
            onMouseLeave={handleContainerLeave}
          >
            <div className="flex items-center bg-muted/90 backdrop-blur-sm border border-border rounded-full px-2.5 py-1 shadow-md">
              <span className="text-[10px] font-medium text-muted-foreground">+{overflow} more</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
