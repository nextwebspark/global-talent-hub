import type { Express } from "express";
import { storage } from "../../storage";
import type { AuthedRequest } from "../../auth/middleware";
import { assertCareerHistoryInOrg, NotInOrgError } from "../../auth/orgGuard";

export function registerCareer(app: Express): void {
  app.patch("/api/career-history/:id", async (req: AuthedRequest, res) => {
    try {
      const id = parseInt(String(req.params.id));
      await assertCareerHistoryInOrg(id, req.orgId!);
      const entry = await storage.updateCareerHistory(id, req.body);
      res.json(entry);
    } catch (error) {
      if (error instanceof NotInOrgError) return res.status(404).json({ error: error.message });
      console.error("Error updating career history:", error);
      res.status(500).json({ error: "Failed to update career history" });
    }
  });

  app.delete("/api/career-history/:id", async (req: AuthedRequest, res) => {
    try {
      const id = parseInt(String(req.params.id));
      await assertCareerHistoryInOrg(id, req.orgId!);
      await storage.deleteCareerHistory(id);
      res.status(204).send();
    } catch (error) {
      if (error instanceof NotInOrgError) return res.status(404).json({ error: error.message });
      console.error("Error deleting career history:", error);
      res.status(500).json({ error: "Failed to delete career history" });
    }
  });
}
