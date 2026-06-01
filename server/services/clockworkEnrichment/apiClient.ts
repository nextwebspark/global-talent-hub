import type { ClockworkProject } from "./types";

/**
 * Raw API response from Clockwork projects endpoint
 */
export interface ClockworkAPIProjectResponse {
  id: number | string;
  name: string;
  client?: { name?: string; company_name?: string };
  client_name?: string;
  status?: string;
  project_type?: string;
  type?: string;
  candidate_count?: number;
  candidates_count?: number;
  restricted?: boolean;
}

/**
 * Clockwork configuration type
 */
export interface ClockworkConfig {
  apiKey: string;
  apiSecret: string;
  firmKey: string;
  firmSlug: string;
  baseUrl: string;
  authToken: string;
}

/**
 * Get Clockwork API configuration
 */
export function getClockworkConfig(): ClockworkConfig | null {
  const apiKey = process.env.CLOCKWORK_API_KEY;
  const apiSecret = process.env.CLOCKWORK_API_SECRET;
  const firmKey = process.env.CLOCKWORK_FIRM_KEY;
  // Firm slug is used in the URL path (e.g., "acme-search" from clockworkrecruiting.com/acme-search)
  // Falls back to firm key if not set separately
  const firmSlug = process.env.CLOCKWORK_FIRM_SLUG || firmKey;

  if (!apiKey || !apiSecret || !firmKey) {
    console.warn('[Enrichment:Clockwork] Missing API credentials - CLOCKWORK_API_KEY, CLOCKWORK_API_SECRET, or CLOCKWORK_FIRM_KEY not set');
    return null;
  }

  // Clockwork uses Token auth with base64(api_key:api_secret)
  const authToken = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  const baseUrl = process.env.CLOCKWORK_API_URL || 'https://api.clockworkrecruiting.com/v3.0';

  console.log(`[Enrichment:Clockwork] Using firm slug: ${firmSlug} with base URL: ${baseUrl}`);

  return { apiKey, apiSecret, firmKey, firmSlug: firmSlug || firmKey, baseUrl, authToken };
}

/**
 * Normalize project status to standard values
 */
export function normalizeProjectStatus(status?: string): ClockworkProject['status'] {
  if (!status) return 'unknown';
  const s = status.toLowerCase();
  if (s.includes('open') || s === 'active') return 'open';
  if (s.includes('close') || s === 'completed') return 'closed';
  if (s.includes('retain')) return 'retained';
  if (s.includes('special')) return 'special';
  return 'unknown';
}

/**
 * Transform raw API project to our ClockworkProject interface
 */
export function transformAPIProject(raw: ClockworkAPIProjectResponse): ClockworkProject {
  return {
    id: String(raw.id),
    name: raw.name,
    clientCompany: raw.client?.company_name || raw.client?.name || raw.client_name,
    status: normalizeProjectStatus(raw.status),
    type: raw.project_type || raw.type,
    candidateCount: raw.candidate_count || raw.candidates_count,
    restricted: raw.restricted,
    restrictionReason: raw.restricted ? 'Insufficient permissions' : undefined
  };
}
