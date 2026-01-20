import { Company, Executive } from './store';

const INDUSTRIES = ['Luxury Goods', 'FMCG', 'Automotive', 'Pharmaceuticals', 'Technology', 'Finance'];
const TITLES = ['CEO', 'CFO', 'CTO', 'MD', 'President', 'VP Sales', 'Director of Operations'];
const CITIES = [
  { name: 'New York', country: 'USA', lat: 40.7128, lng: -74.0060 },
  { name: 'London', country: 'UK', lat: 51.5074, lng: -0.1278 },
  { name: 'Geneva', country: 'Switzerland', lat: 46.2044, lng: 6.1432 },
  { name: 'Dubai', country: 'UAE', lat: 25.2048, lng: 55.2708 },
  { name: 'Singapore', country: 'Singapore', lat: 1.3521, lng: 103.8198 },
  { name: 'Hong Kong', country: 'China', lat: 22.3193, lng: 114.1694 },
  { name: 'Tokyo', country: 'Japan', lat: 35.6762, lng: 139.6503 },
  { name: 'Paris', country: 'France', lat: 48.8566, lng: 2.3522 },
];

export const generateMockData = (query: string): { companies: Company[], executives: Executive[] } => {
  const companies: Company[] = [];
  const executives: Executive[] = [];
  
  // Basic NLP simulation to detect role intent
  const queryLower = query.toLowerCase();
  
  // Specific role detection
  let targetRoles: string[] = [];
  
  if (queryLower.includes('cfo')) targetRoles.push('CFO');
  if (queryLower.includes('ceo')) targetRoles.push('CEO');
  if (queryLower.includes('cto')) targetRoles.push('CTO');
  if (queryLower.includes('md') || queryLower.includes('managing director')) targetRoles.push('MD');
  if (queryLower.includes('president')) targetRoles.push('President');
  if (queryLower.includes('vp') || queryLower.includes('vice president')) targetRoles.push('VP Sales');
  
  // If no specific roles requested, default to leadership team
  const isGeneralLeadershipSearch = targetRoles.length === 0;
  if (isGeneralLeadershipSearch) {
    targetRoles = ['CEO', 'MD', 'President', 'CFO']; 
  }

  // Deterministic-ish random based on query length
  const count = 10 + (query.length % 5); 
  
  for (let i = 0; i < count; i++) {
    const city = CITIES[Math.floor(Math.random() * CITIES.length)];
    const industry = INDUSTRIES[Math.floor(Math.random() * INDUSTRIES.length)];
    const revenue = Math.floor(Math.random() * 50000000000) + 100000000; // 100M to 50B
    const id = `comp-${i}`;
    
    // Add jitter to lat/lng so they don't stack perfectly
    const latJitter = (Math.random() - 0.5) * 5;
    const lngJitter = (Math.random() - 0.5) * 5;

    companies.push({
      id,
      name: `${industry} Global ${i + 1}`,
      industry,
      hq_city: city.name,
      hq_country: city.country,
      lat: city.lat + latJitter,
      lng: city.lng + lngJitter,
      revenue_usd: revenue,
      employees: Math.floor(revenue / 500000),
      confidence: Math.random() > 0.3 ? 'High' : 'Medium',
      description: `Leading ${industry} distributor in the ${city.country} region.`,
      color: undefined
    });

    // Generate executives based on search intent
    // If specific roles were asked (e.g. "CFO"), ONLY generate/show those.
    // If general search, show a mix of top leadership.
    
    const rolesToGenerate = isGeneralLeadershipSearch 
      ? targetRoles // Generate a mix of top leadership
      : targetRoles; // Generate only the requested roles

    rolesToGenerate.forEach((role, idx) => {
      // Small chance a specific role is missing in public data
      if (Math.random() > 0.1) {
        executives.push({
          id: `exec-${i}-${role}`,
          company_id: id,
          name: `Executive ${i}-${idx+1}`,
          title: role,
          source: Math.random() > 0.8 ? 'Clockwork' : 'Public',
          confidence: Math.random() > 0.2 ? 'High' : 'Low',
        });
      }
    });
  }

  return { companies, executives };
};
