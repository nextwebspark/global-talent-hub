import type { Express } from "express";
import { storage } from "../../storage";
import { runMultiPassEnrichment } from "../../services/pipeline/enrichment";

export function registerCompanyEnrichMultipass(app: Express): void {
  // MULTI-PASS ENRICHMENT: Enrich a single company with revenue, employees, and executives
  app.post("/api/companies/:id/enrich-multipass", async (req, res) => {
    try {
      const companyId = parseInt(req.params.id);
      if (isNaN(companyId)) {
        return res.status(400).json({ error: "Invalid company ID" });
      }

      const company = await storage.getCompany(companyId);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      const { revenue = true, employees = true, executives = true, profile = true } = req.body;

      console.log(`[Routes] Starting multi-pass enrichment for ${company.name}`);
      const result = await runMultiPassEnrichment(companyId, { revenue, employees, executives, profile });

      const updatedCompany = await storage.getCompanyWithExecutives(companyId);

      res.json({
        success: true,
        company: updatedCompany,
        enrichment: result
      });
    } catch (error: any) {
      console.error("Error in multi-pass enrichment:", error);
      res.status(500).json({ error: error.message || "Failed to enrich company" });
    }
  });
}
