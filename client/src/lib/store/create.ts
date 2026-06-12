import { create } from 'zustand';
import type { Company as APICompany } from '../api';
import {
  type SearchSessionState,
  type SearchSessionActions,
  type Company,
  type Executive,
  type Project,
  type ExecutiveDetails,
  type DiscoveryStatus,
  type StreamCompany,
} from './types';
import { transformAPICompany, transformAPIExecutive } from './transforms';

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
    if (updates.sectorCategory !== undefined) dbUpdates.sectorCategory = updates.sectorCategory;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    
    if (Object.keys(dbUpdates).length > 0) {
      const res = await fetch(`/api/companies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dbUpdates),
      });
      if (res.ok && dbUpdates.country && !dbUpdates.latitude) {
        const apiCompany = await res.json();
        const updated = transformAPICompany(apiCompany);
        useAppStore.setState((state) => ({
          companies: state.companies.map((c) => c.id === id ? { ...c, lat: updated.lat, lng: updated.lng, hq_country: updated.hq_country } : c)
        }));
      }
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
    if (updates.remunerationNotes !== undefined) dbUpdates.remunerationNotes = updates.remunerationNotes;
    if (updates.availability !== undefined) dbUpdates.availability = updates.availability;
    if (updates.level !== undefined) dbUpdates.level = updates.level;
    if (updates.gender !== undefined) dbUpdates.gender = updates.gender;
    if (updates.ethnicity !== undefined) dbUpdates.ethnicity = updates.ethnicity;
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

interface AppState extends SearchSessionState, SearchSessionActions {
  // Global UI: command palette (shared across all screens) + dashboard active view
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  dashboardView: 'map' | 'table' | 'dashboard';
  setDashboardView: (view: 'map' | 'table' | 'dashboard') => void;

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
  showAllSatellites: boolean;
  satelliteHierarchies: Record<string, Record<string, string>>;
  satelliteOrders: Record<string, string[]>;
  tableConfig: Record<string, any> | null;
  mapPositions: Record<string, any>;
  
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
  toggleAllSatellites: () => void;
  setSatelliteHierarchy: (companyId: string, hierarchy: Record<string, string>) => void;
  setSatelliteOrder: (companyId: string, order: string[]) => void;
  resetVisibility: () => void;
  setTableConfig: (config: Record<string, any> | null) => void;
  setMapPositions: (positions: Record<string, any>) => void;
  updateMapPosition: (id: string, position: any) => void;
  
  loadFromAPI: (apiCompanies: APICompany[], satelliteHierarchies?: Record<string, Record<string, string>>, tableConfig?: Record<string, any> | null, mapPositions?: Record<string, any>, satelliteOrders?: Record<string, string[]>) => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  // ─── Search Session State ───────────────────────────────────────────────────
  searchPhase: 'input',
  searchSessionId: null,
  searchIntent: null,
  searchActivities: [],
  searchCompanies: [],
  pendingCompanyNames: [],
  searchQueryId: null,
  selectedSearchCompanyIds: new Set<number>(),
  searchRefinementHistory: [],
  searchPdContent: null,
  searchPdConfidential: false,
  isSearchStreaming: false,
  isSearchRefining: false,

  setSearchPhase: (phase) => set({ searchPhase: phase }),
  setSearchSessionId: (id) => set({ searchSessionId: id }),
  setSearchIntent: (intent) => set({ searchIntent: intent }),
  addSearchActivity: (item) => set((state) => ({
    searchActivities: [...state.searchActivities.slice(-150), item],
  })),
  addPendingCompanyName: (name) => set((state) => ({
    pendingCompanyNames: [...state.pendingCompanyNames, name],
  })),
  removePendingCompanyName: (name) => set((state) => ({
    pendingCompanyNames: state.pendingCompanyNames.filter(n => n !== name),
  })),
  clearPendingCompanyNames: () => set({ pendingCompanyNames: [] }),
  setSearchCompanies: (companies) => set({
    searchCompanies: companies,
    selectedSearchCompanyIds: new Set(companies.filter(c => c.accepted).map(c => c.id)),
    pendingCompanyNames: [],
  }),
  addSearchCompany: (company) => set((state) => {
    if (state.searchCompanies.some(c => c.id === company.id)) return {};
    // Remove matching pending skeleton when enriched company arrives
    const pendingCompanyNames = state.pendingCompanyNames.filter(
      n => n.toLowerCase() !== company.name.toLowerCase()
    );
    const selectedSearchCompanyIds = company.accepted
      ? new Set([...state.selectedSearchCompanyIds, company.id])
      : state.selectedSearchCompanyIds;
    return { searchCompanies: [...state.searchCompanies, company], pendingCompanyNames, selectedSearchCompanyIds };
  }),
  addExecutiveToCompany: (companyId, executive) => set((state) => ({
    searchCompanies: state.searchCompanies.map(c => {
      if (c.id !== companyId) return c;
      const existing = c.executives || [];
      if (existing.some(e => e.name === executive.name)) return c;
      return { ...c, executives: [...existing, executive] };
    }),
  })),
  acceptSearchCompany: (id) => set((state) => ({
    searchCompanies: state.searchCompanies.map(c => c.id === id ? { ...c, accepted: true, rejected: false } : c),
    selectedSearchCompanyIds: new Set(Array.from(state.selectedSearchCompanyIds).concat(id)),
  })),
  rejectSearchCompany: (id) => set((state) => {
    const next = new Set(Array.from(state.selectedSearchCompanyIds));
    next.delete(id);
    return {
      searchCompanies: state.searchCompanies.map(c => c.id === id ? { ...c, rejected: true, accepted: false } : c),
      selectedSearchCompanyIds: next,
    };
  }),
  addManualCompany: (data) => set((state) => {
    const id = -(Date.now());
    const company: StreamCompany = {
      id,
      name: data.name,
      sector: data.sector || null,
      country: null,
      geography: null,
      revenue: data.revenueBand || null,
      employees: null,
      website: null,
      summary: null,
      latitude: null,
      longitude: null,
      relevanceType: 'Direct',
      relevanceRationale: 'Manually added',
      confidenceScore: 1,
      isUserAccepted: true,
      isUserRejected: false,
      accepted: true,
      rejected: false,
    };
    return {
      searchCompanies: [...state.searchCompanies, company],
      selectedSearchCompanyIds: new Set([...state.selectedSearchCompanyIds, id]),
    };
  }),
  setSearchQueryId: (id) => set({ searchQueryId: id }),
  setIsSearchStreaming: (v) => set({ isSearchStreaming: v }),
  setIsSearchRefining: (v) => set({ isSearchRefining: v }),
  addSearchRefinement: (entry) => set((state) => ({
    searchRefinementHistory: [...state.searchRefinementHistory, entry],
  })),
  setSearchPdContent: (content, confidential = false) => set({ searchPdContent: content, searchPdConfidential: confidential }),
  resetSearchSession: () => set({
    searchPhase: 'input',
    searchSessionId: null,
    searchIntent: null,
    searchActivities: [],
    searchCompanies: [],
    pendingCompanyNames: [],
    searchQueryId: null,
    selectedSearchCompanyIds: new Set<number>(),
    searchRefinementHistory: [],
    searchPdContent: null,
    searchPdConfidential: false,
    isSearchStreaming: false,
    isSearchRefining: false,
  }),

  // ─── Global UI ──────────────────────────────────────────────────────────────
  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  dashboardView: 'map',
  setDashboardView: (view) => set({ dashboardView: view }),

  // ─── Legacy State ───────────────────────────────────────────────────────────
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
  showAllSatellites: false,
  satelliteHierarchies: {},
  satelliteOrders: {},
  tableConfig: null,
  mapPositions: {},

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
  
  toggleAllSatellites: () => set((state) => ({ showAllSatellites: !state.showAllSatellites })),

  setSatelliteHierarchy: (companyId, hierarchy) => set((state) => ({
    satelliteHierarchies: { ...state.satelliteHierarchies, [companyId]: hierarchy }
  })),

  setSatelliteOrder: (companyId, order) => set((state) => ({
    satelliteOrders: { ...state.satelliteOrders, [companyId]: order }
  })),

  setTableConfig: (config) => set({ tableConfig: config }),

  setMapPositions: (positions) => set({ mapPositions: positions }),
  updateMapPosition: (id, position) => set((state) => {
    if (position === null) {
      const next = { ...state.mapPositions };
      delete next[id];
      return { mapPositions: next };
    }
    return { mapPositions: { ...state.mapPositions, [id]: position } };
  }),

  resetVisibility: () => set({
    hiddenCountries: new Set<string>(),
    hiddenCompanies: new Set<string>()
  }),

  loadFromAPI: (apiCompanies: APICompany[], savedHierarchies?: Record<string, Record<string, string>>, savedTableConfig?: Record<string, any> | null, savedMapPositions?: Record<string, any>, savedOrders?: Record<string, string[]>) => {
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

    const updates: Partial<AppState> = { companies, executives };
    if (savedHierarchies !== undefined) {
      updates.satelliteHierarchies = savedHierarchies;
    }
    if (savedTableConfig !== undefined) {
      updates.tableConfig = savedTableConfig ?? null;
    }
    if (savedMapPositions !== undefined) {
      const raw = savedMapPositions ?? {};
      const companyIds = new Set(companies.map(c => c.id));
      const execIds = new Set(executives.map(e => e.id));
      const pruned: Record<string, any> = {};
      for (const [key, val] of Object.entries(raw)) {
        if (key.startsWith('exec:')) {
          if (execIds.has(key.slice(5))) pruned[key] = val;
        } else if (key.startsWith('company:')) {
          if (companyIds.has(key.slice(8))) pruned[key] = val;
        } else {
          pruned[key] = val;
        }
      }
      updates.mapPositions = pruned;
    }
    if (savedOrders !== undefined) {
      updates.satelliteOrders = savedOrders ?? {};
    }
    set(updates);
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
    hiddenCompanies: new Set<string>(),
    showAllSatellites: false,
    satelliteHierarchies: {},
    satelliteOrders: {},
    tableConfig: null,
    mapPositions: {}
  })
}));

// Expose store to window in dev/test for Playwright state seeding
if (import.meta.env.DEV) {
  (window as any).__zustandStore = useAppStore;
}
