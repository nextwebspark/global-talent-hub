export type LandingMode = 'search' | 'import' | 'brief';

export interface ManualRow {
  id: string;
  company: string;
  name: string;
  title: string;
  country: string;
}

export interface ImportPreview {
  headers: string[];
  rows: string[][];
  mappings: Record<string, string>;
  fileName?: string;
}
