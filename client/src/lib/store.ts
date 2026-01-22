import { create } from 'zustand';
import type { Company as APICompany, Executive as APIExecutive } from './api';

export interface Company {
  id: string;
  name: string;
  industry: string;
  hq_city: string;
  hq_country: string;
  lat: number;
  lng: number;
  revenue_usd: number;
  employees: number;
  confidence: 'High' | 'Medium' | 'Low';
  description?: string;
  color?: string;
  source?: string;
}

export interface Executive {
  id: string;
  company_id: string;
  name: string;
  title: string;
  source: 'Public' | 'Clockwork' | 'Manual';
  confidence: 'High' | 'Medium' | 'Low';
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
  
  selectCompany: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setScalingMetric: (metric: 'revenue' | 'employees') => void;
  setRevenueFilter: (value: number) => void;
  
  loadFromAPI: (apiCompanies: APICompany[]) => void;
  reset: () => void;
}

export function transformAPICompany(apiCompany: APICompany): Company {
  return {
    id: String(apiCompany.id),
    name: apiCompany.name,
    industry: apiCompany.sector || 'Unknown',
    hq_city: apiCompany.region || 'Unknown',
    hq_country: apiCompany.country || 'Unknown',
    lat: parseFloat(apiCompany.latitude),
    lng: parseFloat(apiCompany.longitude),
    revenue_usd: parseFloat(apiCompany.revenue || '0'),
    employees: apiCompany.employees || 0,
    confidence: 'High',
    color: apiCompany.color || '#1e3a8a',
    source: 'ChatGPT Knowledge Base',
  };
}

export function transformAPIExecutive(apiExec: APIExecutive, companyId: string): Executive {
  return {
    id: String(apiExec.id),
    company_id: companyId,
    name: apiExec.name,
    title: apiExec.title,
    source: 'Public',
    confidence: 'High',
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
  updateCompany: (id, updates) => set((state) => ({
    companies: state.companies.map((c) => c.id === id ? { ...c, ...updates } : c)
  })),

  setExecutives: (executives) => set({ executives }),
  addExecutive: (executive) => set((state) => ({ executives: [...state.executives, executive] })),
  updateExecutive: (id, updates) => set((state) => ({
    executives: state.executives.map((e) => e.id === id ? { ...e, ...updates } : e)
  })),

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
