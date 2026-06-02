import { ALL_FIELD_PATTERNS } from './constants';
import type { ManualRow } from './types';

export function createEmptyRow(): ManualRow {
  return { id: crypto.randomUUID(), company: '', name: '', title: '', country: '' };
}

export function detectColumnMappings(headers: string[]): Record<string, string> {
  const mappings: Record<string, string> = {};
  const normalizedHeaders = headers.map(h => h.toLowerCase().trim().replace(/[_\-\.]/g, ' '));
  const usedIndices = new Set<number>();

  normalizedHeaders.forEach((header, index) => {
    for (const [field, patterns] of Object.entries(ALL_FIELD_PATTERNS)) {
      if (mappings[field]) continue;
      if (patterns.includes(header)) {
        mappings[field] = headers[index];
        usedIndices.add(index);
        break;
      }
    }
  });

  normalizedHeaders.forEach((header, index) => {
    if (usedIndices.has(index)) return;
    for (const [field, patterns] of Object.entries(ALL_FIELD_PATTERNS)) {
      if (mappings[field]) continue;
      if (patterns.some(p => header.includes(p) || p.includes(header))) {
        mappings[field] = headers[index];
        usedIndices.add(index);
        break;
      }
    }
  });
  return mappings;
}
