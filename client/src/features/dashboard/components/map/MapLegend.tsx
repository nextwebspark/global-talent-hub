import { useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { REGION_COLORS, COUNTRY_TO_REGION, REGION_ORDER } from '@/features/landing/fixtures/sampleData';

// Bottom-left overlay card listing regions with their marker color + live counts
// derived from the companies currently in the store. Pure presentational.
export default function MapLegend() {
  const companies = useAppStore((s) => s.companies);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const co of companies) {
      const region = COUNTRY_TO_REGION[(co.hq_country || '').toLowerCase()] || 'Other';
      c[region] = (c[region] || 0) + 1;
    }
    return c;
  }, [companies]);

  const regions = REGION_ORDER.filter((r) => counts[r]);
  if (regions.length === 0) return null;

  return (
    <div className="absolute bottom-4 left-4 z-10 rounded-lg border border-border bg-card/90 backdrop-blur-sm shadow-lg px-3 py-2.5 text-card-foreground">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
        Regions
      </div>
      <div className="flex flex-col gap-1">
        {regions.map((region) => (
          <div key={region} className="flex items-center gap-2 text-[12px]">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: REGION_COLORS[region] }}
            />
            <span className="flex-1">{region}</span>
            <span className="text-muted-foreground tabular-nums">{counts[region]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
