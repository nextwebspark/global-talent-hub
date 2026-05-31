import { GoogleGenAI } from "@google/genai";
import type { ISearchProvider, DiscoveredCompany, SearchIntent, SearchWithAnswerResult } from './types';
import type { QueryIntent } from './queryIntent';

const USE_VERTEX = process.env.GOOGLE_GENAI_USE_VERTEXAI === "true";
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const FAST_MODEL = process.env.FAST_MODEL || "gemini-2.5-flash";

function buildGenAI(): GoogleGenAI {
  if (USE_VERTEX) {
    if (!PROJECT) throw new Error("GOOGLE_CLOUD_PROJECT must be set for Vertex AI");
    return new GoogleGenAI({ vertexai: true, project: PROJECT, location: LOCATION });
  }
  if (!GOOGLE_API_KEY) throw new Error("GOOGLE_API_KEY must be set");
  return new GoogleGenAI({ apiKey: GOOGLE_API_KEY });
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function extractNamesFromText(text: string): string[] {
  const names: string[] = [];
  const patterns = [
    /^\s*\d+[\.\)]\s+(.+?)(?:\s*[-–—(|:].*)?$/gm,
    /^\s*[-•*]\s+(.+?)(?:\s*[-–—(|:].*)?$/gm,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      let name = match[1].trim().replace(/\*+/g, '').replace(/\s+/g, ' ').replace(/[,.]$/, '').trim();
      if (name.length >= 2 && name.length <= 100) names.push(name);
    }
  }
  return [...new Set(names)];
}

export class GeminiSearchAdapter implements ISearchProvider {
  name = 'gemini-search';
  private genai: GoogleGenAI;

  constructor() {
    this.genai = buildGenAI();
  }

  async searchWithAnswer(
    query: string,
    numResults = 10,
    _intent?: QueryIntent
  ): Promise<{ results: SearchWithAnswerResult[]; answer?: string }> {
    try {
      const response = await this.genai.models.generateContent({
        model: FAST_MODEL,
        contents: [{ role: 'user', parts: [{ text: query }] }],
        config: {
          tools: [{ googleSearch: {} }],
          maxOutputTokens: 8192,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      const text = response.text ?? '';
      const chunks: Array<{ web?: { uri: string; title: string } }> =
        (response.candidates?.[0] as any)?.groundingMetadata?.groundingChunks ?? [];

      const seen = new Set<string>();
      const results: SearchWithAnswerResult[] = [];

      for (const chunk of chunks) {
        const uri = chunk?.web?.uri;
        const title = chunk?.web?.title || '';
        if (!uri || seen.has(uri)) continue;
        seen.add(uri);
        results.push({
          url: uri,
          title,
          snippet: '',
          score: 1,
          sourceType: 'other',
          domain: extractDomain(uri),
        });
        if (results.length >= numResults) break;
      }

      console.log(`[GeminiSearch] searchWithAnswer: ${results.length} results for "${query.substring(0, 60)}"`);
      return { results, answer: text };
    } catch (err: any) {
      console.warn(`[GeminiSearch] searchWithAnswer failed for "${query}":`, err.message);
      return { results: [], answer: undefined };
    }
  }

  async discoverCompanies(intent: SearchIntent): Promise<DiscoveredCompany[]> {
    const geo = intent.country || intent.region || '';
    const sector = intent.sector || '';
    const limit = intent.limit * 2;
    const prompt = `List the top ${limit} ${sector} companies${geo ? ` in ${geo}` : ''} that match: "${intent.originalQuery}".
Return a numbered list of company names only, one per line. No descriptions or URLs.`;

    try {
      const response = await this.genai.models.generateContent({
        model: FAST_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          tools: [{ googleSearch: {} }],
          maxOutputTokens: 4096,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      const text = response.text ?? '';
      const chunks: Array<{ web?: { uri: string; title: string } }> =
        (response.candidates?.[0] as any)?.groundingMetadata?.groundingChunks ?? [];
      const names = extractNamesFromText(text);

      console.log(`[GeminiSearch] discoverCompanies: ${names.length} names, ${chunks.length} sources`);

      const now = new Date();
      return names.slice(0, limit).map((name, i) => ({
        companyNameRaw: name,
        sourceUrl: chunks[i % Math.max(chunks.length, 1)]?.web?.uri || '',
        sourceTitle: chunks[i % Math.max(chunks.length, 1)]?.web?.title,
        searchProvider: this.name,
        discoveryTimestamp: now,
      }));
    } catch (err: any) {
      console.warn(`[GeminiSearch] discoverCompanies failed:`, err.message);
      return [];
    }
  }

  async fetchPageContent(url: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TalentMapBot/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      return html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, '\n')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
        .replace(/\n{3,}/g, '\n\n').trim();
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createGeminiSearchAdapter(): GeminiSearchAdapter {
  return new GeminiSearchAdapter();
}
