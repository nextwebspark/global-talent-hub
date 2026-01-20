import { MapContainer, TileLayer, Marker, Tooltip, useMap } from 'react-leaflet';
import { useAppStore } from '@/lib/store';
import { useEffect, useMemo, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

// Fix for default Leaflet icon issues in React
import L from 'leaflet';

// Component to handle map bounds updates
function MapUpdater() {
  const companies = useAppStore(state => state.companies);
  const map = useMap();
  const hasFitBounds = useRef(false);

  useEffect(() => {
    // Only fit bounds once when companies are loaded to avoid jumping around during drag
    if (companies.length > 0 && !hasFitBounds.current) {
      const bounds = L.latLngBounds(companies.map(c => [c.lat, c.lng]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
      hasFitBounds.current = true;
    }
  }, [companies, map]);

  return null;
}

export default function MapComponent() {
  const { companies, selectedCompanyId, selectCompany, updateCompany } = useAppStore();

  // Scale revenue to radius (logarithmic scale usually better for money)
  const getRadius = (revenue: number) => {
    // Base size + log scale
    return Math.max(10, Math.log(revenue) * 2);
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

        {companies.map((company) => {
          const isSelected = selectedCompanyId === company.id;
          const radius = getRadius(company.revenue_usd);
          const diameter = radius * 2;
          
          // Create custom icon for draggable marker
          const customIcon = L.divIcon({
            className: 'custom-bubble-icon',
            html: `
              <div style="
                width: ${diameter}px;
                height: ${diameter}px;
                background-color: ${isSelected ? 'hsl(35 92% 50%)' : 'hsl(222 47% 11%)'};
                opacity: ${isSelected ? 0.8 : 0.4};
                border: ${isSelected ? '2px solid hsl(35 92% 50%)' : '1px solid hsl(222 47% 11%)'};
                border-radius: 50%;
                transition: all 0.2s ease;
                cursor: grab;
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
                }
              }}
            >
              <Tooltip direction="top" offset={[0, -radius]} opacity={1}>
                <div className="font-sans text-xs font-semibold">
                  {company.name}
                </div>
                <div className="font-sans text-xs text-muted-foreground">
                  ${(company.revenue_usd / 1000000).toFixed(0)}M
                </div>
              </Tooltip>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
