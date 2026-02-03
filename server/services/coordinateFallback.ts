/**
 * COORDINATE FALLBACK SERVICE
 * 
 * Provides graceful degradation for missing coordinates:
 * 1. If lat/long provided → use as-is, precision = "exact"
 * 2. If lat/long missing but city provided → derive from city centroid, precision = "city"
 * 3. If lat/long missing but country provided → derive from country centroid, precision = "country"
 * 4. If nothing available → precision = "unknown"
 */

export type LocationPrecision = 'exact' | 'city' | 'country' | 'unknown';

export interface CoordinateFallbackResult {
  latitude: number | null;
  longitude: number | null;
  locationPrecision: LocationPrecision;
  inferredFrom?: string;
}

// Country centroids (approximate geographic centers)
const COUNTRY_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  // Middle East & GCC
  'united arab emirates': { lat: 24.4539, lng: 54.3773 },
  'uae': { lat: 24.4539, lng: 54.3773 },
  'saudi arabia': { lat: 23.8859, lng: 45.0792 },
  'ksa': { lat: 23.8859, lng: 45.0792 },
  'qatar': { lat: 25.3548, lng: 51.1839 },
  'kuwait': { lat: 29.3759, lng: 47.9774 },
  'bahrain': { lat: 26.0667, lng: 50.5577 },
  'oman': { lat: 21.4735, lng: 55.9754 },
  'jordan': { lat: 30.5852, lng: 36.2384 },
  'lebanon': { lat: 33.8547, lng: 35.8623 },
  'iraq': { lat: 33.2232, lng: 43.6793 },
  'iran': { lat: 32.4279, lng: 53.6880 },
  'israel': { lat: 31.0461, lng: 34.8516 },
  'palestine': { lat: 31.9522, lng: 35.2332 },
  'syria': { lat: 34.8021, lng: 38.9968 },
  'yemen': { lat: 15.5527, lng: 48.5164 },
  'egypt': { lat: 26.8206, lng: 30.8025 },
  'turkey': { lat: 38.9637, lng: 35.2433 },
  
  // Major Economies
  'united states': { lat: 37.0902, lng: -95.7129 },
  'usa': { lat: 37.0902, lng: -95.7129 },
  'united kingdom': { lat: 55.3781, lng: -3.4360 },
  'uk': { lat: 55.3781, lng: -3.4360 },
  'germany': { lat: 51.1657, lng: 10.4515 },
  'france': { lat: 46.2276, lng: 2.2137 },
  'italy': { lat: 41.8719, lng: 12.5674 },
  'spain': { lat: 40.4637, lng: -3.7492 },
  'netherlands': { lat: 52.1326, lng: 5.2913 },
  'switzerland': { lat: 46.8182, lng: 8.2275 },
  'canada': { lat: 56.1304, lng: -106.3468 },
  'australia': { lat: -25.2744, lng: 133.7751 },
  'japan': { lat: 36.2048, lng: 138.2529 },
  'china': { lat: 35.8617, lng: 104.1954 },
  'india': { lat: 20.5937, lng: 78.9629 },
  'singapore': { lat: 1.3521, lng: 103.8198 },
  'hong kong': { lat: 22.3193, lng: 114.1694 },
  'south korea': { lat: 35.9078, lng: 127.7669 },
  'brazil': { lat: -14.2350, lng: -51.9253 },
  'mexico': { lat: 23.6345, lng: -102.5528 },
  'russia': { lat: 61.5240, lng: 105.3188 },
  'south africa': { lat: -30.5595, lng: 22.9375 },
  'nigeria': { lat: 9.0820, lng: 8.6753 },
  'kenya': { lat: -0.0236, lng: 37.9062 },
  'morocco': { lat: 31.7917, lng: -7.0926 },
  'pakistan': { lat: 30.3753, lng: 69.3451 },
  'indonesia': { lat: -0.7893, lng: 113.9213 },
  'malaysia': { lat: 4.2105, lng: 101.9758 },
  'thailand': { lat: 15.8700, lng: 100.9925 },
  'vietnam': { lat: 14.0583, lng: 108.2772 },
  'philippines': { lat: 12.8797, lng: 121.7740 },
  'sweden': { lat: 60.1282, lng: 18.6435 },
  'norway': { lat: 60.4720, lng: 8.4689 },
  'denmark': { lat: 56.2639, lng: 9.5018 },
  'finland': { lat: 61.9241, lng: 25.7482 },
  'poland': { lat: 51.9194, lng: 19.1451 },
  'austria': { lat: 47.5162, lng: 14.5501 },
  'belgium': { lat: 50.5039, lng: 4.4699 },
  'ireland': { lat: 53.1424, lng: -7.6921 },
  'portugal': { lat: 39.3999, lng: -8.2245 },
  'greece': { lat: 39.0742, lng: 21.8243 },
  'czech republic': { lat: 49.8175, lng: 15.4730 },
  'new zealand': { lat: -40.9006, lng: 174.8860 },
  'argentina': { lat: -38.4161, lng: -63.6167 },
  'chile': { lat: -35.6751, lng: -71.5430 },
  'colombia': { lat: 4.5709, lng: -74.2973 },
  'peru': { lat: -9.1900, lng: -75.0152 },
};

// Major city centroids (for common business centers)
const CITY_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  // Middle East
  'dubai': { lat: 25.2048, lng: 55.2708 },
  'abu dhabi': { lat: 24.4539, lng: 54.3773 },
  'sharjah': { lat: 25.3573, lng: 55.4033 },
  'riyadh': { lat: 24.7136, lng: 46.6753 },
  'jeddah': { lat: 21.5433, lng: 39.1728 },
  'dammam': { lat: 26.4207, lng: 50.0888 },
  'doha': { lat: 25.2854, lng: 51.5310 },
  'kuwait city': { lat: 29.3759, lng: 47.9774 },
  'manama': { lat: 26.2285, lng: 50.5860 },
  'muscat': { lat: 23.5880, lng: 58.3829 },
  'amman': { lat: 31.9454, lng: 35.9284 },
  'beirut': { lat: 33.8938, lng: 35.5018 },
  'cairo': { lat: 30.0444, lng: 31.2357 },
  'istanbul': { lat: 41.0082, lng: 28.9784 },
  'tehran': { lat: 35.6892, lng: 51.3890 },
  'tel aviv': { lat: 32.0853, lng: 34.7818 },
  'jerusalem': { lat: 31.7683, lng: 35.2137 },
  'baghdad': { lat: 33.3152, lng: 44.3661 },
  
  // Major Global Cities
  'new york': { lat: 40.7128, lng: -74.0060 },
  'new york city': { lat: 40.7128, lng: -74.0060 },
  'los angeles': { lat: 34.0522, lng: -118.2437 },
  'san francisco': { lat: 37.7749, lng: -122.4194 },
  'chicago': { lat: 41.8781, lng: -87.6298 },
  'london': { lat: 51.5074, lng: -0.1278 },
  'paris': { lat: 48.8566, lng: 2.3522 },
  'berlin': { lat: 52.5200, lng: 13.4050 },
  'frankfurt': { lat: 50.1109, lng: 8.6821 },
  'munich': { lat: 48.1351, lng: 11.5820 },
  'amsterdam': { lat: 52.3676, lng: 4.9041 },
  'zurich': { lat: 47.3769, lng: 8.5417 },
  'geneva': { lat: 46.2044, lng: 6.1432 },
  'tokyo': { lat: 35.6762, lng: 139.6503 },
  'beijing': { lat: 39.9042, lng: 116.4074 },
  'shanghai': { lat: 31.2304, lng: 121.4737 },
  'hong kong': { lat: 22.3193, lng: 114.1694 },
  'singapore': { lat: 1.3521, lng: 103.8198 },
  'sydney': { lat: -33.8688, lng: 151.2093 },
  'melbourne': { lat: -37.8136, lng: 144.9631 },
  'mumbai': { lat: 19.0760, lng: 72.8777 },
  'delhi': { lat: 28.7041, lng: 77.1025 },
  'new delhi': { lat: 28.6139, lng: 77.2090 },
  'bangalore': { lat: 12.9716, lng: 77.5946 },
  'toronto': { lat: 43.6532, lng: -79.3832 },
  'vancouver': { lat: 49.2827, lng: -123.1207 },
  'sao paulo': { lat: -23.5505, lng: -46.6333 },
  'mexico city': { lat: 19.4326, lng: -99.1332 },
  'moscow': { lat: 55.7558, lng: 37.6173 },
  'johannesburg': { lat: -26.2041, lng: 28.0473 },
  'cape town': { lat: -33.9249, lng: 18.4241 },
  'lagos': { lat: 6.5244, lng: 3.3792 },
  'nairobi': { lat: -1.2921, lng: 36.8219 },
  'casablanca': { lat: 33.5731, lng: -7.5898 },
  'kuala lumpur': { lat: 3.1390, lng: 101.6869 },
  'jakarta': { lat: -6.2088, lng: 106.8456 },
  'bangkok': { lat: 13.7563, lng: 100.5018 },
  'seoul': { lat: 37.5665, lng: 126.9780 },
  'stockholm': { lat: 59.3293, lng: 18.0686 },
  'oslo': { lat: 59.9139, lng: 10.7522 },
  'copenhagen': { lat: 55.6761, lng: 12.5683 },
  'helsinki': { lat: 60.1699, lng: 24.9384 },
  'dublin': { lat: 53.3498, lng: -6.2603 },
  'vienna': { lat: 48.2082, lng: 16.3738 },
  'brussels': { lat: 50.8503, lng: 4.3517 },
  'milan': { lat: 45.4642, lng: 9.1900 },
  'rome': { lat: 41.9028, lng: 12.4964 },
  'madrid': { lat: 40.4168, lng: -3.7038 },
  'barcelona': { lat: 41.3851, lng: 2.1734 },
  'lisbon': { lat: 38.7223, lng: -9.1393 },
  'athens': { lat: 37.9838, lng: 23.7275 },
  'prague': { lat: 50.0755, lng: 14.4378 },
  'warsaw': { lat: 52.2297, lng: 21.0122 },
};

/**
 * Normalize a location string for lookup
 */
function normalizeLocation(location: string): string {
  return location.toLowerCase().trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Apply coordinate fallback logic for a company
 */
export function applyCoordinateFallback(company: {
  latitude?: number | string | null;
  longitude?: number | string | null;
  city?: string | null;
  country?: string | null;
}): CoordinateFallbackResult {
  // Case 1: Coordinates provided and valid
  const lat = company.latitude !== undefined && company.latitude !== null 
    ? Number(company.latitude) : null;
  const lng = company.longitude !== undefined && company.longitude !== null 
    ? Number(company.longitude) : null;
  
  if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng) && 
      lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
    return {
      latitude: lat,
      longitude: lng,
      locationPrecision: 'exact',
    };
  }
  
  // Case 2: Try city centroid
  if (company.city) {
    const normalizedCity = normalizeLocation(company.city);
    const cityCoords = CITY_CENTROIDS[normalizedCity];
    if (cityCoords) {
      console.log(`[CoordinateFallback] Using city centroid for "${company.city}"`);
      return {
        latitude: cityCoords.lat,
        longitude: cityCoords.lng,
        locationPrecision: 'city',
        inferredFrom: company.city,
      };
    }
  }
  
  // Case 3: Try country centroid
  if (company.country) {
    const normalizedCountry = normalizeLocation(company.country);
    const countryCoords = COUNTRY_CENTROIDS[normalizedCountry];
    if (countryCoords) {
      console.log(`[CoordinateFallback] Using country centroid for "${company.country}"`);
      return {
        latitude: countryCoords.lat,
        longitude: countryCoords.lng,
        locationPrecision: 'country',
        inferredFrom: company.country,
      };
    }
  }
  
  // Case 4: No coordinates available
  console.log(`[CoordinateFallback] No coordinates available for company (city: ${company.city}, country: ${company.country})`);
  return {
    latitude: null,
    longitude: null,
    locationPrecision: 'unknown',
  };
}

/**
 * Apply coordinate fallbacks to an array of companies
 */
export function applyCoordinateFallbackToCompanies(companies: any[]): any[] {
  return companies.map(company => {
    const fallbackResult = applyCoordinateFallback({
      latitude: company.latitude,
      longitude: company.longitude,
      city: company.city,
      country: company.country,
    });
    
    return {
      ...company,
      latitude: fallbackResult.latitude,
      longitude: fallbackResult.longitude,
      locationPrecision: fallbackResult.locationPrecision,
    };
  });
}

/**
 * Check if a company has valid coordinates (either provided or inferrable)
 */
export function canInferCoordinates(company: {
  latitude?: number | string | null;
  longitude?: number | string | null;
  city?: string | null;
  country?: string | null;
}): boolean {
  const result = applyCoordinateFallback(company);
  return result.latitude !== null && result.longitude !== null;
}
