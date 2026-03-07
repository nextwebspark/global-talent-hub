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

  const execs = executives.slice(0, MAX_SATELLITES);
  const overflow = executives.length - MAX_SATELLITES;

  const cancelDismiss = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const startDismiss = useCallback(() => {
    cancelDismiss();
    dismissTimerRef.current = setTimeout(() => {
      onDismiss();
    }, 300);
  }, [onDismiss, cancelDismiss]);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    startDismiss();
    return () => cancelDismiss();
  }, []);

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

  if (execs.length === 0) return null;

  const orbitRadius = companyRadius + 60;
  const totalItems = execs.length + (overflow > 0 ? 1 : 0);
  const angleStep = (2 * Math.PI) / Math.max(totalItems, 1);
  const startAngle = -Math.PI / 2;
  const hitAreaSize = (orbitRadius + 60) * 2;

  return (
    <div
      ref={containerRef}
      className="fixed z-[450]"
      style={{ transform: 'translate(-50%, -50%)' }}
    >
      <div
        className="absolute rounded-full"
        style={{
          width: hitAreaSize,
          height: hitAreaSize,
          left: `calc(50% - ${hitAreaSize / 2}px)`,
          top: `calc(50% - ${hitAreaSize / 2}px)`,
        }}
        onMouseEnter={cancelDismiss}
        onMouseLeave={startDismiss}
      />

      {execs.map((exec, i) => {
        const angle = startAngle + i * angleStep;
        const x = Math.cos(angle) * orbitRadius;
        const y = Math.sin(angle) * orbitRadius;

        return (
          <div key={exec.id}>
            <svg
              className="absolute left-1/2 top-1/2 pointer-events-none"
              style={{
                width: 1,
                height: 1,
                overflow: 'visible',
                opacity: visible ? 0.25 : 0,
                transition: 'opacity 0.3s ease',
              }}
            >
              <line
                x1={0}
                y1={0}
                x2={x}
                y2={y}
                stroke="currentColor"
                strokeWidth={1}
                strokeDasharray="3 2"
                className="text-muted-foreground"
              />
            </svg>

            <div
              className="absolute cursor-pointer"
              style={{
                left: `calc(50% + ${x}px)`,
                top: `calc(50% + ${y}px)`,
                transform: `translate(-50%, -50%) scale(${visible ? 1 : 0.3})`,
                opacity: visible ? 1 : 0,
                transition: `all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 50}ms`,
                zIndex: 451,
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectExecutive(exec.id, companyId);
              }}
              onMouseEnter={cancelDismiss}
              onMouseLeave={startDismiss}
              data-testid={`satellite-exec-${exec.id}`}
            >
              <div className="flex items-center gap-1.5 bg-popover/95 backdrop-blur-sm border border-border rounded-full pl-1.5 pr-2.5 py-1 shadow-lg hover:shadow-xl hover:border-primary/50 hover:bg-popover transition-all whitespace-nowrap max-w-[180px]">
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
          </div>
        );
      })}

      {overflow > 0 && (() => {
        const angle = startAngle + execs.length * angleStep;
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
            onMouseEnter={cancelDismiss}
            onMouseLeave={startDismiss}
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
