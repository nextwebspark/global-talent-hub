import { useAppStore, type Executive, transformAPICompany, transformAPIExecutive } from '@/lib/store';
import { normalizeCountryName } from '@/lib/countries';
import React, { useEffect, useMemo, useRef, useState, useCallback, useSyncExternalStore } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import ExecutiveSatellites, { satelliteAnchors } from './ExecutiveSatellites';
import MapLegend from './MapLegend';

declare global {
  interface Window {
    mapboxMap?: mapboxgl.Map | null;
  }
}

function useIsDarkMode() {
  return useSyncExternalStore(
    (cb) => {
      const obs = new MutationObserver(cb);
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      return () => obs.disconnect();
    },
    () => document.documentElement.classList.contains('dark')
  );
}

const DARK_STYLE = 'mapbox://styles/mapbox/dark-v11';
const LIGHT_STYLE = 'mapbox://styles/mapbox/light-v11';

function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    !isNaN(lat) && !isNaN(lng) &&
    isFinite(lat) && isFinite(lng) &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180 &&
    (lat !== 0 || lng !== 0)
  );
}

let isMarkerDragging = false;

const EXECUTIVE_COLORS = [
  'hsl(35 92% 50%)',
  'hsl(222 47% 11%)',
  'hsl(0 84% 60%)',
  'hsl(142 71% 45%)',
  'hsl(262 83% 58%)',
  'hsl(316 73% 52%)',
  'hsl(25 95% 53%)',
  'hsl(199 89% 48%)',
];

export default function MapComponent({
  initialCenter = [0, 20] as [number, number],
  initialZoom = 1.5,
  restoredPosition = false,
  onViewChange,
}: {
  initialCenter?: [number, number];
  initialZoom?: number;
  restoredPosition?: boolean;
  onViewChange?: (center: [number, number], zoom: number) => void;
} = {}) {
  const { companies, executives, selectedCompanyId, selectCompany, selectExecutive, updateCompany, addCompany, addExecutive, scalingMetric, revenueFilterRange, employeeFilterRange, hiddenCountries, hiddenCompanies, currentProject, showAllSatellites, mapPositions, updateMapPosition } = useAppStore();
  const isDark = useIsDarkMode();
  const [colorPickerTarget, setColorPickerTarget] = useState<{ id: string, x: number, y: number } | null>(null);
  const [addCompanyDialog, setAddCompanyDialog] = useState<{ lat: number, lng: number } | null>(null);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newMapExecName, setNewMapExecName] = useState('');
  const [newMapCountry, setNewMapCountry] = useState('');
  const [newMapExecTitle, setNewMapExecTitle] = useState('');
  const newCompanyInputRef = useRef<HTMLInputElement>(null);
  const [hoveredCompanyId, setHoveredCompanyId] = useState<string | null>(null);
  const hoveredCompanyIdRef = useRef<string | null>(null);
  hoveredCompanyIdRef.current = hoveredCompanyId;
  const [pinnedCompanyId, setPinnedCompanyId] = useState<string | null>(null);
  const pinnedCompanyIdRef = useRef<string | null>(null);
  pinnedCompanyIdRef.current = pinnedCompanyId;
  const setPinnedCompanyIdRef = useRef(setPinnedCompanyId);
  setPinnedCompanyIdRef.current = setPinnedCompanyId;
  const [labelPos, setLabelPos] = useState<{ x: number; y: number } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draggingCompanyRef = useRef<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const markerDataRef = useRef<Map<string, { name: string; revenue_usd: number; employees: number }>>(new Map());
  const scalingMetricRef = useRef(scalingMetric);
  scalingMetricRef.current = scalingMetric;
  const prevIdSignatureRef = useRef('');
  const lastFitTimeRef = useRef(0);
  const isUserInteractingRef = useRef(false);
  const interactionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const spinRafRef = useRef<number | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapboxToken, setMapboxToken] = useState<string>('');
  const styleLoadedRef = useRef(false);
  const mapZoomRef = useRef(1.5);
  const skipInitialFitRef = useRef(restoredPosition);

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(data => {
        if (data.mapboxToken) setMapboxToken(data.mapboxToken);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || !mapboxToken) return;

    mapboxgl.accessToken = mapboxToken;
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: isDark ? DARK_STYLE : LIGHT_STYLE,
      center: initialCenter,
      zoom: initialZoom,
      projection: 'globe',
      doubleClickZoom: false,
      attributionControl: false,
    });

    map.on('style.load', () => {
      styleLoadedRef.current = true;
      map.setFog({
        color: isDark ? 'rgb(12, 16, 32)' : 'rgb(222, 232, 244)',
        'high-color': isDark ? 'rgb(36, 52, 96)' : 'rgb(170, 198, 230)',
        'horizon-blend': 0.03,
        'space-color': isDark ? 'rgb(4, 6, 16)' : 'rgb(198, 212, 230)',
        'star-intensity': isDark ? 0.8 : 0.0,
      });
    });

    mapRef.current = map;
    window.mapboxMap = map;

    map.on('load', () => {
      mapZoomRef.current = map.getZoom();
      setMapReady(true);
    });

    const getZoomScale = (zoom: number) => Math.max(0.25, Math.min(1.0, (zoom - 1) / (5 - 1)));

    const handleZoom = () => {
      mapZoomRef.current = map.getZoom();
      const scale = getZoomScale(mapZoomRef.current);
      markersRef.current.forEach((marker, id) => {
        const data = markerDataRef.current.get(id);
        if (!data) return;
        const el = marker.getElement() as HTMLDivElement;
        const bubble = el.querySelector('.bubble-inner') as HTMLDivElement | null;
        if (!bubble) return;
        const value = scalingMetricRef.current === 'revenue' ? data.revenue_usd : data.employees;
        const baseRadius = getRadiusRef.current(value);
        const scaledDiam = baseRadius * scale * 2;
        bubble.style.width = `${scaledDiam}px`;
        bubble.style.height = `${scaledDiam}px`;
      });
    };

    map.on('zoom', handleZoom);

    const onViewChangeRef = { current: onViewChange };
    const handleMoveEnd = () => {
      const c = map.getCenter();
      onViewChangeRef.current?.([c.lng, c.lat], map.getZoom());
    };
    map.on('moveend', handleMoveEnd);

    const handleInteractionStart = () => {
      isUserInteractingRef.current = true;
      if (interactionTimeoutRef.current) clearTimeout(interactionTimeoutRef.current);
    };
    const handleInteractionEnd = () => {
      interactionTimeoutRef.current = setTimeout(() => {
        isUserInteractingRef.current = false;
      }, 2000);
    };

    map.on('dragstart', handleInteractionStart);
    map.on('zoomstart', handleInteractionStart);
    map.on('dragend', handleInteractionEnd);
    map.on('zoomend', handleInteractionEnd);

    map.on('dblclick', (e) => {
      e.preventDefault();
      const { lng, lat } = e.lngLat;
      handleMapDoubleClickRef.current(lat, lng);
    });

    map.on('click', () => {
      setPinnedCompanyIdRef.current(null);
      setHoveredCompanyId(null);
    });

    // Mapbox doesn't auto-resize when its container changes (right panel open/close,
    // view switch). Observe the container and resize the canvas so the globe always
    // fills the available area instead of clipping or leaving a blank strip.
    let resizeRaf = 0;
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => map.resize());
    });
    if (mapContainerRef.current) resizeObserver.observe(mapContainerRef.current);

    // Idle auto-rotate: slowly spin the globe west-to-east when the user isn't
    // interacting and nothing is hovered/dragged. Pauses the moment the user grabs it.
    const startSpin = () => {
      const tick = () => {
        if (
          !isUserInteractingRef.current &&
          !hoveredCompanyIdRef.current &&
          !isMarkerDragging &&
          map.getZoom() < 3
        ) {
          const c = map.getCenter();
          map.setCenter([c.lng + 0.06, c.lat]);
        }
        spinRafRef.current = requestAnimationFrame(tick);
      };
      spinRafRef.current = requestAnimationFrame(tick);
    };
    map.on('load', startSpin);

    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      if (hoverDismissTimerRef.current) clearTimeout(hoverDismissTimerRef.current);
      if (interactionTimeoutRef.current) clearTimeout(interactionTimeoutRef.current);
      cancelAnimationFrame(resizeRaf);
      resizeObserver.disconnect();
      if (spinRafRef.current) cancelAnimationFrame(spinRafRef.current);
      markersRef.current.forEach(m => m.remove());
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
      window.mapboxMap = null;
      setMapReady(false);
      styleLoadedRef.current = false;
    };
  }, [mapboxToken]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    map.setStyle(isDark ? DARK_STYLE : LIGHT_STYLE);
    map.once('style.load', () => {
      map.setProjection('globe');
      map.setFog({
        color: isDark ? 'rgb(12, 16, 32)' : 'rgb(222, 232, 244)',
        'high-color': isDark ? 'rgb(36, 52, 96)' : 'rgb(170, 198, 230)',
        'horizon-blend': 0.03,
        'space-color': isDark ? 'rgb(4, 6, 16)' : 'rgb(198, 212, 230)',
        'star-intensity': isDark ? 0.8 : 0.0,
      });
    });
  }, [isDark]);

  const cancelHoverDismiss = useCallback(() => {
    if (hoverDismissTimerRef.current) {
      clearTimeout(hoverDismissTimerRef.current);
      hoverDismissTimerRef.current = null;
    }
  }, []);

  const startHoverDismiss = useCallback(() => {
    cancelHoverDismiss();
    hoverDismissTimerRef.current = setTimeout(() => {
      setHoveredCompanyId(null);
    }, 800);
  }, [cancelHoverDismiss]);

  const handleMapDoubleClick = useCallback((lat: number, lng: number) => {
    setAddCompanyDialog({ lat, lng });
    setNewCompanyName('');
    setNewMapCountry('');
    setNewMapExecName('');
    setNewMapExecTitle('');
    setTimeout(() => newCompanyInputRef.current?.focus(), 100);

    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=3&addressdetails=1`, {
      headers: { 'Accept-Language': 'en' }
    })
      .then(res => res.json())
      .then(data => {
        const country = data?.address?.country;
        if (country) setNewMapCountry(country);
      })
      .catch(() => {});
  }, []);

  const handleMapDoubleClickRef = useRef(handleMapDoubleClick);
  handleMapDoubleClickRef.current = handleMapDoubleClick;

  const handleCreateCompanyOnMap = useCallback(async () => {
    if (!addCompanyDialog || !newCompanyName.trim()) return;
    try {
      const searchQueryId = currentProject?.id ? parseInt(currentProject.id) : null;
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCompanyName.trim(),
          country: newMapCountry.trim() || 'Unknown',
          sector: 'Unknown',
          latitude: String(addCompanyDialog.lat),
          longitude: String(addCompanyDialog.lng),
          ...(searchQueryId ? { searchQueryId } : {}),
        }),
      });
      if (!res.ok) throw new Error('Failed');
      const company = await res.json();
      const transformed = transformAPICompany(company);
      addCompany(transformed);

      if (newMapExecName.trim()) {
        const execRes = await fetch('/api/executives', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId: company.id,
            name: newMapExecName.trim(),
            title: newMapExecTitle.trim() || 'Unknown',
          }),
        });
        if (execRes.ok) {
          const exec = await execRes.json();
          addExecutive(transformAPIExecutive(exec, transformed.id));
        }
      }

      setAddCompanyDialog(null);
      setNewCompanyName('');
      setNewMapCountry('');
      setNewMapExecName('');
      setNewMapExecTitle('');
      toast.success(`Added "${newCompanyName.trim()}" to the map`);
    } catch {
      toast.error('Failed to add company');
    }
  }, [addCompanyDialog, newCompanyName, newMapCountry, newMapExecName, newMapExecTitle, addCompany, addExecutive, currentProject]);

  const revenueMin = revenueFilterRange[0] * 50000000;
  const revenueMax = revenueFilterRange[1] * 50000000;
  const employeeMin = employeeFilterRange[0] * 100;
  const employeeMax = employeeFilterRange[1] * 100;
  const hasRevenueFilter = revenueFilterRange[0] > 0 || revenueFilterRange[1] < 100;
  const hasEmployeeFilter = employeeFilterRange[0] > 0 || employeeFilterRange[1] < 100;

  const filteredCompanies = useMemo(() => companies.filter(c => {
    const revenue = c.revenue_usd || 0;
    const employees = c.employees || 0;
    if (hasRevenueFilter && (revenue < revenueMin || revenue > revenueMax)) return false;
    if (hasEmployeeFilter && (employees < employeeMin || employees > employeeMax)) return false;
    if (!isValidCoordinate(c.lat, c.lng)) return false;
    if (hiddenCountries.has(c.hq_country)) return false;
    if (hiddenCompanies.has(c.id)) return false;
    return true;
  }), [companies, hasRevenueFilter, revenueMin, revenueMax, hasEmployeeFilter, employeeMin, employeeMax, hiddenCountries, hiddenCompanies]);

  const getRadius = useCallback((value: number | null | undefined) => {
    const neutralRadius = 20;
    const minRadius = 12;
    const maxRadius = 55;
    if (!value || value === 0) return neutralRadius;
    if (scalingMetric === 'revenue') {
      const logVal = Math.log10(Math.max(value, 1));
      const normalized = Math.max(0, Math.min(1, (logVal - 6) / (12 - 6)));
      return minRadius + (normalized * (maxRadius - minRadius));
    }
    const radius = 0.2 * Math.sqrt(value);
    return Math.max(minRadius, Math.min(maxRadius, radius));
  }, [scalingMetric]);
  const getRadiusRef = useRef(getRadius);
  getRadiusRef.current = getRadius;

  const handleColorSelect = (color: string) => {
    if (colorPickerTarget) {
      updateCompany(colorPickerTarget.id, { color });
      setColorPickerTarget(null);
    }
  };

  const scatteredCompanies = useMemo(() => {
    const locationGroups = new Map<string, typeof filteredCompanies>();
    filteredCompanies.forEach(company => {
      const key = `${Math.round(company.lat * 10) / 10},${Math.round(company.lng * 10) / 10}`;
      if (!locationGroups.has(key)) locationGroups.set(key, []);
      locationGroups.get(key)!.push(company);
    });
    const result: Array<typeof filteredCompanies[0] & { displayLat: number; displayLng: number }> = [];
    locationGroups.forEach((group) => {
      if (group.length === 1) {
        result.push({ ...group[0], displayLat: group[0].lat, displayLng: group[0].lng });
      } else {
        const angleStep = (2 * Math.PI) / group.length;
        const scatterRadius = 0.15 + (group.length * 0.03);
        group.forEach((company, index) => {
          const angle = index * angleStep;
          result.push({
            ...company,
            displayLat: company.lat + Math.sin(angle) * scatterRadius,
            displayLng: company.lng + Math.cos(angle) * scatterRadius
          });
        });
      }
    });
    return result;
  }, [filteredCompanies]);

  const updateCompanyRef = useRef(updateCompany);
  updateCompanyRef.current = updateCompany;
  const updateMapPositionRef = useRef(updateMapPosition);
  updateMapPositionRef.current = updateMapPosition;
  const selectCompanyRef = useRef(selectCompany);
  selectCompanyRef.current = selectCompany;
  const cancelHoverDismissRef = useRef(cancelHoverDismiss);
  cancelHoverDismissRef.current = cancelHoverDismiss;
  const startHoverDismissRef = useRef(startHoverDismiss);
  startHoverDismissRef.current = startHoverDismiss;

  const labelCompanyId = pinnedCompanyId || hoveredCompanyId;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !labelCompanyId) {
      setLabelPos(null);
      return;
    }
    const company = scatteredCompanies.find(c => c.id === labelCompanyId);
    if (!company) { setLabelPos(null); return; }
    const cOffset = mapPositions[`company:${labelCompanyId}`];
    const lat = company.displayLat + (cOffset?.dLat || 0);
    const lng = company.displayLng + (cOffset?.dLng || 0);
    const updatePos = () => {
      if (!mapRef.current) return;
      const pt = mapRef.current.project([lng, lat]);
      setLabelPos({ x: pt.x, y: pt.y });
    };
    updatePos();
    map.on('move', updatePos);
    return () => { map.off('move', updatePos); };
  }, [labelCompanyId, scatteredCompanies, mapPositions, mapReady]);

  const visibleIdSignature = useMemo(
    () => scatteredCompanies.map(c => c.id).sort().join(','),
    [scatteredCompanies]
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const visibleCompanies = scatteredCompanies;
    const now = Date.now();

    if (isUserInteractingRef.current || isMarkerDragging) {
      prevIdSignatureRef.current = visibleIdSignature;
      return;
    }

    if (visibleCompanies.length > 0 && visibleIdSignature !== prevIdSignatureRef.current) {
      const timeSinceLastFit = now - lastFitTimeRef.current;
      const isInitialLoad = prevIdSignatureRef.current === '';
      if (skipInitialFitRef.current && isInitialLoad) {
        skipInitialFitRef.current = false;
      } else if (isInitialLoad || timeSinceLastFit > 500) {
        let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
        visibleCompanies.forEach(c => {
          if (c.displayLng < minLng) minLng = c.displayLng;
          if (c.displayLat < minLat) minLat = c.displayLat;
          if (c.displayLng > maxLng) maxLng = c.displayLng;
          if (c.displayLat > maxLat) maxLat = c.displayLat;
        });
        const pad = 0.1;
        const dLng = (maxLng - minLng) * pad;
        const dLat = (maxLat - minLat) * pad;
        map.fitBounds(
          [[minLng - dLng, minLat - dLat], [maxLng + dLng, maxLat + dLat]],
          { padding: 50, maxZoom: 12, animate: true, duration: 500 }
        );
        lastFitTimeRef.current = now;
      }
      prevIdSignatureRef.current = visibleIdSignature;
    }

    if (visibleCompanies.length === 0) prevIdSignatureRef.current = '';
  }, [scatteredCompanies, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const currentIds = new Set(scatteredCompanies.map(c => c.id));
    markersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
        markerDataRef.current.delete(id);
      }
    });

    scatteredCompanies.forEach((company) => {
      markerDataRef.current.set(company.id, {
        name: company.name,
        revenue_usd: company.revenue_usd,
        employees: company.employees,
      });
      const isSelected = selectedCompanyId === company.id;
      const value = scalingMetric === 'revenue' ? company.revenue_usd : company.employees;
      const baseRadius = getRadius(value);
      const zoomScale = Math.max(0.25, Math.min(1.0, (mapZoomRef.current - 1) / (5 - 1)));
      const radius = baseRadius * zoomScale;
      const diameter = radius * 2;
      const companyExecs = executives.filter((e: Executive) => e.company_id === company.id);
      const companyExcluded = company.status === 'Off-Limits';
      const allExecsExcluded = companyExcluded || (companyExecs.length > 0 && companyExecs.every((e: Executive) => e.availability === 'Off-Limits'));
      const fillColor = allExecsExcluded ? 'hsl(0 0% 60%)' : isSelected ? 'hsl(35 92% 50%)' : (company.color || 'hsl(222 47% 11%)');
      const companyOffset = mapPositions[`company:${company.id}`];
      const markerLat = company.displayLat + (companyOffset?.dLat || 0);
      const markerLng = company.displayLng + (companyOffset?.dLng || 0);

      let marker = markersRef.current.get(company.id);
      let el: HTMLDivElement;

      if (marker) {
        el = marker.getElement() as HTMLDivElement;
        marker.setLngLat([markerLng, markerLat]);
      } else {
        el = document.createElement('div');
        el.className = 'mapbox-company-marker';
        el.style.cursor = 'grab';
        marker = new mapboxgl.Marker({ element: el, draggable: true, anchor: 'center' })
          .setLngLat([markerLng, markerLat])
          .addTo(map);
        markersRef.current.set(company.id, marker);

        marker.on('dragstart', () => {
          isMarkerDragging = true;
          draggingCompanyRef.current = company.id;
          if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
          }
        });

        marker.on('drag', () => {
          const lngLat = marker!.getLngLat();
          const anchor = satelliteAnchors.get(company.id);
          if (anchor) anchor.setLngLat([lngLat.lng, lngLat.lat]);
        });

        marker.on('dragend', () => {
          draggingCompanyRef.current = null;
          isMarkerDragging = false;
          const lngLat = marker!.getLngLat();
          const newLat = lngLat.lat;
          const newLng = lngLat.lng;
          updateCompanyRef.current(company.id, { lat: newLat, lng: newLng });
          updateMapPositionRef.current(`company:${company.id}`, { dLat: 0, dLng: 0 });
          fetch(`https://nominatim.openstreetmap.org/reverse?lat=${newLat}&lon=${newLng}&format=json&zoom=3&addressdetails=1`, {
            headers: { 'Accept-Language': 'en' }
          })
            .then(res => res.json())
            .then(data => {
              const rawCountry = data?.address?.country;
              if (rawCountry) {
                const newCountry = normalizeCountryName(rawCountry) || rawCountry;
                updateCompanyRef.current(company.id, { lat: newLat, lng: newLng, hq_country: newCountry });
              }
            })
            .catch(() => {});
        });

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!isMarkerDragging) {
            selectCompanyRef.current(company.id);
            setPinnedCompanyIdRef.current(company.id);
            setHoveredCompanyId(company.id);
            cancelHoverDismissRef.current();
          }
        });

        el.addEventListener('mouseenter', () => {
          if (isMarkerDragging) return;
          cancelHoverDismissRef.current();
          if (hoveredCompanyIdRef.current === company.id) return;
          if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = setTimeout(() => setHoveredCompanyId(company.id), 300);
        });

        el.addEventListener('mouseleave', () => {
          if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
          }
          if (hoveredCompanyIdRef.current === company.id) startHoverDismissRef.current();
        });

        el.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          e.preventDefault();
          const container = mapContainerRef.current;
          if (container) {
            const rect = container.getBoundingClientRect();
            setColorPickerTarget({
              id: company.id,
              x: e.clientX,
              y: e.clientY,
            });
          }
        });
      }

      const bubble = el.querySelector('.bubble-inner') as HTMLDivElement || (() => {
        const d = document.createElement('div');
        d.className = 'bubble-inner';
        el.appendChild(d);
        return d;
      })();
      bubble.style.cssText = `
        position:relative;
        width:${diameter}px;
        height:${diameter}px;
        background-color:${fillColor};
        opacity:${allExecsExcluded ? 0.25 : isSelected ? 0.95 : 0.6};
        border-radius:50%;
        border:${isSelected ? '2px' : '1px'} solid ${isSelected ? '#ffffff' : 'rgba(255,255,255,0.35)'};
        box-shadow:${isSelected
          ? `0 0 0 3px ${fillColor}55, 0 0 18px ${fillColor}, 0 4px 12px rgba(0,0,0,0.45)`
          : `0 0 10px ${fillColor}66, 0 2px 6px rgba(0,0,0,0.3)`};
        transition:all 0.3s cubic-bezier(0.4,0,0.2,1);
        cursor:grab;
        display:flex;
        align-items:center;
        justify-content:center;
      `;

      const enrichDot = el.querySelector('.enrich-dot') as HTMLDivElement | null;
      if (enrichDot) enrichDot.remove();
    });
  }, [scatteredCompanies, selectedCompanyId, scalingMetric, executives, mapPositions, mapReady, getRadius]);

  return (
    <div className="h-full w-full bg-background relative z-0">
      <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }} />
      <MapLegend />

      {mapReady && mapRef.current && (
        <>
          {showAllSatellites && scatteredCompanies.map((company) => {
            const companyExecs = executives.filter((e: Executive) => e.company_id === company.id);
            if (companyExecs.length === 0) return null;
            const val = scalingMetric === 'revenue' ? company.revenue_usd : company.employees;
            const r = getRadius(val);
            const cOffset = mapPositions[`company:${company.id}`];
            return (
              <ExecutiveSatellites
                key={`sat-${company.id}`}
                map={mapRef.current!}
                companyId={company.id}
                companyLat={company.displayLat + (cOffset?.dLat || 0)}
                companyLng={company.displayLng + (cOffset?.dLng || 0)}
                companyRadius={r}
                companyStatus={company.status}
                executives={companyExecs}
                persistent
                onSelectExecutive={(execId, cId) => { selectExecutive(execId, cId); setPinnedCompanyId(cId); }}
                onDismiss={() => {}}
              />
            );
          })}

          {!showAllSatellites && pinnedCompanyId && pinnedCompanyId !== hoveredCompanyId && (() => {
            const pinned = scatteredCompanies.find(c => c.id === pinnedCompanyId);
            if (!pinned) return null;
            const pinnedExecs = executives.filter((e: Executive) => e.company_id === pinnedCompanyId);
            if (pinnedExecs.length === 0) return null;
            const pinnedValue = scalingMetric === 'revenue' ? pinned.revenue_usd : pinned.employees;
            const pinnedRadius = getRadius(pinnedValue);
            const pOffset = mapPositions[`company:${pinnedCompanyId}`];
            return (
              <ExecutiveSatellites
                key={`pinned-${pinnedCompanyId}`}
                companyId={pinnedCompanyId}
                map={mapRef.current!}
                companyLat={pinned.displayLat + (pOffset?.dLat || 0)}
                companyLng={pinned.displayLng + (pOffset?.dLng || 0)}
                companyRadius={pinnedRadius}
                companyStatus={pinned.status}
                executives={pinnedExecs}
                persistent
                onSelectExecutive={(execId, companyId) => {
                  selectExecutive(execId, companyId);
                  setPinnedCompanyId(companyId);
                }}
                onDismiss={() => {}}
              />
            );
          })()}

          {!showAllSatellites && hoveredCompanyId && (() => {
            const hovered = scatteredCompanies.find(c => c.id === hoveredCompanyId);
            if (!hovered) return null;
            const hoveredExecs = executives.filter((e: Executive) => e.company_id === hoveredCompanyId);
            if (hoveredExecs.length === 0) return null;
            const hoveredValue = scalingMetric === 'revenue' ? hovered.revenue_usd : hovered.employees;
            const hoveredRadius = getRadius(hoveredValue);
            const hOffset = mapPositions[`company:${hoveredCompanyId}`];
            const isPinned = pinnedCompanyId === hoveredCompanyId;
            return (
              <ExecutiveSatellites
                companyId={hoveredCompanyId}
                map={mapRef.current!}
                companyLat={hovered.displayLat + (hOffset?.dLat || 0)}
                companyLng={hovered.displayLng + (hOffset?.dLng || 0)}
                companyRadius={hoveredRadius}
                companyStatus={hovered.status}
                executives={hoveredExecs}
                persistent={isPinned}
                onSelectExecutive={(execId, companyId) => {
                  if (!isPinned) setHoveredCompanyId(null);
                  selectExecutive(execId, companyId);
                  setPinnedCompanyId(companyId);
                }}
                onDismiss={() => { if (!isPinned) setHoveredCompanyId(null); }}
                onPillEnter={cancelHoverDismiss}
                onPillLeave={isPinned ? undefined : startHoverDismiss}
              />
            );
          })()}
        </>
      )}

      {addCompanyDialog && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] bg-background/95 backdrop-blur border border-border p-3 rounded-lg shadow-xl animate-in fade-in slide-in-from-top-2 duration-200 w-80"
          data-testid="add-company-map-dialog"
        >
          <div className="text-xs text-muted-foreground mb-2">Add company at {addCompanyDialog.lat.toFixed(2)}, {addCompanyDialog.lng.toFixed(2)}</div>
          <div className="space-y-2">
            <Input
              ref={newCompanyInputRef}
              className="h-8 text-xs"
              placeholder="Company name..."
              value={newCompanyName}
              onChange={e => setNewCompanyName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setAddCompanyDialog(null); }}
              data-testid="input-new-company-map"
            />
            <Input
              className="h-8 text-xs"
              placeholder="Country (optional)"
              value={newMapCountry}
              onChange={e => setNewMapCountry(e.target.value)}
              data-testid="input-new-country-map"
            />
            <div className="flex gap-2">
              <Input
                className="h-8 text-xs flex-1"
                placeholder="Executive name (optional)"
                value={newMapExecName}
                onChange={e => setNewMapExecName(e.target.value)}
                data-testid="input-new-exec-name-map"
              />
              <Input
                className="h-8 text-xs flex-1"
                placeholder="Title (optional)"
                value={newMapExecTitle}
                onChange={e => setNewMapExecTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreateCompanyOnMap();
                  if (e.key === 'Escape') setAddCompanyDialog(null);
                }}
                data-testid="input-new-exec-title-map"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAddCompanyDialog(null)}>Cancel</Button>
              <Button size="sm" className="h-7 text-xs" onClick={handleCreateCompanyOnMap} disabled={!newCompanyName.trim()} data-testid="button-confirm-add-company-map">Add</Button>
            </div>
          </div>
        </div>
      )}

      {labelCompanyId && labelPos && (() => {
        const company = scatteredCompanies.find(c => c.id === labelCompanyId);
        if (!company) return null;
        const data = markerDataRef.current.get(labelCompanyId);
        const name = data?.name || company.name;
        const isPinned = pinnedCompanyId === labelCompanyId;
        const execCount = executives.filter((e: Executive) => e.company_id === labelCompanyId).length;
        const val = scalingMetric === 'revenue' ? company.revenue_usd : company.employees;
        const labelZoomScale = Math.max(0.25, Math.min(1.0, (mapZoomRef.current - 1) / (5 - 1)));
        const r = getRadius(val) * labelZoomScale;
        return (
          <div
            style={{
              position: 'absolute',
              left: labelPos.x,
              top: labelPos.y - r,
              transform: 'translate(-50%, calc(-100% - 6px))',
              zIndex: 998,
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
              transition: 'opacity 0.2s ease',
            }}
          >
            {isPinned ? (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'hsl(var(--popover) / 0.88)',
                  backdropFilter: 'blur(12px)',
                  borderRadius: '20px',
                  padding: '3px 10px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'hsl(var(--foreground))',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                }}
              >
                <span>{name}</span>
                {execCount > 0 && (
                  <span style={{ color: 'hsl(var(--muted-foreground))', fontWeight: 400, fontSize: '10px' }}>
                    · {execCount} exec{execCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            ) : (
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'hsl(var(--foreground))',
                  textShadow: '0 1px 3px rgba(0,0,0,0.5), 0 0 8px rgba(0,0,0,0.25)',
                  textAlign: 'center',
                }}
              >
                {name}
              </div>
            )}
          </div>
        );
      })()}

      {colorPickerTarget && (
        <div
          className="fixed z-[500] bg-background/95 backdrop-blur border border-border p-2 rounded shadow-xl flex gap-1 flex-wrap w-32 animate-in fade-in zoom-in-95 duration-200"
          style={{ left: colorPickerTarget.x, top: colorPickerTarget.y, transform: 'translate(-50%, -100%) translateY(-10px)' }}
        >
          {EXECUTIVE_COLORS.map((color) => (
            <button
              key={color}
              onClick={() => handleColorSelect(color)}
              className="w-6 h-6 rounded-full border border-border/50 hover:scale-110 transition-transform shadow-sm"
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
          <button
            onClick={() => setColorPickerTarget(null)}
            className="w-full text-[10px] text-muted-foreground hover:text-foreground mt-1 text-center"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
