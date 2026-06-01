export const REGION_COORDINATES: Record<string, { lat: number; lng: number }> = {
  'north america': { lat: 40.7128, lng: -74.0060 },
  'united states': { lat: 40.7128, lng: -74.0060 },
  'usa': { lat: 40.7128, lng: -74.0060 },
  'europe': { lat: 51.5074, lng: -0.1278 },
  'asia': { lat: 35.6762, lng: 139.6503 },
  'middle east': { lat: 25.2048, lng: 55.2708 },
  'uae': { lat: 25.2048, lng: 55.2708 },
  'dubai': { lat: 25.2048, lng: 55.2708 },
  'abu dhabi': { lat: 24.4539, lng: 54.3773 },
  'united arab emirates': { lat: 25.2048, lng: 55.2708 },
  'saudi arabia': { lat: 24.7136, lng: 46.6753 },
  'africa': { lat: -1.2921, lng: 36.8219 },
  'south america': { lat: -23.5505, lng: -46.6333 },
  'latin america': { lat: -23.5505, lng: -46.6333 },
  'australia': { lat: -33.8688, lng: 151.2093 },
  'oceania': { lat: -33.8688, lng: 151.2093 },
  'china': { lat: 31.2304, lng: 121.4737 },
  'india': { lat: 19.0760, lng: 72.8777 },
  'japan': { lat: 35.6762, lng: 139.6503 },
  'germany': { lat: 52.5200, lng: 13.4050 },
  'uk': { lat: 51.5074, lng: -0.1278 },
  'united kingdom': { lat: 51.5074, lng: -0.1278 },
  'france': { lat: 48.8566, lng: 2.3522 },
  'default': { lat: 0, lng: 0 }
};

export function parseNumber(value: any, defaultValue: number = 0): number {
  if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[,$\s]/g, '').replace(/[BbMmKk]$/, (m) => {
      const multipliers: Record<string, string> = { 'B': '000000000', 'b': '000000000', 'M': '000000', 'm': '000000', 'K': '000', 'k': '000' };
      return multipliers[m] || '';
    });
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed) && isFinite(parsed)) {
      return parsed;
    }
  }
  return defaultValue;
}

export function validateCoordinates(lat: any, lng: any, region?: string, country?: string, city?: string): { lat: number; lng: number } {
  const parsedLat = parseNumber(lat);
  const parsedLng = parseNumber(lng);

  if (parsedLat >= -90 && parsedLat <= 90 && parsedLng >= -180 && parsedLng <= 180 &&
      (parsedLat !== 0 || parsedLng !== 0)) {
    return { lat: parsedLat, lng: parsedLng };
  }

  const lookupKey = (city || country || region || 'default').toLowerCase().trim();
  const fallback = REGION_COORDINATES[lookupKey] || REGION_COORDINATES['default'];

  const offset = () => (Math.random() - 0.5) * 0.1;
  return { lat: fallback.lat + offset(), lng: fallback.lng + offset() };
}

export const VALID_BUSINESS_TYPES = ['distributor', 'retailer', 'manufacturer', 'wholesaler', 'service_provider'];

// Track used coordinates to prevent overlapping map markers
const usedCoordinates: Map<string, number> = new Map();

export function getUniqueCoordinates(lat: number, lng: number): { lat: number; lng: number } {
  const key = `${lat.toFixed(3)}_${lng.toFixed(3)}`;
  const count = usedCoordinates.get(key) || 0;
  usedCoordinates.set(key, count + 1);

  if (count === 0) {
    return { lat, lng };
  }

  // Spiral pattern offset for overlapping coordinates
  const angle = count * (Math.PI / 4); // 45 degrees per step
  const radius = 0.01 + (count * 0.005); // Increasing radius
  const offsetLat = Math.cos(angle) * radius;
  const offsetLng = Math.sin(angle) * radius;

  return {
    lat: lat + offsetLat,
    lng: lng + offsetLng
  };
}

export function resetCoordinateTracking() {
  usedCoordinates.clear();
}

export function normalizeBusinessType(rawType: string): string {
  const normalized = rawType.toLowerCase().trim();
  if (VALID_BUSINESS_TYPES.includes(normalized)) {
    return normalized;
  }
  if (normalized.includes('distribut')) return 'distributor';
  if (normalized.includes('retail')) return 'retailer';
  if (normalized.includes('manufactur') || normalized.includes('producer')) return 'manufacturer';
  if (normalized.includes('wholesale')) return 'wholesaler';
  if (normalized.includes('service') || normalized.includes('provider')) return 'service_provider';
  return normalized || 'unknown';
}
