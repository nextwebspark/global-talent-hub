import type { Company as APICompany, Executive as APIExecutive } from '../api';
import { normalizeCountryName } from '../countries';
import type { Company, Executive } from './types';

export function safeParseFloat(value: unknown, defaultValue: number = 0): number {
  if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && isFinite(parsed)) {
      return parsed;
    }
  }
  return defaultValue;
}

export function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    !isNaN(lat) && !isNaN(lng) &&
    isFinite(lat) && isFinite(lng) &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

const COUNTRY_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  'united arab emirates': { lat: 23.4241, lng: 53.8478 },
  'uae': { lat: 23.4241, lng: 53.8478 },
  'saudi arabia': { lat: 23.8859, lng: 45.0792 },
  'qatar': { lat: 25.2854, lng: 51.531 },
  'bahrain': { lat: 26.0667, lng: 50.5577 },
  'kuwait': { lat: 29.3117, lng: 47.4818 },
  'oman': { lat: 21.4735, lng: 55.9754 },
  'turkey': { lat: 38.9637, lng: 35.2433 },
  'egypt': { lat: 26.8206, lng: 30.8025 },
  'jordan': { lat: 30.5852, lng: 36.2384 },
  'lebanon': { lat: 33.8547, lng: 35.8623 },
  'iraq': { lat: 33.2232, lng: 43.6793 },
  'iran': { lat: 32.4279, lng: 53.688 },
  'india': { lat: 20.5937, lng: 78.9629 },
  'china': { lat: 35.8617, lng: 104.1954 },
  'japan': { lat: 36.2048, lng: 138.2529 },
  'south korea': { lat: 35.9078, lng: 127.7669 },
  'united kingdom': { lat: 55.3781, lng: -3.436 },
  'uk': { lat: 55.3781, lng: -3.436 },
  'united states': { lat: 37.0902, lng: -95.7129 },
  'usa': { lat: 37.0902, lng: -95.7129 },
  'germany': { lat: 51.1657, lng: 10.4515 },
  'france': { lat: 46.2276, lng: 2.2137 },
  'italy': { lat: 41.8719, lng: 12.5674 },
  'spain': { lat: 40.4637, lng: -3.7492 },
  'brazil': { lat: -14.235, lng: -51.9253 },
  'australia': { lat: -25.2744, lng: 133.7751 },
  'canada': { lat: 56.1304, lng: -106.3468 },
  'russia': { lat: 61.524, lng: 105.3188 },
  'south africa': { lat: -30.5595, lng: 22.9375 },
  'nigeria': { lat: 9.082, lng: 8.6753 },
  'kenya': { lat: -0.0236, lng: 37.9062 },
  'singapore': { lat: 1.3521, lng: 103.8198 },
  'malaysia': { lat: 4.2105, lng: 101.9758 },
  'indonesia': { lat: -0.7893, lng: 113.9213 },
  'thailand': { lat: 15.87, lng: 100.9925 },
  'vietnam': { lat: 14.0583, lng: 108.2772 },
  'philippines': { lat: 12.8797, lng: 121.774 },
  'pakistan': { lat: 30.3753, lng: 69.3451 },
  'mexico': { lat: 23.6345, lng: -102.5528 },
  'netherlands': { lat: 52.1326, lng: 5.2913 },
  'switzerland': { lat: 46.8182, lng: 8.2275 },
  'sweden': { lat: 60.1282, lng: 18.6435 },
  'norway': { lat: 60.472, lng: 8.4689 },
  'denmark': { lat: 56.2639, lng: 9.5018 },
  'finland': { lat: 61.9241, lng: 25.7482 },
  'poland': { lat: 51.9194, lng: 19.1451 },
  'morocco': { lat: 31.7917, lng: -7.0926 },
  'tunisia': { lat: 33.8869, lng: 9.5375 },
  'algeria': { lat: 28.0339, lng: 1.6596 },
  'libya': { lat: 26.3351, lng: 17.2283 },
};

function getCountryCentroid(country: string): { lat: number; lng: number } | null {
  if (!country || country === 'Unknown') return null;
  return COUNTRY_CENTROIDS[country.toLowerCase().trim()] || null;
}

export function transformAPICompany(apiCompany: APICompany): Company {
  let lat = safeParseFloat(apiCompany.latitude, 0);
  let lng = safeParseFloat(apiCompany.longitude, 0);
  const revenue = safeParseFloat(apiCompany.revenue, 0);
  const employees = Math.round(safeParseFloat(apiCompany.employees, 0));
  let confidence = Math.round(safeParseFloat((apiCompany as { confidence?: unknown }).confidence, 5));
  confidence = Math.max(1, Math.min(10, confidence));
  const ext = apiCompany as unknown as Record<string, unknown>;
  const country = normalizeCountryName(apiCompany.country || '');

  if (!isValidCoordinate(lat, lng)) {
    const centroid = getCountryCentroid(country);
    if (centroid) {
      lat = centroid.lat;
      lng = centroid.lng;
    }
  }

  return {
    id: String(apiCompany.id || '0'),
    name: String(apiCompany.name || 'Unknown Company').trim(),
    industry: String(apiCompany.sector || '').trim(),
    sectorCategory: String(ext.sectorCategory || '').trim(),
    hq_country: country,
    streetAddress: ext.streetAddress ? String(ext.streetAddress).trim() : undefined,
    lat: isValidCoordinate(lat, lng) ? lat : 0,
    lng: isValidCoordinate(lat, lng) ? lng : 0,
    revenue_usd: revenue >= 0 ? revenue : 0,
    revenueSource: String(ext.revenueSource || 'Unknown').trim(),
    revenueSourceUrl: (ext.revenueSourceUrl as string | undefined) || undefined,
    revenueConfidence: (ext.revenueConfidence as number | undefined) ?? undefined,
    revenueCurrency: (ext.revenueCurrency as string | undefined) || undefined,
    revenueFiscalYear: (ext.revenueFiscalYear as number | undefined) ?? undefined,
    employees: employees >= 0 ? employees : 0,
    employeesSource: String(ext.employeesSource || 'Unknown').trim(),
    employeesSourceUrl: (ext.employeesSourceUrl as string | undefined) || undefined,
    employeesConfidence: (ext.employeesConfidence as number | undefined) ?? undefined,
    geographicFootprint: (ext.geographicFootprint as number | undefined) ?? undefined,
    customerModel: ext.customerModel ? String(ext.customerModel).trim() : undefined,
    ownershipType: ext.ownershipType ? String(ext.ownershipType).trim() : undefined,
    coreActivity: ext.coreActivity ? String(ext.coreActivity).trim() : undefined,
    operatingModel: ext.operatingModel ? String(ext.operatingModel).trim() : undefined,
    revenueDrivers: ext.revenueDrivers ? String(ext.revenueDrivers).trim() : undefined,
    summary: ext.summary ? String(ext.summary).trim() : undefined,
    lastVerifiedYear: (ext.lastVerifiedYear as number | undefined) ?? undefined,
    businessType: ext.businessType ? String(ext.businessType).trim() : undefined,
    relevanceReason: ext.relevanceReason ? String(ext.relevanceReason).trim() : undefined,
    confidence,
    status: (ext.status as string | undefined) || undefined,
    color: apiCompany.color || '#1e3a8a',
    source: String(ext.source || 'Unknown').trim(),
  };
}

export function transformAPIExecutive(apiExec: APIExecutive, companyId: string): Executive {
  let confidence = Math.round(safeParseFloat((apiExec as { confidence?: unknown }).confidence, 5));
  confidence = Math.max(1, Math.min(10, confidence));

  const ext = apiExec as unknown as Record<string, unknown>;
  const enrichmentSource = (ext.enrichmentSource as string | undefined) || undefined;
  const enrichmentConfidence = (ext.enrichmentConfidence as number | undefined) || undefined;
  const enrichmentTimestamp = (ext.enrichmentTimestamp as string | undefined) || undefined;
  const isEnriched = Boolean(enrichmentSource || ext.clockworkId);

  const rawCustomFields = ext.customFields;
  let customFields: Record<string, string> | undefined;
  if (rawCustomFields && typeof rawCustomFields === 'object' && Object.keys(rawCustomFields).length > 0) {
    customFields = rawCustomFields as Record<string, string>;
  }

  return {
    id: String(apiExec.id || '0'),
    company_id: String(companyId || '0'),
    name: String(apiExec.name || 'Unknown').trim(),
    title: String(apiExec.title || 'Unknown').trim(),
    source: String(ext.source || 'Unknown').trim(),
    profileUrl: (ext.profileUrl as string | undefined) || (ext.linkedin as string | undefined) || undefined,
    imageUrl: (ext.imageUrl as string | undefined) || undefined,
    linkedin: (ext.linkedin as string | undefined) || undefined,
    notes: (ext.notes as string | undefined) || undefined,
    email: (ext.email as string | undefined) || undefined,
    phone: (ext.phone as string | undefined) || undefined,
    remunerationNotes: (ext.remunerationNotes as string | undefined) || undefined,
    availability: (ext.availability as string | undefined) || undefined,
    level: (ext.level as string | undefined) || undefined,
    gender: (ext.gender as string | undefined) || undefined,
    ethnicity: (ext.ethnicity as string | undefined) || undefined,
    customFields,
    confidence,
    enrichmentSource,
    enrichmentConfidence,
    enrichmentTimestamp,
    executiveConfidence: apiExec.executiveConfidence ?? null,
    executiveConfidenceReason: apiExec.executiveConfidenceReason ?? null,
    isEnriched,
  };
}
