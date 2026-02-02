import { MapContainer, TileLayer, Marker, Tooltip, useMap } from 'react-leaflet';
import { useAppStore, type Executive } from '@/lib/store';
import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import logoImage from '@/assets/images/logo.png';

// Fix for default Leaflet icon issues in React
import L from 'leaflet';

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
    
    // Skip auto-fit if user is actively interacting with the map
    if (isUserInteractingRef.current) {
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
        const bounds = L.latLngBounds(visibleCompanies.map(c => [c.lat, c.lng]));
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
  const { companies, executives, selectedCompanyId, selectCompany, updateCompany, scalingMetric, revenueFilter, hiddenCountries, hiddenCompanies } = useAppStore();
  const [colorPickerTarget, setColorPickerTarget] = useState<{ id: string, x: number, y: number } | null>(null);

  // Filter companies based on revenue slider, valid coordinates, and visibility
  const maxRevenue = 50000000000;
  const filterThreshold = (revenueFilter / 100) * maxRevenue;
  
  const filteredCompanies = companies.filter(c => {
    // Ensure revenue meets threshold
    if (c.revenue_usd < filterThreshold) return false;
    // Ensure valid coordinates (not 0,0 and within valid ranges)
    if (!isValidCoordinate(c.lat, c.lng)) return false;
    // Check visibility - hidden by country or individually hidden
    if (hiddenCountries.has(c.hq_country)) return false;
    if (hiddenCompanies.has(c.id)) return false;
    return true;
  });

  // Scale revenue/employees to radius
  const getRadius = (value: number) => {
    if (!value || filteredCompanies.length === 0) return 20;

    // Calculate min/max from current filtered dataset for relative scaling
    const values = filteredCompanies.map(c => scalingMetric === 'revenue' ? c.revenue_usd : c.employees);
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

  return (
    <div className="h-full w-full bg-slate-100 relative z-0">
      <MapContainer 
        center={[20, 0]} 
        zoom={2} 
        style={{ height: '100%', width: '100%' }}
        className="outline-none"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        
        <MapUpdater />

        {filteredCompanies.map((company) => {
          const isSelected = selectedCompanyId === company.id;
          const value = scalingMetric === 'revenue' ? company.revenue_usd : company.employees;
          const radius = getRadius(value);
          const diameter = radius * 2;
          
          // Check if company has any enriched executives
          const companyExecs = executives.filter((e: Executive) => e.company_id === company.id);
          const hasEnrichedExecs = companyExecs.some((e: Executive) => e.isEnriched);
          
          const fillColor = company.color || (isSelected ? 'hsl(35 92% 50%)' : 'hsl(222 47% 11%)');
          const borderColor = isSelected ? 'hsl(35 92% 50%)' : (company.color || 'hsl(222 47% 11%)');
          
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
                opacity: ${isSelected ? 0.8 : 0.4};
                border: ${isSelected ? '2px solid ' + borderColor : '1px solid ' + borderColor};
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
              position={[company.lat, company.lng]}
              icon={customIcon}
              draggable={true}
              eventHandlers={{
                click: () => selectCompany(company.id),
                dragend: (e) => {
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
        <img src={logoImage} alt="ALAC Partners" className="h-48 w-auto opacity-30 mix-blend-multiply" />
      </div>

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
