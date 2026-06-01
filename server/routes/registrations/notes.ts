import type { Express } from "express";
import { storage } from "../../storage";

export function registerNotes(app: Express): void {
  // Executive Notes endpoint
  app.get("/api/executives/:id/notes", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const notes = await storage.getExecutiveNotes(id);
      res.json(notes || { content: '' });
    } catch (error) {
      console.error("Error fetching executive notes:", error);
      res.status(500).json({ error: "Failed to fetch notes" });
    }
  });

  app.put("/api/executives/:id/notes", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const { content } = req.body;
      if (typeof content !== 'string') {
        return res.status(400).json({ error: "Content is required" });
      }
      const notes = await storage.upsertExecutiveNotes(id, content);
      res.json(notes);
    } catch (error) {
      console.error("Error updating executive notes:", error);
      res.status(500).json({ error: "Failed to update notes" });
    }
  });

  // Company Notes endpoints
  app.get("/api/companies/:id/notes", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const notes = await storage.getCompanyNotes(id);
      res.json(notes || { content: '' });
    } catch (error) {
      console.error("Error fetching company notes:", error);
      res.status(500).json({ error: "Failed to fetch notes" });
    }
  });

  app.put("/api/companies/:id/notes", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const { content } = req.body;
      if (typeof content !== 'string') {
        return res.status(400).json({ error: "Content is required" });
      }
      const notes = await storage.upsertCompanyNotes(id, content);
      res.json(notes);
    } catch (error) {
      console.error("Error updating company notes:", error);
      res.status(500).json({ error: "Failed to update notes" });
    }
  });
}
