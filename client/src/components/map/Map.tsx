import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import { useAppStore } from '@/lib/store';
import { useEffect } from 'react';
import 'leaflet/dist/leaflet.css';

// Fix for default Leaflet icon issues in React
import L from 'leaflet';

// Component to handle map bounds updates
function MapUpdater() {
  const companies = useAppStore(state => state.companies);
  const map = useMap();

  useEffect(() => {
    if (companies.length > 0) {
      const bounds = L.latLngBounds(companies.map(c => [c.lat, c.lng]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  }, [companies, map]);

  return null;
}

export default function MapComponent() {
  const { companies, selectedCompanyId, selectCompany } = useAppStore();

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
          
          return (
            <CircleMarker
              key={company.id}
              center={[company.lat, company.lng]}
              radius={getRadius(company.revenue_usd)}
              pathOptions={{
                color: isSelected ? 'hsl(35 92% 50%)' : 'hsl(222 47% 11%)', // Accent or Primary
                fillColor: isSelected ? 'hsl(35 92% 50%)' : 'hsl(222 47% 11%)',
                fillOpacity: isSelected ? 0.8 : 0.4,
                weight: isSelected ? 2 : 1,
              }}
              eventHandlers={{
                click: () => selectCompany(company.id),
              }}
            >
              <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                <div className="font-sans text-xs font-semibold">
                  {company.name}
                </div>
                <div className="font-sans text-xs text-muted-foreground">
                  ${(company.revenue_usd / 1000000).toFixed(0)}M
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
