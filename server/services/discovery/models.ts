import { DEFAULT_MODEL as LLM_DEFAULT_MODEL, FAST_MODEL } from "../llmClient";

// ========== APPROVED DISCOVERY MODELS ==========
// CRITICAL: Only models that pass structured-output reliability tests are approved.
// These models are proven to return valid JSON with consistent field extraction.
// All other models MUST be disabled for discovery or routed to narrative-only mode.

// Approved models for discovery (structured output extraction)
export const APPROVED_DISCOVERY_MODELS = {
  primary: LLM_DEFAULT_MODEL,
  fallbacks: [FAST_MODEL],
};

export const DEFAULT_MODEL = APPROVED_DISCOVERY_MODELS.primary;
export const FALLBACK_MODELS = APPROVED_DISCOVERY_MODELS.fallbacks;

export function isApprovedForDiscovery(_modelId: string): boolean {
  return true; // all calls go through Vertex AI
}

export function getApprovedModel(requestedModel: string): { model: string; wasOverridden: boolean; reason?: string } {
  return { model: DEFAULT_MODEL, wasOverridden: requestedModel !== DEFAULT_MODEL };
}

// :online suffix not supported on Vertex AI — all web search done via Serper
export const RELIABLE_ONLINE_MODELS: string[] = [];

export const AVAILABLE_MODELS = [
  { id: LLM_DEFAULT_MODEL, name: "Gemini 2.5 Pro (Vertex AI)", provider: "Google", reliableOnline: false, approvedForDiscovery: true },
  { id: FAST_MODEL, name: "Gemini 2.5 Flash (Vertex AI)", provider: "Google", reliableOnline: false, approvedForDiscovery: true },
];
