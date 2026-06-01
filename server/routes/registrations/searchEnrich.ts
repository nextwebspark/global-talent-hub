import type { Express } from "express";
import { storage } from "../../storage";
import { enrichSearchResults } from "../../services/pipeline/enrichment";
import { inferSectorsBatch } from "../../services/sectorInference";

export function registerSearchEnrich(app: Express): void {
  // BATCH MULTI-PASS ENRICHMENT: Enrich all companies in a search result
  app.post("/api/search/:id/enrich-all", async (req, res) => {
    try {
      const searchQueryId = parseInt(req.params.id);
      if (isNaN(searchQueryId)) {
        return res.status(400).json({ error: "Invalid search ID" });
      }

      const searchQuery = await storage.getSearchQuery(searchQueryId);
      if (!searchQuery) {
        return res.status(404).json({ error: "Search not found" });
      }

      console.log(`[Routes] Starting batch multi-pass enrichment for search ${searchQueryId}`);
      const result = await enrichSearchResults(searchQueryId);

      const allCompanies = await storage.getCompaniesBySearchQuery(searchQueryId);
      const companiesNeedingSector = allCompanies
        .filter(c => !c.sector || !c.sector.trim())
        .map(c => ({ id: c.id, name: c.name }));
      let sectorsInferred = 0;
      if (companiesNeedingSector.length > 0) {
        const sectorResults = await inferSectorsBatch(companiesNeedingSector);
        for (const r of sectorResults) {
          await storage.updateCompanyManual(r.id, { sector: r.sector, sectorCategory: r.category });
        }
        sectorsInferred = sectorResults.length;
        console.log(`[Routes] Sector inference during enrichment: filled ${sectorsInferred}/${companiesNeedingSector.length} sectors`);
      }

      const { inferDiversityForSearch } = await import("../../services/pipeline/diversityInference");
      const diversityResult = await inferDiversityForSearch(searchQueryId);
      console.log(`[Routes] Diversity inference: ${diversityResult.updated}/${diversityResult.total} executives updated`);

      const fullResults = await storage.getFullSearchResults(searchQueryId);

      res.json({
        success: true,
        searchQuery,
        enrichment: { ...result, sectorsInferred },
        diversity: diversityResult,
        companies: fullResults?.companies || []
      });
    } catch (error: any) {
      console.error("Error in batch enrichment:", error);
      res.status(500).json({ error: error.message || "Failed to enrich search results" });
    }
  });
}
