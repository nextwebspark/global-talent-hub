import type { Express } from "express";
import type { Server } from "http";
import { upload, pdUpload } from "./shared/upload";
import { registerConfig } from "./registrations/config";
import { registerCompanies } from "./registrations/companies";
import { registerExecutives } from "./registrations/executives";
import { registerCareer } from "./registrations/career";
import { registerEducation } from "./registrations/education";
import { registerRemuneration } from "./registrations/remuneration";
import { registerNotes } from "./registrations/notes";
import { registerCompanyEnrichDeepseek } from "./registrations/companyEnrichDeepseek";
import { registerSearchQueries } from "./registrations/searchQueries";
import { registerSearch } from "./registrations/search";
import { registerClockwork } from "./registrations/clockwork";
import { registerEnrichment } from "./registrations/enrichment";
import { registerCompanyEnrichMultipass } from "./registrations/companyEnrichMultipass";
import { registerSearchEnrich } from "./registrations/searchEnrich";
import { registerImportProject } from "./registrations/importProject";
import { registerDashboard } from "./registrations/dashboard";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  registerConfig(app);
  registerCompanies(app);
  registerExecutives(app, { upload });
  registerCareer(app);
  registerEducation(app);
  registerRemuneration(app);
  registerNotes(app);
  registerCompanyEnrichDeepseek(app);
  registerSearchQueries(app);
  registerSearch(app, { pdUpload });
  registerClockwork(app);
  registerEnrichment(app);
  registerCompanyEnrichMultipass(app);
  registerSearchEnrich(app);
  registerImportProject(app);
  registerDashboard(app);
  return httpServer;
}
