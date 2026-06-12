import type { Company as APICompany } from '@/lib/api';

// Static demo seed for the globe view. Real retail companies with real city-level
// coordinates (so no country-centroid stacking) split 4-per-region across
// Middle East, India, Singapore, USA, Europe. Flows through transformAPICompany /
// transformAPIExecutive via loadFromAPI — no backend, no DB writes.

// One color per region so the map legend maps cleanly.
export const REGION_COLORS: Record<string, string> = {
  'Middle East': '#e8833a', // amber
  India: '#d6336c',         // magenta
  Singapore: '#0ea5e9',     // sky
  USA: '#1e3a8a',           // indigo
  Europe: '#16a34a',        // green
};

type Seed = {
  id: number;
  name: string;
  country: string;
  region: string;
  lat: number;
  lng: number;
  revenue: number; // USD
  employees: number;
  color: string;
  ceo: string;
  ceoTitle: string;
};

const SEEDS: Seed[] = [
  // Middle East
  { id: 9001, name: 'Majid Al Futtaim', country: 'United Arab Emirates', region: 'Middle East', lat: 25.2048, lng: 55.2708, revenue: 10_000_000_000, employees: 43000, color: REGION_COLORS['Middle East'], ceo: 'Ahmed Galal Ismail', ceoTitle: 'Chief Executive Officer' },
  { id: 9002, name: 'Lulu Group International', country: 'United Arab Emirates', region: 'Middle East', lat: 24.4539, lng: 54.3773, revenue: 8_000_000_000, employees: 65000, color: REGION_COLORS['Middle East'], ceo: 'Yusuff Ali M.A.', ceoTitle: 'Chairman & Managing Director' },
  { id: 9003, name: 'Almarai', country: 'Saudi Arabia', region: 'Middle East', lat: 24.7136, lng: 46.6753, revenue: 5_300_000_000, employees: 47000, color: REGION_COLORS['Middle East'], ceo: 'Abdullah Albader', ceoTitle: 'Chief Executive Officer' },
  { id: 9004, name: 'Apparel Group', country: 'United Arab Emirates', region: 'Middle East', lat: 25.1972, lng: 55.2744, revenue: 1_500_000_000, employees: 22000, color: REGION_COLORS['Middle East'], ceo: 'Nilesh Ved', ceoTitle: 'Chairman' },

  // India
  { id: 9005, name: 'Reliance Retail', country: 'India', region: 'India', lat: 19.0760, lng: 72.8777, revenue: 36_000_000_000, employees: 245000, color: REGION_COLORS['India'], ceo: 'V. Subramaniam', ceoTitle: 'Director & CEO' },
  { id: 9006, name: 'Avenue Supermarts (DMart)', country: 'India', region: 'India', lat: 19.1136, lng: 72.8697, revenue: 6_300_000_000, employees: 12000, color: REGION_COLORS['India'], ceo: 'Neville Noronha', ceoTitle: 'Chief Executive Officer' },
  { id: 9007, name: 'Trent (Westside)', country: 'India', region: 'India', lat: 18.9220, lng: 72.8347, revenue: 1_500_000_000, employees: 35000, color: REGION_COLORS['India'], ceo: 'P. Venkatesalu', ceoTitle: 'Chief Executive Officer' },
  { id: 9008, name: 'Shoppers Stop', country: 'India', region: 'India', lat: 19.1197, lng: 72.9050, revenue: 550_000_000, employees: 9000, color: REGION_COLORS['India'], ceo: 'Kavindra Mishra', ceoTitle: 'Managing Director & CEO' },

  // Singapore
  { id: 9009, name: 'DFI Retail Group', country: 'Singapore', region: 'Singapore', lat: 1.3521, lng: 103.8198, revenue: 27_000_000_000, employees: 200000, color: REGION_COLORS['Singapore'], ceo: 'Scott Price', ceoTitle: 'Group Chief Executive' },
  { id: 9010, name: 'Sheng Siong Group', country: 'Singapore', region: 'Singapore', lat: 1.3644, lng: 103.8400, revenue: 1_000_000_000, employees: 3500, color: REGION_COLORS['Singapore'], ceo: 'Lim Hock Chee', ceoTitle: 'Chief Executive Officer' },
  { id: 9011, name: 'Challenger Technologies', country: 'Singapore', region: 'Singapore', lat: 1.3000, lng: 103.8550, revenue: 250_000_000, employees: 1200, color: REGION_COLORS['Singapore'], ceo: 'Loo Leong Thye', ceoTitle: 'Chief Executive Officer' },
  { id: 9012, name: 'NTUC FairPrice', country: 'Singapore', region: 'Singapore', lat: 1.3400, lng: 103.7900, revenue: 3_000_000_000, employees: 10000, color: REGION_COLORS['Singapore'], ceo: 'Vipul Chawla', ceoTitle: 'Group Chief Executive Officer' },

  // USA
  { id: 9013, name: 'Walmart', country: 'United States', region: 'USA', lat: 36.3729, lng: -94.2088, revenue: 648_000_000_000, employees: 2100000, color: REGION_COLORS['USA'], ceo: 'Doug McMillon', ceoTitle: 'President & CEO' },
  { id: 9014, name: 'Target', country: 'United States', region: 'USA', lat: 44.9778, lng: -93.2650, revenue: 107_000_000_000, employees: 415000, color: REGION_COLORS['USA'], ceo: 'Brian Cornell', ceoTitle: 'Chairman & CEO' },
  { id: 9015, name: 'Costco Wholesale', country: 'United States', region: 'USA', lat: 47.5301, lng: -122.0326, revenue: 242_000_000_000, employees: 316000, color: REGION_COLORS['USA'], ceo: 'Ron Vachris', ceoTitle: 'President & CEO' },
  { id: 9016, name: 'The Kroger Co.', country: 'United States', region: 'USA', lat: 39.1031, lng: -84.5120, revenue: 150_000_000_000, employees: 414000, color: REGION_COLORS['USA'], ceo: 'Rodney McMullen', ceoTitle: 'Chairman & CEO' },

  // Europe
  { id: 9017, name: 'Tesco', country: 'United Kingdom', region: 'Europe', lat: 51.5074, lng: -0.1278, revenue: 84_000_000_000, employees: 330000, color: REGION_COLORS['Europe'], ceo: 'Ken Murphy', ceoTitle: 'Group Chief Executive' },
  { id: 9018, name: 'Carrefour', country: 'France', region: 'Europe', lat: 48.8566, lng: 2.3522, revenue: 90_000_000_000, employees: 335000, color: REGION_COLORS['Europe'], ceo: 'Alexandre Bompard', ceoTitle: 'Chairman & CEO' },
  { id: 9019, name: 'IKEA (Ingka Group)', country: 'Netherlands', region: 'Europe', lat: 52.1601, lng: 4.4970, revenue: 47_000_000_000, employees: 170000, color: REGION_COLORS['Europe'], ceo: 'Jesper Brodin', ceoTitle: 'Chief Executive Officer' },
  { id: 9020, name: 'Inditex (Zara)', country: 'Spain', region: 'Europe', lat: 43.3100, lng: -8.4115, revenue: 38_000_000_000, employees: 165000, color: REGION_COLORS['Europe'], ceo: 'Óscar García Maceiras', ceoTitle: 'Chief Executive Officer' },
];

// country (normalized lowercase) -> region, for the map legend grouping.
export const COUNTRY_TO_REGION: Record<string, string> = SEEDS.reduce((acc, s) => {
  acc[s.country.toLowerCase()] = s.region;
  return acc;
}, {} as Record<string, string>);

export const REGION_ORDER = ['Middle East', 'India', 'Singapore', 'USA', 'Europe'];

const now = new Date().toISOString();

export const SAMPLE_RETAIL_COMPANIES: APICompany[] = SEEDS.map((s) => ({
  id: s.id,
  name: s.name,
  sector: 'Retail',
  region: s.region,
  country: s.country,
  streetAddress: null,
  latitude: String(s.lat),
  longitude: String(s.lng),
  revenue: String(s.revenue),
  revenueSource: 'Sample data',
  revenueSourceUrl: null,
  revenueConfidence: null,
  revenueCurrency: 'USD',
  revenueFiscalYear: 2023,
  employees: s.employees,
  employeesSource: 'Sample data',
  employeesSourceUrl: null,
  employeesConfidence: null,
  confidence: 8,
  businessType: 'Retail',
  relevanceReason: null,
  color: s.color,
  searchQueryId: null,
  createdAt: now,
  updatedAt: now,
  executives: [
    {
      id: s.id * 10 + 1,
      companyId: s.id,
      name: s.ceo,
      title: s.ceoTitle,
      email: null,
      phone: null,
      linkedin: null,
      executiveConfidence: null,
      executiveConfidenceReason: null,
      createdAt: now,
      updatedAt: now,
    },
  ],
}));
