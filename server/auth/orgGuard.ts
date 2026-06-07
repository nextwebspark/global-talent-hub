import { storage } from "../storage";
import type { Company, Executive } from "@shared/schema";

// Thrown when an entity exists but is outside the caller's org (or doesn't
// exist). Routes map this to a 404 — never leak which case it was.
export class NotInOrgError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotInOrgError";
  }
}

// getCompany/getExecutive are already org-filtered, so a cross-org id returns
// undefined → we raise NotInOrgError. Returns the entity for the caller to reuse.
export async function assertCompanyInOrg(companyId: number, orgId: string): Promise<Company> {
  const company = await storage.getCompany(companyId, orgId);
  if (!company) throw new NotInOrgError("Company not found");
  return company;
}

export async function assertExecutiveInOrg(executiveId: number, orgId: string): Promise<Executive> {
  const exec = await storage.getExecutive(executiveId, orgId);
  if (!exec) throw new NotInOrgError("Executive not found");
  return exec;
}

// Standalone child routes (career-history/education/remuneration by child id)
// resolve the parent executive id, then guard via assertExecutiveInOrg.
export async function assertCareerHistoryInOrg(id: number, orgId: string): Promise<void> {
  const executiveId = await storage.getCareerHistoryExecutiveId(id);
  if (executiveId === undefined) throw new NotInOrgError("Career history not found");
  await assertExecutiveInOrg(executiveId, orgId);
}

export async function assertEducationInOrg(id: number, orgId: string): Promise<void> {
  const executiveId = await storage.getEducationExecutiveId(id);
  if (executiveId === undefined) throw new NotInOrgError("Education not found");
  await assertExecutiveInOrg(executiveId, orgId);
}

export async function assertRemunerationInOrg(id: number, orgId: string): Promise<void> {
  const executiveId = await storage.getRemunerationExecutiveId(id);
  if (executiveId === undefined) throw new NotInOrgError("Remuneration not found");
  await assertExecutiveInOrg(executiveId, orgId);
}
