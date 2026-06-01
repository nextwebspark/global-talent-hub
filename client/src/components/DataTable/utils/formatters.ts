export function formatRevenue(value: number): string {
  if (!value || value === 0) return '-';
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export function formatEmployees(value: number): string {
  if (!value || value === 0) return '-';
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return String(value);
}

export function parseRevenueInput(input: string): number {
  const cleaned = input.replace(/[$,\s]/g, '').toLowerCase();
  if (!cleaned) return 0;
  const multipliers: Record<string, number> = { b: 1e9, bn: 1e9, billion: 1e9, m: 1e6, mn: 1e6, mil: 1e6, million: 1e6, k: 1e3, thousand: 1e3 };
  for (const [suffix, mult] of Object.entries(multipliers)) {
    if (cleaned.endsWith(suffix)) {
      const num = parseFloat(cleaned.slice(0, -suffix.length));
      return isNaN(num) ? 0 : num * mult;
    }
  }
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}
