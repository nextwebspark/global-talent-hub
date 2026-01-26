import { create } from 'zustand';
import type { Company as APICompany, Executive as APIExecutive } from './api';

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
  employees: number;
  employeesSource?: string;
  confidence: number;
  description?: string;
  color?: string;
  source?: string;
}

export interface Executive {
  id: string;
  company_id: string;
  name: string;
  title: string;
  source: string;
  profileUrl?: string;
  imageUrl?: string;
  confidence: number;
}

export interface Project {
  id: string;
  name: string;
  search_string: string;
  created_at: Date;
}

interface AppState {
  currentProject: Project | null;
  companies: Company[];
  executives: Executive[];
  selectedCompanyId: string | null;
  searchQuery: string;
  scalingMetric: 'revenue' | 'employees';
  revenueFilter: number;
  
  setProject: (project: Project) => void;
  setCompanies: (companies: Company[]) => void;
  addCompany: (company: Company) => void;
  updateCompany: (id: string, updates: Partial<Company>) => void;
  
  setExecutives: (executives: Executive[]) => void;
  addExecutive: (executive: Executive) => void;
  updateExecutive: (id: string, updates: Partial<Executive>) => void;
  deleteExecutive: (id: string) => void;
  deleteCompany: (id: string) => void;
  
  selectCompany: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setScalingMetric: (metric: 'revenue' | 'employees') => void;
  setRevenueFilter: (value: number) => void;
  
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
    lng >= -180 && lng <= 180
  );
}

export function transformAPICompany(apiCompany: APICompany): Company {
  const lat = safeParseFloat(apiCompany.latitude, 0);
  const lng = safeParseFloat(apiCompany.longitude, 0);
  const revenue = safeParseFloat(apiCompany.revenue, 0);
  const employees = Math.round(safeParseFloat(apiCompany.employees, 0));
  let confidence = Math.round(safeParseFloat((apiCompany as any).confidence, 5));
  confidence = Math.max(1, Math.min(10, confidence));
  
  return {
    id: String(apiCompany.id || '0'),
    name: String(apiCompany.name || 'Unknown Company').trim(),
    industry: String(apiCompany.sector || 'Unknown').trim(),
    hq_city: String(apiCompany.region || 'Unknown').trim(),
    hq_country: String(apiCompany.country || 'Unknown').trim(),
    streetAddress: (apiCompany as any).streetAddress ? String((apiCompany as any).streetAddress).trim() : undefined,
    lat: isValidCoordinate(lat, lng) ? lat : 0,
    lng: isValidCoordinate(lat, lng) ? lng : 0,
    revenue_usd: revenue >= 0 ? revenue : 0,
    revenueSource: String((apiCompany as any).revenueSource || 'Unknown').trim(),
    employees: employees >= 0 ? employees : 0,
    employeesSource: String((apiCompany as any).employeesSource || 'Unknown').trim(),
    confidence,
    color: apiCompany.color || '#1e3a8a',
    source: String((apiCompany as any).source || 'Unknown').trim(),
  };
}

export function transformAPIExecutive(apiExec: APIExecutive, companyId: string): Executive {
  let confidence = Math.round(safeParseFloat((apiExec as any).confidence, 5));
  confidence = Math.max(1, Math.min(10, confidence));
  
  return {
    id: String(apiExec.id || '0'),
    company_id: String(companyId || '0'),
    name: String(apiExec.name || 'Unknown').trim(),
    title: String(apiExec.title || 'Unknown').trim(),
    source: String((apiExec as any).source || 'Unknown').trim(),
    profileUrl: (apiExec as any).profileUrl || (apiExec as any).linkedin || undefined,
    imageUrl: (apiExec as any).imageUrl || undefined,
    confidence,
  };
}

export const useAppStore = create<AppState>((set) => ({
  currentProject: null,
  companies: [],
  executives: [],
  selectedCompanyId: null,
  searchQuery: '',
  scalingMetric: 'revenue',
  revenueFilter: 0,

  setProject: (project) => set({ currentProject: project }),
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

  selectCompany: (id) => set({ selectedCompanyId: id }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setScalingMetric: (metric) => set({ scalingMetric: metric }),
  setRevenueFilter: (value) => set({ revenueFilter: value }),

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
    searchQuery: '',
    scalingMetric: 'revenue',
    revenueFilter: 0
  })
}));
