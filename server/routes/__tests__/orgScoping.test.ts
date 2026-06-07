// @vitest-environment node
// Proves the org-scoping IDOR fix: cross-org ids are invisible, same-org ids visible.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStorage = vi.hoisted(() => ({
  getCompany: vi.fn(),
  getExecutive: vi.fn(),
  getCareerHistoryExecutiveId: vi.fn(),
  getEducationExecutiveId: vi.fn(),
  getRemunerationExecutiveId: vi.fn(),
}));

vi.mock('../../storage', () => ({ storage: mockStorage }));

import { NotInOrgError, assertCompanyInOrg, assertExecutiveInOrg, assertCareerHistoryInOrg } from '../../auth/orgGuard';

const ORG_A = 'org-a';
const ORG_B = 'org-b';

const companyA = { id: 1, name: 'Acme', orgId: ORG_A };
const execA    = { id: 10, name: 'Alice', companyId: 1, orgId: ORG_A };

beforeEach(() => vi.clearAllMocks());

describe('assertCompanyInOrg', () => {
  it('returns company when orgId matches', async () => {
    mockStorage.getCompany.mockResolvedValue(companyA);
    const result = await assertCompanyInOrg(1, ORG_A);
    expect(result).toEqual(companyA);
    expect(mockStorage.getCompany).toHaveBeenCalledWith(1, ORG_A);
  });

  it('throws NotInOrgError when company belongs to different org', async () => {
    mockStorage.getCompany.mockResolvedValue(undefined);
    await expect(assertCompanyInOrg(1, ORG_B)).rejects.toThrow(NotInOrgError);
    expect(mockStorage.getCompany).toHaveBeenCalledWith(1, ORG_B);
  });

  it('throws NotInOrgError for unknown company id', async () => {
    mockStorage.getCompany.mockResolvedValue(undefined);
    await expect(assertCompanyInOrg(9999, ORG_A)).rejects.toThrow(NotInOrgError);
  });
});

describe('assertExecutiveInOrg', () => {
  it('returns executive when orgId matches', async () => {
    mockStorage.getExecutive.mockResolvedValue(execA);
    const result = await assertExecutiveInOrg(10, ORG_A);
    expect(result).toEqual(execA);
    expect(mockStorage.getExecutive).toHaveBeenCalledWith(10, ORG_A);
  });

  it('throws NotInOrgError for cross-org executive id', async () => {
    mockStorage.getExecutive.mockResolvedValue(undefined);
    await expect(assertExecutiveInOrg(10, ORG_B)).rejects.toThrow(NotInOrgError);
  });
});

describe('assertCareerHistoryInOrg', () => {
  it('resolves parent exec then checks org', async () => {
    mockStorage.getCareerHistoryExecutiveId.mockResolvedValue(10);
    mockStorage.getExecutive.mockResolvedValue(execA);
    await expect(assertCareerHistoryInOrg(42, ORG_A)).resolves.toBeUndefined();
  });

  it('throws NotInOrgError when career row belongs to cross-org executive', async () => {
    mockStorage.getCareerHistoryExecutiveId.mockResolvedValue(10);
    mockStorage.getExecutive.mockResolvedValue(undefined);
    await expect(assertCareerHistoryInOrg(42, ORG_B)).rejects.toThrow(NotInOrgError);
  });

  it('throws NotInOrgError when career row does not exist', async () => {
    mockStorage.getCareerHistoryExecutiveId.mockResolvedValue(undefined);
    await expect(assertCareerHistoryInOrg(9999, ORG_A)).rejects.toThrow(NotInOrgError);
  });
});

describe('storage filter contract', () => {
  it('getCompany always called with orgId as second arg', async () => {
    mockStorage.getCompany.mockResolvedValue(companyA);
    await assertCompanyInOrg(1, ORG_A);
    const [idArg, orgArg] = mockStorage.getCompany.mock.calls[0];
    expect(idArg).toBe(1);
    expect(orgArg).toBe(ORG_A);
  });

  it('getExecutive always called with orgId as second arg', async () => {
    mockStorage.getExecutive.mockResolvedValue(execA);
    await assertExecutiveInOrg(10, ORG_A);
    const [idArg, orgArg] = mockStorage.getExecutive.mock.calls[0];
    expect(idArg).toBe(10);
    expect(orgArg).toBe(ORG_A);
  });
});
