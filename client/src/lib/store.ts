import { create } from 'zustand';

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
  
  setProject: (project: Project) => void;
  setCompanies: (companies: Company[]) => void;
  addCompany: (company: Company) => void;
  updateCompany: (id: string, updates: Partial<Company>) => void;
  
  setExecutives: (executives: Executive[]) => void;
  addExecutive: (executive: Executive) => void;
  
  selectCompany: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentProject: null,
  companies: [],
  executives: [],
  selectedCompanyId: null,
  searchQuery: '',

  setProject: (project) => set({ currentProject: project }),
  setCompanies: (companies) => set({ companies }),
  addCompany: (company) => set((state) => ({ companies: [...state.companies, company] })),
  updateCompany: (id, updates) => set((state) => ({
    companies: state.companies.map((c) => c.id === id ? { ...c, ...updates } : c)
  })),

  setExecutives: (executives) => set({ executives }),
  addExecutive: (executive) => set((state) => ({ executives: [...state.executives, executive] })),

  selectCompany: (id) => set({ selectedCompanyId: id }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  reset: () => set({
    currentProject: null,
    companies: [],
    executives: [],
    selectedCompanyId: null,
    searchQuery: ''
  })
}));
