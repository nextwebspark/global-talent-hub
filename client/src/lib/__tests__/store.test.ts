import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore, type StreamCompany } from '../store';

function makeStreamCompany(overrides: Partial<StreamCompany> = {}): StreamCompany {
  return {
    id: 1,
    name: 'Acme Corp',
    sector: 'FMCG',
    country: 'UAE',
    geography: 'GCC',
    revenue: null,
    employees: null,
    website: null,
    summary: null,
    latitude: null,
    longitude: null,
    relevanceType: 'Direct',
    relevanceRationale: '',
    confidenceScore: 0.9,
    isUserAccepted: false,
    isUserRejected: false,
    accepted: false,
    rejected: false,
    ...overrides,
  };
}

describe('useAppStore — search session', () => {
  beforeEach(() => {
    useAppStore.getState().resetSearchSession();
  });

  it('addPendingCompanyName appends a skeleton name', () => {
    useAppStore.getState().addPendingCompanyName('Acme Corp');
    expect(useAppStore.getState().pendingCompanyNames).toEqual(['Acme Corp']);
  });

  it('addSearchCompany removes matching pending skeleton case-insensitively', () => {
    const s = useAppStore.getState();
    s.addPendingCompanyName('acme corp');
    s.addPendingCompanyName('Other Co');
    s.addSearchCompany(makeStreamCompany({ name: 'Acme Corp' }));
    const state = useAppStore.getState();
    expect(state.searchCompanies).toHaveLength(1);
    expect(state.pendingCompanyNames).toEqual(['Other Co']);
  });

  it('addSearchCompany is idempotent on duplicate id', () => {
    const s = useAppStore.getState();
    s.addSearchCompany(makeStreamCompany({ id: 7 }));
    s.addSearchCompany(makeStreamCompany({ id: 7, name: 'Different Name' }));
    expect(useAppStore.getState().searchCompanies).toHaveLength(1);
  });

  it('acceptSearchCompany sets accepted=true and clears rejected', () => {
    const s = useAppStore.getState();
    s.addSearchCompany(makeStreamCompany({ id: 3, rejected: true }));
    s.acceptSearchCompany(3);
    const c = useAppStore.getState().searchCompanies.find(x => x.id === 3)!;
    expect(c.accepted).toBe(true);
    expect(c.rejected).toBe(false);
    expect(useAppStore.getState().selectedSearchCompanyIds.has(3)).toBe(true);
  });

  it('rejectSearchCompany clears accepted + removes id from selection set', () => {
    const s = useAppStore.getState();
    s.addSearchCompany(makeStreamCompany({ id: 4 }));
    s.acceptSearchCompany(4);
    s.rejectSearchCompany(4);
    const c = useAppStore.getState().searchCompanies.find(x => x.id === 4)!;
    expect(c.rejected).toBe(true);
    expect(c.accepted).toBe(false);
    expect(useAppStore.getState().selectedSearchCompanyIds.has(4)).toBe(false);
  });

  it('resetSearchSession clears phase, companies, activities, pending names', () => {
    const s = useAppStore.getState();
    s.setSearchPhase('streaming');
    s.addSearchCompany(makeStreamCompany());
    s.addPendingCompanyName('Foo');
    s.addSearchActivity({ type: 'status', message: 'x', timestamp: new Date().toISOString() } as any);
    s.resetSearchSession();
    const state = useAppStore.getState();
    expect(state.searchPhase).toBe('input');
    expect(state.searchCompanies).toHaveLength(0);
    expect(state.pendingCompanyNames).toHaveLength(0);
    expect(state.searchActivities).toHaveLength(0);
    expect(state.searchSessionId).toBeNull();
  });
});
