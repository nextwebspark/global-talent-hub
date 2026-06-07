import type { Express } from "express";
import { storage } from "../../storage";
import type { AuthedRequest } from "../../auth/middleware";

export function registerSearchQueries(app: Express): void {
  app.delete("/api/search-queries/:id/results", async (req: AuthedRequest, res) => {
    try {
      const orgId = req.orgId!;
      const searchQueryId = parseInt(String(req.params.id));
      // Guard: the project must belong to the caller's org before touching its companies.
      const existing = await storage.getSearchQuery(searchQueryId, orgId);
      if (!existing) return res.status(404).json({ error: "Search query not found" });
      const companies = await storage.getCompaniesBySearchQuery(searchQueryId, orgId);
      for (const company of companies) {
        await storage.deleteCompany(company.id, orgId);
      }
      await storage.deleteSearchQuery(searchQueryId, orgId);
      res.status(204).send();
    } catch (error) {
      console.error("Error clearing search results:", error);
      res.status(500).json({ error: "Failed to clear results" });
    }
  });

  app.patch("/api/search-queries/:id/draft", async (req: AuthedRequest, res) => {
    try {
      const orgId = req.orgId!;
      const id = parseInt(String(req.params.id));
      if (isNaN(id)) return res.status(400).json({ error: "Invalid search query ID" });

      const existing = await storage.getSearchQuery(id, orgId);
      if (!existing) return res.status(404).json({ error: "Search query not found" });

      const { selectedCount, query } = req.body;
      const updated = await storage.updateSearchQueryDraft(id, {
        ...(typeof selectedCount === "number" ? { selectedCount } : {}),
        ...(typeof query === "string" ? { query } : {}),
      }, orgId);

      res.json({ searchQueryId: updated.id, status: updated.status, selectedCount: updated.selectedCount });
    } catch (error) {
      console.error("Error saving draft:", error);
      res.status(500).json({ error: "Failed to save draft" });
    }
  });

  app.post("/api/search-queries/bulk-delete", async (req: AuthedRequest, res) => {
    try {
      const orgId = req.orgId!;
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "ids array is required" });
      }
      let deleted = 0;
      for (const id of ids) {
        const searchQueryId = parseInt(String(id));
        if (isNaN(searchQueryId)) continue;
        // Only delete projects owned by the caller's org.
        const existing = await storage.getSearchQuery(searchQueryId, orgId);
        if (!existing) continue;
        const companies = await storage.getCompaniesBySearchQuery(searchQueryId, orgId);
        for (const company of companies) {
          await storage.deleteCompany(company.id, orgId);
        }
        await storage.deleteSearchQuery(searchQueryId, orgId);
        deleted++;
      }
      res.json({ deleted });
    } catch (error) {
      console.error("Error bulk deleting projects:", error);
      res.status(500).json({ error: "Failed to delete projects" });
    }
  });
}
