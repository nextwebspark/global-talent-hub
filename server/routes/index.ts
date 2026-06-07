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
import { registerAuth, requireAuth } from "./registrations/auth";
import { registerSettings } from "./registrations/settings";

// Public API path prefixes (relative to the /api mount) that skip the auth gate.
const PUBLIC_API = ["/health", "/auth/"];

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Auth endpoints (self-gated where needed) must register before the gate.
  registerAuth(app);

  // Gate every other /api route behind a valid Supabase session + org membership.
  app.use("/api", (req, res, next) => {
    if (PUBLIC_API.some((p) => req.path.startsWith(p))) return next();
    return requireAuth(req, res, next);
  });

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
  registerSettings(app);
  return httpServer;
}
