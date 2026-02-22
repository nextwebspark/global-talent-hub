import { MapContainer, TileLayer, Marker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { useAppStore, type Executive, transformAPICompany } from '@/lib/store';
import React, { useEffect, useMemo, useRef, useState, useCallback, useSyncExternalStore } from 'react';
import 'leaflet/dist/leaflet.css';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import logoImage from '@/assets/images/logo.png';
import { toast } from 'sonner';

import L from 'leaflet';

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

const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const LIGHT_TILES = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

function ReactiveTileLayer() {
  const isDark = useIsDarkMode();
  const map = useMap();
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  useEffect(() => {
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    const layer = L.tileLayer(isDark ? DARK_TILES : LIGHT_TILES, { attribution: TILE_ATTRIBUTION });
    layer.addTo(map);
    tileLayerRef.current = layer;
    return () => { if (tileLayerRef.current) map.removeLayer(tileLayerRef.current); };
  }, [isDark, map]);

  return null;
}

// Helper to check if coordinates are valid
function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    !isNaN(lat) && !isNaN(lng) &&
    isFinite(lat) && isFinite(lng) &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180 &&
    (lat !== 0 || lng !== 0)
  );
}

// Global flag to track marker dragging (shared between MapUpdater and Markers)
let isMarkerDragging = false;

// Component to handle map bounds updates
function MapUpdater() {
  const companies = useAppStore(state => state.companies);
  const hiddenCountries = useAppStore(state => state.hiddenCountries);
  const hiddenCompanies = useAppStore(state => state.hiddenCompanies);
  const map = useMap();
  const prevCountRef = useRef(0);
  const lastFitTimeRef = useRef(0);
  const isUserInteractingRef = useRef(false);
  const interactionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Expose map to window for panel access
    (window as any).leafletMap = map;
    
    // Track user interactions to pause auto-fit
    const handleInteractionStart = () => {
      isUserInteractingRef.current = true;
      if (interactionTimeoutRef.current) {
        clearTimeout(interactionTimeoutRef.current);
      }
    };
    
    const handleInteractionEnd = () => {
      // Resume auto-fit after 2 seconds of no interaction
      interactionTimeoutRef.current = setTimeout(() => {
        isUserInteractingRef.current = false;
      }, 2000);
    };
    
    map.on('dragstart', handleInteractionStart);
    map.on('zoomstart', handleInteractionStart);
    map.on('dragend', handleInteractionEnd);
    map.on('zoomend', handleInteractionEnd);
    
    return () => {
      map.off('dragstart', handleInteractionStart);
      map.off('zoomstart', handleInteractionStart);
      map.off('dragend', handleInteractionEnd);
      map.off('zoomend', handleInteractionEnd);
      if (interactionTimeoutRef.current) {
        clearTimeout(interactionTimeoutRef.current);
      }
    };
  }, [map]);

  useEffect(() => {
    // Filter companies by visibility and valid coordinates
    const visibleCompanies = companies.filter(c => {
      if (!isValidCoordinate(c.lat, c.lng)) return false;
      if (hiddenCountries.has(c.hq_country)) return false;
      if (hiddenCompanies.has(c.id)) return false;
      return true;
    });
    const now = Date.now();
    
    // Skip auto-fit if user is actively interacting with the map or dragging a marker
    if (isUserInteractingRef.current || isMarkerDragging) {
      prevCountRef.current = visibleCompanies.length;
      return;
    }
    
    // Auto-fit bounds when:
    // 1. New companies are added (streaming search)
    // 2. At least 500ms since last fit (debounce)
    // 3. Company count changed
    if (visibleCompanies.length > 0 && visibleCompanies.length !== prevCountRef.current) {
      const timeSinceLastFit = now - lastFitTimeRef.current;
      
      // For the first company, fit immediately. For subsequent, debounce to 500ms
      if (prevCountRef.current === 0 || timeSinceLastFit > 500) {
        // Add slight padding to bounds to account for potential scatter offsets
        const bounds = L.latLngBounds(visibleCompanies.map(c => [c.lat, c.lng]));
        bounds.pad(0.1); // 10% padding to ensure scattered markers stay visible
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12, animate: true, duration: 0.5 });
        lastFitTimeRef.current = now;
      }
      
      prevCountRef.current = visibleCompanies.length;
    }
    
    // Reset when companies are cleared (new search starting)
    if (visibleCompanies.length === 0) {
      prevCountRef.current = 0;
    }
  }, [companies, hiddenCountries, hiddenCompanies, map]);

  return null;
}

function MapClickHandler({ onDoubleClick }: { onDoubleClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    dblclick(e) {
      e.originalEvent.preventDefault();
      onDoubleClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

const EXECUTIVE_COLORS = [
  'hsl(35 92% 50%)', // Gold (Default Accent)
  'hsl(222 47% 11%)', // Navy (Default Primary)
  'hsl(0 84% 60%)', // Red
  'hsl(142 71% 45%)', // Green
  'hsl(262 83% 58%)', // Purple
  'hsl(316 73% 52%)', // Pink
  'hsl(25 95% 53%)', // Orange
  'hsl(199 89% 48%)', // Blue
];

export default function MapComponent() {
  const { companies, executives, selectedCompanyId, selectCompany, updateCompany, addCompany, scalingMetric, revenueFilterRange, employeeFilterRange, hiddenCountries, hiddenCompanies, currentProject } = useAppStore();
  const [colorPickerTarget, setColorPickerTarget] = useState<{ id: string, x: number, y: number } | null>(null);
  const [addCompanyDialog, setAddCompanyDialog] = useState<{ lat: number, lng: number } | null>(null);
  const [newCompanyName, setNewCompanyName] = useState('');
  const newCompanyInputRef = useRef<HTMLInputElement>(null);

  const handleMapDoubleClick = useCallback((lat: number, lng: number) => {
    setAddCompanyDialog({ lat, lng });
    setNewCompanyName('');
    setTimeout(() => newCompanyInputRef.current?.focus(), 100);
  }, []);

  const handleCreateCompanyOnMap = useCallback(async () => {
    if (!addCompanyDialog || !newCompanyName.trim()) return;
    try {
      const searchQueryId = currentProject?.id ? parseInt(currentProject.id) : null;
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCompanyName.trim(),
          country: 'Unknown',
          sector: 'Unknown',
          latitude: String(addCompanyDialog.lat),
          longitude: String(addCompanyDialog.lng),
          ...(searchQueryId ? { searchQueryId } : {}),
        }),
      });
      if (!res.ok) throw new Error('Failed');
      const company = await res.json();
      addCompany(transformAPICompany(company));
      setAddCompanyDialog(null);
      setNewCompanyName('');
      toast.success(`Added "${newCompanyName.trim()}" to the map`);
    } catch {
      toast.error('Failed to add company');
    }
  }, [addCompanyDialog, newCompanyName, addCompany, currentProject]);

  // Filter companies based on revenue/employee range sliders, valid coordinates, and visibility
  const revenueMin = revenueFilterRange[0] * 50000000;
  const revenueMax = revenueFilterRange[1] * 50000000;
  const employeeMin = employeeFilterRange[0] * 100;
  const employeeMax = employeeFilterRange[1] * 100;
  const hasRevenueFilter = revenueFilterRange[0] > 0 || revenueFilterRange[1] < 100;
  const hasEmployeeFilter = employeeFilterRange[0] > 0 || employeeFilterRange[1] < 100;
  
  const filteredCompanies = companies.filter(c => {
    const revenue = c.revenue_usd || 0;
    const employees = c.employees || 0;
    if (hasRevenueFilter && (revenue < revenueMin || revenue > revenueMax)) return false;
    if (hasEmployeeFilter && (employees < employeeMin || employees > employeeMax)) return false;
    // Ensure valid coordinates (not 0,0 and within valid ranges)
    if (!isValidCoordinate(c.lat, c.lng)) return false;
    // Check visibility - hidden by country or individually hidden
    if (hiddenCountries.has(c.hq_country)) return false;
    if (hiddenCompanies.has(c.id)) return false;
    return true;
  });

  // Scale revenue/employees to radius
  // Unknown/null values get neutral sizing (no influence on scaling)
  const getRadius = (value: number | null | undefined) => {
    const neutralRadius = 20;
    
    // Unknown/null values get neutral sizing - they don't influence the scale
    if (!value || value === 0) return neutralRadius;
    if (filteredCompanies.length === 0) return neutralRadius;

    // Only include companies with valid values for scaling calculation
    const values = filteredCompanies
      .map(c => scalingMetric === 'revenue' ? c.revenue_usd : c.employees)
      .filter((v): v is number => v !== null && v !== undefined && v > 0);
    
    // If no valid values, use neutral sizing
    if (values.length === 0) return neutralRadius;
    
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    
    const minRadius = 15;
    const maxRadius = 50;

    if (maxVal === minVal) return (minRadius + maxRadius) / 2;

    // Linear scaling relative to the current dataset
    const normalized = (value - minVal) / (maxVal - minVal);
    
    // Apply a slight power scale to make smaller bubbles more visible but maintain relative difference
    const scaled = Math.pow(normalized, 0.7);
    
    return minRadius + (scaled * (maxRadius - minRadius));
  };

  const handleColorSelect = (color: string) => {
    if (colorPickerTarget) {
      updateCompany(colorPickerTarget.id, { color });
      setColorPickerTarget(null);
    }
  };

  // Apply scatter offsets to prevent overlapping bubbles in the same location
  const scatteredCompanies = useMemo(() => {
    const locationGroups = new Map<string, typeof filteredCompanies>();
    
    // Group companies by rounded coordinates (same general location)
    filteredCompanies.forEach(company => {
      // Round to 1 decimal place to detect nearby companies
      const key = `${Math.round(company.lat * 10) / 10},${Math.round(company.lng * 10) / 10}`;
      if (!locationGroups.has(key)) {
        locationGroups.set(key, []);
      }
      locationGroups.get(key)!.push(company);
    });
    
    // Apply scatter offset to groups with multiple companies
    const result: Array<typeof filteredCompanies[0] & { displayLat: number; displayLng: number }> = [];
    locationGroups.forEach((group) => {
      if (group.length === 1) {
        result.push({ ...group[0], displayLat: group[0].lat, displayLng: group[0].lng });
      } else {
        // Scatter companies in a circle around their center
        const angleStep = (2 * Math.PI) / group.length;
        const scatterRadius = 0.15 + (group.length * 0.03); // Small offset in degrees (max ~0.5 degrees)
        group.forEach((company, index) => {
          const angle = index * angleStep;
          const offsetLat = Math.sin(angle) * scatterRadius;
          const offsetLng = Math.cos(angle) * scatterRadius;
          result.push({
            ...company,
            displayLat: company.lat + offsetLat,
            displayLng: company.lng + offsetLng
          });
        });
      }
    });
    
    return result;
  }, [filteredCompanies]);


  return (
    <div className="h-full w-full bg-background relative z-0">
      <MapContainer 
        center={[20, 0]} 
        zoom={2} 
        style={{ height: '100%', width: '100%' }}
        className="outline-none"
        zoomControl={false}
        doubleClickZoom={false}
        minZoom={2}
        worldCopyJump={true}
      >
        <ReactiveTileLayer />
        <MapClickHandler onDoubleClick={handleMapDoubleClick} />
        
        <MapUpdater />

        {scatteredCompanies.map((company) => {
          const isSelected = selectedCompanyId === company.id;
          const value = scalingMetric === 'revenue' ? company.revenue_usd : company.employees;
          const radius = getRadius(value);
          const diameter = radius * 2;
          
          // Check if company has any enriched executives
          const companyExecs = executives.filter((e: Executive) => e.company_id === company.id);
          const hasEnrichedExecs = companyExecs.some((e: Executive) => e.isEnriched);
          
          const fillColor = isSelected ? 'hsl(35 92% 50%)' : (company.color || 'hsl(222 47% 11%)');
          
          // Subtle enrichment indicator - emerald ring for enriched companies
          const enrichedRing = hasEnrichedExecs ? 
            `<div style="position: absolute; top: -3px; right: -3px; width: 10px; height: 10px; background: #10b981; border-radius: 50%; border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3);"></div>` : '';

          // Create custom icon for draggable marker
          const customIcon = L.divIcon({
            className: 'custom-bubble-icon',
            html: `
              <div style="
                position: relative;
                width: ${diameter}px;
                height: ${diameter}px;
                background-color: ${fillColor};
                opacity: ${isSelected ? 0.9 : 0.5};
                border-radius: 50%;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                cursor: grab;
                display: flex;
                align-items: center;
                justify-content: center;
              ">${enrichedRing}</div>
            `,
            iconSize: [diameter, diameter],
            iconAnchor: [radius, radius], // Center the icon
          });

          return (
            <Marker
              key={company.id}
              position={[company.displayLat, company.displayLng]}
              icon={customIcon}
              draggable={true}
              eventHandlers={{
                click: () => selectCompany(company.id),
                dragstart: () => {
                  isMarkerDragging = true;
                },
                dragend: (e) => {
                  isMarkerDragging = false;
                  const marker = e.target;
                  const position = marker.getLatLng();
                  updateCompany(company.id, {
                    lat: position.lat,
                    lng: position.lng
                  });
                },
                dblclick: (e) => {
                  // Prevent map zoom on double click
                  e.originalEvent.stopPropagation();
                  e.originalEvent.preventDefault();
                  
                  // Open color picker
                  const mapContainer = e.target._map.getContainer();
                  const point = e.containerPoint; // Pixel coordinates relative to map container
                  
                  // We need absolute coordinates for the fixed overlay
                  const rect = mapContainer.getBoundingClientRect();
                  
                  setColorPickerTarget({
                    id: company.id,
                    x: rect.left + point.x,
                    y: rect.top + point.y
                  });
                }
              }}
            >
              <Tooltip direction="top" offset={[0, -radius]} opacity={1}>
                <div className="font-sans text-xs font-semibold">
                  {company.name}
                </div>
                <div className="font-sans text-xs text-muted-foreground">
                  {scalingMetric === 'revenue' 
                    ? `$${(company.revenue_usd / 1000000).toFixed(0)}M`
                    : `${company.employees.toLocaleString()} Empl.`
                  }
                </div>
              </Tooltip>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Logo in bottom right */}
      <div className="absolute bottom-4 right-4 z-[400]">
        <img src={logoImage} alt="ALAC Partners" className="h-48 w-auto opacity-20 dark:brightness-200 dark:contrast-50" />
      </div>

      {addCompanyDialog && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] bg-background/95 backdrop-blur border border-border p-3 rounded-lg shadow-xl animate-in fade-in slide-in-from-top-2 duration-200 w-72"
          data-testid="add-company-map-dialog"
        >
          <div className="text-xs text-muted-foreground mb-2">Add company at {addCompanyDialog.lat.toFixed(2)}, {addCompanyDialog.lng.toFixed(2)}</div>
          <div className="flex gap-2">
            <Input
              ref={newCompanyInputRef}
              className="h-8 text-xs flex-1"
              placeholder="Company name..."
              value={newCompanyName}
              onChange={e => setNewCompanyName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateCompanyOnMap();
                if (e.key === 'Escape') setAddCompanyDialog(null);
              }}
              data-testid="input-new-company-map"
            />
            <Button size="sm" className="h-8 text-xs" onClick={handleCreateCompanyOnMap} disabled={!newCompanyName.trim()} data-testid="button-confirm-add-company-map">
              Add
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setAddCompanyDialog(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Color Picker Overlay */}
      {colorPickerTarget && (
        <div 
          className="fixed z-[500] bg-background/95 backdrop-blur border border-border p-2 rounded shadow-xl flex gap-1 flex-wrap w-32 animate-in fade-in zoom-in-95 duration-200"
          style={{ 
            left: colorPickerTarget.x, 
            top: colorPickerTarget.y,
            transform: 'translate(-50%, -100%) translateY(-10px)' 
          }}
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
