import type { Express } from "express";
import { storage } from "../../storage";
import { insertCompanySchema } from "@shared/schema";
import { applyCoordinateFallback } from "../../services/coordinateFallback";
import { inferSectorsBatch, normalizeOrInferSector, getCategoryForSector } from "../../services/sectorInference";
import type { AuthedRequest } from "../../auth/middleware";

export function registerCompanies(app: Express): void {
  app.get("/api/companies", async (req: AuthedRequest, res) => {
    try {
      const orgId = req.orgId!;
      const companies = await storage.getAllCompanies(orgId);
      const companiesWithExecs = await Promise.all(
        companies.map(async (company) => {
          const executives = await storage.getExecutivesByCompany(company.id, orgId);
          return { ...company, executives };
        })
      );
      res.json(companiesWithExecs);
    } catch (error) {
      console.error("Error fetching companies:", error);
      res.status(500).json({ error: "Failed to fetch companies" });
    }
  });

  app.get("/api/companies/search", async (req: AuthedRequest, res) => {
    try {
      const name = String(req.query.name || '').trim();
      if (name.length < 2) return res.json([]);
      const results = await storage.searchCompaniesByName(name, req.orgId!);
      res.json(results);
    } catch (error) {
      console.error("Error searching companies:", error);
      res.status(500).json({ error: "Failed to search companies" });
    }
  });

  app.get("/api/companies/:id", async (req: AuthedRequest, res) => {
    try {
      const orgId = req.orgId!;
      const id = parseInt(String(req.params.id));
      const company = await storage.getCompany(id, orgId);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }
      const executives = await storage.getExecutivesByCompany(id, orgId);
      res.json({ ...company, executives });
    } catch (error) {
      console.error("Error fetching company:", error);
      res.status(500).json({ error: "Failed to fetch company" });
    }
  });

  // UI/MANUAL LAYER: User-initiated company creation
  app.post("/api/companies", async (req: AuthedRequest, res) => {
    try {
      const orgId = req.orgId!;
      let data = { ...req.body };
      if ((!data.latitude || data.latitude === '0') && (!data.longitude || data.longitude === '0')) {
        const fallback = applyCoordinateFallback({
          latitude: null,
          longitude: null,
          city: data.region || null,
          country: data.country || null,
        });
        if (fallback.latitude && fallback.longitude) {
          data.latitude = String(fallback.latitude);
          data.longitude = String(fallback.longitude);
        }
      }
      const validated = insertCompanySchema.parse(data);
      // If filed under a project, it must be one the caller's org owns.
      if (validated.searchQueryId) {
        const sq = await storage.getSearchQuery(validated.searchQueryId, orgId);
        if (!sq) return res.status(404).json({ error: "Search query not found" });
      }
      const { sector: normalizedSector, category: normalizedCategory } = await normalizeOrInferSector(validated.name || '', validated.sector);
      const company = await storage.createCompanyManual({
        ...validated,
        sector: normalizedSector || validated.sector,
        sectorCategory: normalizedCategory || null,
      }, orgId);
      res.status(201).json(company);
    } catch (error) {
      console.error("Error creating company:", error);
      res.status(400).json({ error: "Invalid company data" });
    }
  });

  // UI/MANUAL LAYER: User-initiated company edits always override imported data
  app.patch("/api/companies/:id", async (req: AuthedRequest, res) => {
    try {
      const orgId = req.orgId!;
      const id = parseInt(String(req.params.id));
      let patchData = { ...req.body };
      if (patchData.sector !== undefined) {
        patchData.sectorCategory = getCategoryForSector(patchData.sector) || null;
      }
      const existingCompany = await storage.getCompany(id, orgId);
      if (!existingCompany) return res.status(404).json({ error: "Company not found" });
      const hasNoCoords = !existingCompany?.latitude && !existingCompany?.longitude;
      const countryChanged = patchData.country && patchData.country !== existingCompany?.country;
      const hasExplicitCoords = patchData.latitude && patchData.longitude;
      if ((hasNoCoords || countryChanged) && !hasExplicitCoords && (patchData.country || existingCompany?.country)) {
        const fallback = applyCoordinateFallback({
          latitude: countryChanged ? null : (existingCompany?.latitude || null),
          longitude: countryChanged ? null : (existingCompany?.longitude || null),
          city: patchData.region || existingCompany?.region || undefined,
          country: patchData.country || existingCompany?.country || undefined,
        });
        if (fallback.latitude && fallback.longitude) {
          patchData.latitude = String(fallback.latitude);
          patchData.longitude = String(fallback.longitude);
        }
      }
      const company = await storage.updateCompanyManual(id, patchData, orgId);
      res.json(company);
    } catch (error) {
      console.error("Error updating company:", error);
      res.status(500).json({ error: "Failed to update company" });
    }
  });

  app.post("/api/companies/infer-sectors", async (req: AuthedRequest, res) => {
    try {
      const orgId = req.orgId!;
      const { companies } = req.body as { companies: { id: number; name: string }[] };
      if (!Array.isArray(companies) || companies.length === 0) {
        return res.json({ results: [] });
      }
      const results = await inferSectorsBatch(companies);
      for (const r of results) {
        // Skip ids outside the caller's org (a no-row update would otherwise throw).
        const owned = await storage.getCompany(r.id, orgId);
        if (!owned) continue;
        await storage.updateCompanyManual(r.id, { sector: r.sector, sectorCategory: r.category }, orgId);
      }
      res.json({ results });
    } catch (error) {
      console.error("Error inferring sectors:", error);
      res.status(500).json({ error: "Sector inference failed" });
    }
  });

  app.delete("/api/companies/:id", async (req: AuthedRequest, res) => {
    try {
      const orgId = req.orgId!;
      const id = parseInt(String(req.params.id));
      const existing = await storage.getCompany(id, orgId);
      if (!existing) return res.status(404).json({ error: "Company not found" });
      await storage.deleteCompany(id, orgId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting company:", error);
      res.status(500).json({ error: "Failed to delete company" });
    }
  });
}
