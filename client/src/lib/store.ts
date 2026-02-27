import { create } from 'zustand';
import type { Company as APICompany, Executive as APIExecutive } from './api';
import { normalizeCountryName } from './countries';

// Helper to persist company updates to the database
async function persistCompanyUpdate(id: string, updates: Partial<any>): Promise<void> {
  try {
    const dbUpdates: Record<string, any> = {};
    if (updates.revenue_usd !== undefined) dbUpdates.revenue = String(updates.revenue_usd);
    if (updates.employees !== undefined) dbUpdates.employees = updates.employees;
    if (updates.lat !== undefined) dbUpdates.latitude = String(updates.lat);
    if (updates.lng !== undefined) dbUpdates.longitude = String(updates.lng);
    if (updates.color !== undefined) dbUpdates.color = updates.color;
    if (updates.streetAddress !== undefined) dbUpdates.streetAddress = updates.streetAddress;
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.hq_country !== undefined) dbUpdates.country = updates.hq_country;
    if (updates.industry !== undefined) dbUpdates.sector = updates.industry;
    if (updates.hq_city !== undefined) dbUpdates.region = updates.hq_city;
    
    if (Object.keys(dbUpdates).length > 0) {
      await fetch(`/api/companies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dbUpdates),
      });
    }
  } catch (error) {
    console.error('Failed to persist company update:', error);
  }
}

// Helper to persist executive updates to the database
async function persistExecutiveUpdate(id: string, updates: Partial<any>): Promise<void> {
  try {
    const dbUpdates: Record<string, any> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.email !== undefined) dbUpdates.email = updates.email;
    if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
    if (updates.linkedin !== undefined) dbUpdates.linkedin = updates.linkedin;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
    if (updates.careerSummary !== undefined) dbUpdates.careerSummary = updates.careerSummary;
    if (updates.remunerationNotes !== undefined) dbUpdates.remunerationNotes = updates.remunerationNotes;
    if (updates.availability !== undefined) dbUpdates.availability = updates.availability;
    if (updates.level !== undefined) dbUpdates.level = updates.level;
    if (updates.customFields !== undefined) dbUpdates.customFields = updates.customFields;
    
    if (Object.keys(dbUpdates).length > 0) {
      await fetch(`/api/executives/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dbUpdates),
      });
    }
  } catch (error) {
    console.error('Failed to persist executive update:', error);
  }
}

// Helper to delete executive from the database
async function persistExecutiveDelete(id: string): Promise<void> {
  try {
    await fetch(`/api/executives/${id}`, { method: 'DELETE' });
  } catch (error) {
    console.error('Failed to delete executive:', error);
  }
}

// Helper to delete company from the database
async function persistCompanyDelete(id: string): Promise<void> {
  try {
    await fetch(`/api/companies/${id}`, { method: 'DELETE' });
  } catch (error) {
    console.error('Failed to delete company:', error);
  }
}

export interface Company {
  id: string;
  name: string;
  industry: string;
  hq_city: string;
  hq_country: string;
  streetAddress?: string;
  lat: number;
  lng: number;
  revenue_usd: number;
  revenueSource?: string;
  revenueSourceUrl?: string;
  revenueConfidence?: number;
  revenueCurrency?: string;
  revenueFiscalYear?: number;
  employees: number;
  employeesSource?: string;
  employeesSourceUrl?: string;
  employeesConfidence?: number;
  geographicFootprint?: number;
  customerModel?: string;
  ownershipType?: string;
  coreActivity?: string;
  operatingModel?: string;
  revenueDrivers?: string;
  summary?: string;
  lastVerifiedYear?: number;
  confidence: number;
  description?: string;
  color?: string;
  source?: string;
  businessType?: string;
  relevanceReason?: string;
}

export interface Executive {
  id: string;
  company_id: string;
  name: string;
  title: string;
  source: string;
  profileUrl?: string;
  imageUrl?: string;
  linkedin?: string;
  notes?: string;
  email?: string;
  phone?: string;
  careerSummary?: string;
  remunerationNotes?: string;
  availability?: string;
  level?: string;
  customFields?: Record<string, string>;
  confidence: number;
  enrichmentSource?: string;
  enrichmentConfidence?: number;
  enrichmentTimestamp?: string;
  isEnriched: boolean;
}

export interface Project {
  id: string;
  name: string;
  search_string: string;
  created_at: Date;
  clockworkProjectId?: string | null;
}

export interface ExecutiveDetails {
  executive: {
    id: number;
    name: string;
    title: string;
    companyId: number;
    confidence: number | null;
    linkedin: string | null;
    profileUrl: string | null;
    imageUrl: string | null;
    email: string | null;
    phone: string | null;
    careerSummary: string | null;
    notes: string | null;
    remunerationNotes: string | null;
    availability: string | null;
    level: string | null;
    sourceText: string | null;
    enrichmentSource: string | null;
    enrichmentConfidence: number | null;
    enrichmentTimestamp: string | null;
    isEnriched: boolean;
  };
  company: {
    id: number;
    name: string;
    country: string | null;
    revenue: string | null;
    employees: number | null;
  } | null;
  careerHistory: Array<{
    id: number;
    company: string;
    title: string;
    startDate: string | null;
    endDate: string | null;
    description: string | null;
    sortOrder: number | null;
  }>;
  education: Array<{
    id: number;
    institution: string;
    degree: string | null;
    fieldOfStudy: string | null;
    graduationYear: string | null;
  }>;
  remuneration: Array<{
    id: number;
    baseSalary: string | null;
    bonus: string | null;
    longTermIncentives: string | null;
    currency: string | null;
    year: string | null;
    notes: string | null;
  }>;
  notes: { id: number; content: string } | null;
}

export type DiscoveryStatus = 'complete' | 'partial' | 'degraded';

interface AppState {
  currentProject: Project | null;
  companies: Company[];
  executives: Executive[];
  selectedCompanyId: string | null;
  selectedExecutiveId: string | null;
  executiveDetails: ExecutiveDetails | null;
  isLoadingExecutiveDetails: boolean;
  panelView: 'company' | 'executive';
  searchQuery: string;
  scalingMetric: 'revenue' | 'employees';
  revenueFilterRange: [number, number]; // [min, max] in 0-100 scale
  employeeFilterRange: [number, number]; // [min, max] in 0-100 scale
  
  // Discovery status tracking
  discoveryStatus: DiscoveryStatus | null;
  degradationReasons: string[] | undefined;
  
  // Map visibility state (UI-only, does not persist to database)
  hiddenCountries: Set<string>;
  hiddenCompanies: Set<string>;
  
  setProject: (project: Project) => void;
  renameProject: (name: string) => void;
  setCompanies: (companies: Company[]) => void;
  addCompany: (company: Company) => void;
  updateCompany: (id: string, updates: Partial<Company>) => void;
  
  setExecutives: (executives: Executive[]) => void;
  addExecutive: (executive: Executive) => void;
  updateExecutive: (id: string, updates: Partial<Executive>) => void;
  deleteExecutive: (id: string) => void;
  deleteCompany: (id: string) => void;
  
  selectCompany: (id: string | null) => void;
  selectExecutive: (id: string | null, companyId?: string) => void;
  setExecutiveDetails: (details: ExecutiveDetails | null) => void;
  setLoadingExecutiveDetails: (loading: boolean) => void;
  setPanelView: (view: 'company' | 'executive') => void;
  setSearchQuery: (query: string) => void;
  setScalingMetric: (metric: 'revenue' | 'employees') => void;
  setRevenueFilterRange: (value: [number, number]) => void;
  setEmployeeFilterRange: (value: [number, number]) => void;
  
  // Discovery status actions
  setDiscoveryStatus: (status: DiscoveryStatus | undefined, reasons?: string[]) => void;
  clearDiscoveryStatus: () => void;
  
  // Map visibility actions
  toggleCountryVisibility: (countryName: string) => void;
  toggleCompanyVisibility: (companyId: string) => void;
  resetVisibility: () => void;
  
  loadFromAPI: (apiCompanies: APICompany[]) => void;
  reset: () => void;
}

// Safe number parsing with fallback
function safeParseFloat(value: any, defaultValue: number = 0): number {
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

// Validate coordinates - returns true if valid, false otherwise
function isValidCoordinate(lat: number, lng: number): boolean {
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
  let confidence = Math.round(safeParseFloat((apiCompany as any).confidence, 5));
  confidence = Math.max(1, Math.min(10, confidence));
  const ext = apiCompany as any;
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
    industry: String(apiCompany.sector || 'Unknown').trim(),
    hq_city: String(apiCompany.region || 'Unknown').trim(),
    hq_country: country,
    streetAddress: ext.streetAddress ? String(ext.streetAddress).trim() : undefined,
    lat: isValidCoordinate(lat, lng) ? lat : 0,
    lng: isValidCoordinate(lat, lng) ? lng : 0,
    revenue_usd: revenue >= 0 ? revenue : 0,
    revenueSource: String(ext.revenueSource || 'Unknown').trim(),
    revenueSourceUrl: ext.revenueSourceUrl || undefined,
    revenueConfidence: ext.revenueConfidence ?? undefined,
    revenueCurrency: ext.revenueCurrency || undefined,
    revenueFiscalYear: ext.revenueFiscalYear ?? undefined,
    employees: employees >= 0 ? employees : 0,
    employeesSource: String(ext.employeesSource || 'Unknown').trim(),
    employeesSourceUrl: ext.employeesSourceUrl || undefined,
    employeesConfidence: ext.employeesConfidence ?? undefined,
    geographicFootprint: ext.geographicFootprint ?? undefined,
    customerModel: ext.customerModel ? String(ext.customerModel).trim() : undefined,
    ownershipType: ext.ownershipType ? String(ext.ownershipType).trim() : undefined,
    coreActivity: ext.coreActivity ? String(ext.coreActivity).trim() : undefined,
    operatingModel: ext.operatingModel ? String(ext.operatingModel).trim() : undefined,
    revenueDrivers: ext.revenueDrivers ? String(ext.revenueDrivers).trim() : undefined,
    summary: ext.summary ? String(ext.summary).trim() : undefined,
    lastVerifiedYear: ext.lastVerifiedYear ?? undefined,
    businessType: ext.businessType ? String(ext.businessType).trim() : undefined,
    relevanceReason: ext.relevanceReason ? String(ext.relevanceReason).trim() : undefined,
    confidence,
    color: apiCompany.color || '#1e3a8a',
    source: String(ext.source || 'Unknown').trim(),
  };
}

export function transformAPIExecutive(apiExec: APIExecutive, companyId: string): Executive {
  let confidence = Math.round(safeParseFloat((apiExec as any).confidence, 5));
  confidence = Math.max(1, Math.min(10, confidence));
  
  const enrichmentSource = (apiExec as any).enrichmentSource || undefined;
  const enrichmentConfidence = (apiExec as any).enrichmentConfidence || undefined;
  const enrichmentTimestamp = (apiExec as any).enrichmentTimestamp || undefined;
  const isEnriched = Boolean(enrichmentSource || (apiExec as any).clockworkId);
  
  const rawCustomFields = (apiExec as any).customFields;
  let customFields: Record<string, string> | undefined;
  if (rawCustomFields && typeof rawCustomFields === 'object' && Object.keys(rawCustomFields).length > 0) {
    customFields = rawCustomFields;
  }

  return {
    id: String(apiExec.id || '0'),
    company_id: String(companyId || '0'),
    name: String(apiExec.name || 'Unknown').trim(),
    title: String(apiExec.title || 'Unknown').trim(),
    source: String((apiExec as any).source || 'Unknown').trim(),
    profileUrl: (apiExec as any).profileUrl || (apiExec as any).linkedin || undefined,
    imageUrl: (apiExec as any).imageUrl || undefined,
    linkedin: (apiExec as any).linkedin || undefined,
    notes: (apiExec as any).notes || undefined,
    email: (apiExec as any).email || undefined,
    phone: (apiExec as any).phone || undefined,
    careerSummary: (apiExec as any).careerSummary || undefined,
    remunerationNotes: (apiExec as any).remunerationNotes || undefined,
    availability: (apiExec as any).availability || undefined,
    level: (apiExec as any).level || undefined,
    customFields,
    confidence,
    enrichmentSource,
    enrichmentConfidence,
    enrichmentTimestamp,
    isEnriched,
  };
}

export const useAppStore = create<AppState>((set) => ({
  currentProject: null,
  companies: [],
  executives: [],
  selectedCompanyId: null,
  selectedExecutiveId: null,
  executiveDetails: null,
  isLoadingExecutiveDetails: false,
  panelView: 'company',
  searchQuery: '',
  scalingMetric: 'revenue',
  revenueFilterRange: [0, 100],
  employeeFilterRange: [0, 100],
  discoveryStatus: null,
  degradationReasons: undefined,
  hiddenCountries: new Set<string>(),
  hiddenCompanies: new Set<string>(),

  setProject: (project) => set({ currentProject: project }),
  renameProject: (name) => set((state) => ({
    currentProject: state.currentProject ? { ...state.currentProject, name } : null
  })),
  setCompanies: (companies) => set({ companies }),
  addCompany: (company) => set((state) => ({ companies: [...state.companies, company] })),
  updateCompany: (id, updates) => {
    set((state) => ({
      companies: state.companies.map((c) => c.id === id ? { ...c, ...updates } : c)
    }));
    persistCompanyUpdate(id, updates);
  },

  setExecutives: (executives) => set({ executives }),
  addExecutive: (executive) => set((state) => ({ executives: [...state.executives, executive] })),
  updateExecutive: (id, updates) => {
    set((state) => ({
      executives: state.executives.map((e) => e.id === id ? { ...e, ...updates } : e)
    }));
    persistExecutiveUpdate(id, updates);
  },
  deleteExecutive: (id) => {
    set((state) => ({
      executives: state.executives.filter((e) => e.id !== id)
    }));
    persistExecutiveDelete(id);
  },
  deleteCompany: (id) => {
    set((state) => ({
      companies: state.companies.filter((c) => c.id !== id),
      executives: state.executives.filter((e) => e.company_id !== id)
    }));
    persistCompanyDelete(id);
  },

  selectCompany: (id) => set({ selectedCompanyId: id, panelView: 'company', selectedExecutiveId: null, executiveDetails: null }),
  selectExecutive: (id, companyId) => set((state) => ({ selectedExecutiveId: id, panelView: 'executive', selectedCompanyId: companyId || state.selectedCompanyId })),
  setExecutiveDetails: (details) => set({ executiveDetails: details }),
  setLoadingExecutiveDetails: (loading) => set({ isLoadingExecutiveDetails: loading }),
  setPanelView: (view) => set({ panelView: view }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setScalingMetric: (metric) => set({ scalingMetric: metric }),
  setRevenueFilterRange: (value) => set({ revenueFilterRange: value }),
  setEmployeeFilterRange: (value) => set({ employeeFilterRange: value }),
  
  // Discovery status actions
  setDiscoveryStatus: (status, reasons) => set({ 
    discoveryStatus: status || null, 
    degradationReasons: reasons 
  }),
  clearDiscoveryStatus: () => set({ 
    discoveryStatus: null, 
    degradationReasons: undefined 
  }),

  // Map visibility controls
  toggleCountryVisibility: (countryName) => set((state) => {
    const next = new Set(state.hiddenCountries);
    if (next.has(countryName)) {
      next.delete(countryName);
    } else {
      next.add(countryName);
    }
    return { hiddenCountries: next };
  }),
  
  toggleCompanyVisibility: (companyId) => set((state) => {
    const next = new Set(state.hiddenCompanies);
    if (next.has(companyId)) {
      next.delete(companyId);
    } else {
      next.add(companyId);
    }
    return { hiddenCompanies: next };
  }),
  
  resetVisibility: () => set({
    hiddenCountries: new Set<string>(),
    hiddenCompanies: new Set<string>()
  }),

  loadFromAPI: (apiCompanies: APICompany[]) => {
    const companies: Company[] = [];
    const executives: Executive[] = [];

    apiCompanies.forEach((apiCompany) => {
      const company = transformAPICompany(apiCompany);
      companies.push(company);

      if (apiCompany.executives) {
        apiCompany.executives.forEach((apiExec) => {
          executives.push(transformAPIExecutive(apiExec, String(apiCompany.id)));
        });
      }
    });

    set({ companies, executives });
  },

  reset: () => set({
    currentProject: null,
    companies: [],
    executives: [],
    selectedCompanyId: null,
    selectedExecutiveId: null,
    executiveDetails: null,
    isLoadingExecutiveDetails: false,
    panelView: 'company',
    searchQuery: '',
    scalingMetric: 'revenue',
    revenueFilterRange: [0, 100],
    employeeFilterRange: [0, 100],
    discoveryStatus: null,
    degradationReasons: undefined,
    hiddenCountries: new Set<string>(),
    hiddenCompanies: new Set<string>()
  })
}));
