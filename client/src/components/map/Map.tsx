import { MapContainer, TileLayer, Marker, Tooltip, useMap } from 'react-leaflet';
import { useAppStore } from '@/lib/store';
import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

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
  const map = useMap();
  const hasFitBounds = useRef(false);

  useEffect(() => {
    // Only fit bounds once when companies are loaded to avoid jumping around during drag
    const validCompanies = companies.filter(c => isValidCoordinate(c.lat, c.lng));
    if (validCompanies.length > 0 && !hasFitBounds.current) {
      const bounds = L.latLngBounds(validCompanies.map(c => [c.lat, c.lng]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
      hasFitBounds.current = true;
    }
  }, [companies, map]);

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
  const { companies, selectedCompanyId, selectCompany, updateCompany, scalingMetric, revenueFilter } = useAppStore();
  const [colorPickerTarget, setColorPickerTarget] = useState<{ id: string, x: number, y: number } | null>(null);

  // Filter companies based on revenue slider and valid coordinates
  const maxRevenue = 50000000000;
  const filterThreshold = (revenueFilter / 100) * maxRevenue;
  
  const filteredCompanies = companies.filter(c => {
    // Ensure revenue meets threshold
    if (c.revenue_usd < filterThreshold) return false;
    // Ensure valid coordinates (not 0,0 and within valid ranges)
    return isValidCoordinate(c.lat, c.lng);
  });

  // Scale revenue/employees to radius
  const getRadius = (value: number) => {
    let minVal, maxVal;
    
    if (scalingMetric === 'revenue') {
      minVal = 100000000;
      maxVal = 50000000000;
    } else {
      minVal = 200;
      maxVal = 100000;
    }
    
    const minRadius = 15;
    const maxRadius = 60;

    if (!value) return minRadius;

    const clampedVal = Math.max(minVal, Math.min(value, maxVal));
    const normalized = Math.pow((clampedVal - minVal) / (maxVal - minVal), 0.5);
    
    return minRadius + (normalized * (maxRadius - minRadius));
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
          
          const fillColor = company.color || (isSelected ? 'hsl(35 92% 50%)' : 'hsl(222 47% 11%)');
          const borderColor = isSelected ? 'hsl(35 92% 50%)' : (company.color || 'hsl(222 47% 11%)');

          // Create custom icon for draggable marker
          const customIcon = L.divIcon({
            className: 'custom-bubble-icon',
            html: `
              <div style="
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
              "></div>
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
