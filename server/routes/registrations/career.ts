import type { Express } from "express";
import { storage } from "../../storage";

export function registerCareer(app: Express): void {
  app.patch("/api/career-history/:id", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const entry = await storage.updateCareerHistory(id, req.body);
      res.json(entry);
    } catch (error) {
      console.error("Error updating career history:", error);
      res.status(500).json({ error: "Failed to update career history" });
    }
  });

  app.delete("/api/career-history/:id", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      await storage.deleteCareerHistory(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting career history:", error);
      res.status(500).json({ error: "Failed to delete career history" });
    }
  });
}
