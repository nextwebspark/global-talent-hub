import { useEffect, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import { SAMPLE_RETAIL_COMPANIES } from "@/features/landing/fixtures/sampleData";

type Point = { lat: number; lng: number; name: string; sector: string; revenue: string };

const POINTS: Point[] = SAMPLE_RETAIL_COMPANIES.map((c) => ({
  lat: Number(c.latitude),
  lng: Number(c.longitude),
  name: c.name,
  sector: c.sector || "Retail",
  revenue: fmtRevenue(Number(c.revenue)),
}));

function fmtRevenue(v: number): string {
  if (!v) return "";
  if (v >= 1e9) return `$${(v / 1e9).toFixed(v >= 1e10 ? 0 : 1)}B`;
  if (v >= 1e6) return `$${Math.round(v / 1e6)}M`;
  return `$${v}`;
}

// Build the rotating company pin (dot + label card) anchored to a lat/lng.
function makePinEl(d: Point): HTMLElement {
  const el = document.createElement("div");
  el.className = "tm-globepin";
  el.innerHTML =
    `<span class="tm-globepin__dot"></span>` +
    `<div class="tm-globepin__card"><div class="nm"></div><div class="meta"></div></div>`;
  (el.querySelector(".nm") as HTMLElement).textContent = d.name;
  (el.querySelector(".meta") as HTMLElement).textContent =
    d.sector + (d.revenue ? ` · ${d.revenue}` : "");
  return el;
}

export default function AuthGlobe() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Auto-rotate; drag is enabled by default via OrbitControls.
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    const controls = g.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.6;
    controls.enableZoom = false;
    g.pointOfView({ lat: 22, lng: 50, altitude: 2.2 });
  }, [size.w]);

  return (
    <div className="tm-authglobe" ref={wrapRef}>
      {size.w > 0 && (
        <Globe
          ref={globeRef}
          width={size.w}
          height={size.h}
          backgroundColor="rgba(0,0,0,0)"
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
          atmosphereColor="#3a5a9a"
          atmosphereAltitude={0.18}
          pointsData={POINTS}
          pointLat="lat"
          pointLng="lng"
          pointColor={() => "#f59c0b"}
          pointAltitude={0.02}
          pointRadius={0.35}
          htmlElementsData={POINTS}
          htmlElement={(d) => makePinEl(d as Point)}
          htmlAltitude={0.05}
        />
      )}
    </div>
  );
}
