import type { Express } from "express";

export function registerConfig(app: Express): void {
  app.get("/api/config", (_req, res) => {
    res.json({
      mapboxToken: process.env.MAPBOX_ACCESS_TOKEN || '',
    });
  });
}
