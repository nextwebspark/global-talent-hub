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
  
  const queryLower = query.toLowerCase();
  
  // --- 1. PARSE SEARCH CRITERIA ---
  
  // Detect Revenue Threshold (e.g., "$10B", "10 billion", ">5B")
  let minRevenue = 0;
  const revenueMatch = queryLower.match(/(\d+(?:\.\d+)?)\s*(?:b|bn|billion)/);
  if (revenueMatch) {
    minRevenue = parseFloat(revenueMatch[1]) * 1000000000;
  }

  // Detect Region
  let region = 'Global';
  const regions = [
    { name: 'Europe', cities: ['London', 'Paris', 'Geneva', 'Berlin', 'Milan'] },
    { name: 'Asia', cities: ['Singapore', 'Hong Kong', 'Tokyo', 'Shanghai'] },
    { name: 'US', cities: ['New York', 'San Francisco', 'Chicago', 'Boston'] },
    { name: 'Middle East', cities: ['Dubai', 'Riyadh', 'Doha'] }
  ];
  
  const targetRegion = regions.find(r => queryLower.includes(r.name.toLowerCase()));
  if (targetRegion) region = targetRegion.name;

  // Detect Sector/Industry
  let sector = 'General';
  const industries = ['FMCG', 'Luxury Goods', 'Automotive', 'Pharmaceuticals', 'Technology', 'Finance'];
  const targetIndustry = industries.find(i => queryLower.includes(i.toLowerCase()));
  if (targetIndustry) sector = targetIndustry;

  // Detect Specific Roles
  let targetRoles: string[] = [];
  if (queryLower.includes('cfo')) targetRoles.push('CFO');
  if (queryLower.includes('ceo')) targetRoles.push('CEO');
  if (queryLower.includes('cto')) targetRoles.push('CTO');
  if (queryLower.includes('md') || queryLower.includes('managing director')) targetRoles.push('MD');
  if (queryLower.includes('president')) targetRoles.push('President');
  
  const isGeneralLeadershipSearch = targetRoles.length === 0;
  if (isGeneralLeadershipSearch) {
    targetRoles = ['CEO', 'MD', 'President', 'CFO']; 
  }

  // --- 2. GENERATE COMPLIANT DATA ---

  // Generate appropriate number of results
  const count = queryLower.includes('top 20') ? 20 : (10 + (query.length % 5)); 
  
  for (let i = 0; i < count; i++) {
    // Select city based on Region
    let cityPool = CITIES;
    if (targetRegion) {
      cityPool = CITIES.filter(c => targetRegion.cities.includes(c.name));
      // Fallback if no specific cities mapped in simple mock, create generic one
      if (cityPool.length === 0) {
        cityPool = [{ name: `${targetRegion.name} HQ`, country: targetRegion.name, lat: 48.0, lng: 10.0 }];
      }
    }
    const city = cityPool[Math.floor(Math.random() * cityPool.length)];

    // Enforce Minimum Revenue if specified
    // If user asked for >$10B, generate between $10B and $50B
    const revenueFloor = minRevenue || 100000000;
    const revenueCeiling = 50000000000;
    const revenue = Math.floor(Math.random() * (revenueCeiling - revenueFloor)) + revenueFloor;

    const id = `comp-${i}`;
    
    // Add jitter
    const latJitter = (Math.random() - 0.5) * 5;
    const lngJitter = (Math.random() - 0.5) * 5;

    const companyName = targetIndustry 
      ? `${targetIndustry} ${['Group', 'Holdings', 'International', 'Corp'][i % 4]} ${i + 1}`
      : `${sector} Global ${i + 1}`;

    companies.push({
      id,
      name: companyName,
      industry: sector === 'General' ? INDUSTRIES[Math.floor(Math.random() * INDUSTRIES.length)] : sector,
      hq_city: city.name,
      hq_country: city.country,
      lat: city.lat + latJitter,
      lng: city.lng + lngJitter,
      revenue_usd: revenue,
      employees: Math.floor(revenue / 500000),
      confidence: Math.random() > 0.3 ? 'High' : 'Medium',
      description: `Leading ${sector} player in ${region}.`,
      color: undefined
    });

    // Generate Executives
    const rolesToGenerate = targetRoles; 

    rolesToGenerate.forEach((role, idx) => {
      // If user specifically asked for "List the CFOs", we should be high confidence we return them
      const shouldGenerate = isGeneralLeadershipSearch ? (Math.random() > 0.1) : true; 

      if (shouldGenerate) {
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
