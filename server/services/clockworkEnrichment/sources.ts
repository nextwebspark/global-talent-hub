import type { EnrichmentSource } from "./types";

const AVAILABLE_SOURCES: EnrichmentSource[] = [
  { name: 'Clockwork', type: 'clockwork', isEnabled: false },
  { name: 'LinkedIn', type: 'linkedin', isEnabled: false },
  { name: 'Clearbit', type: 'clearbit', isEnabled: false },
];

export function getAvailableSources(): EnrichmentSource[] {
  return AVAILABLE_SOURCES;
}

// Internal export for use by other modules (e.g., enrichment.ts isEnrichmentEnabled)
export { AVAILABLE_SOURCES };
