import { useAppStore } from '@/lib/store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, ChevronLeft, ChevronRight, Building2, User, MapPin, Trash2, Plus, X, CheckCircle2, Sparkles, Eye, EyeOff, AlertTriangle, Info, Zap, Loader2, DollarSign, Users, Table, Map as MapIcon, Download, Upload, Check, Maximize2, Minimize2 } from 'lucide-react';
import { useState, useMemo, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import logoImage from '@/assets/images/logo.png';
import DataTable from '@/components/DataTable';
import L from 'leaflet';
import * as XLSX from 'xlsx';
import { COUNTRIES, getCountryCentroid, normalizeCountryName } from '@/lib/countries';

interface CountryData {
  name: string;
  companies: {
    id: string;
    name: string;
    revenue_usd: number;
    employees: number;
    confidence: number;
    hq_city: string;
    lat: number;
    lng: number;
    color?: string;
    executives: {
      id: string;
      name: string;
      title: string;
      confidence: number;
      profileUrl?: string;
      isEnriched?: boolean;
      enrichmentSource?: string;
    }[];
  }[];
}

interface LeftPanelProps {
  width?: number;
  isOpen?: boolean;
  onToggle?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export default function LeftPanel({ width = 360, isOpen = true, onToggle, isFullscreen = false, onToggleFullscreen }: LeftPanelProps) {
  const { 
    companies, executives, selectCompany, selectExecutive, selectedCompanyId, selectedExecutiveId,
    deleteCompany, addCompany, deleteExecutive, addExecutive, currentProject,
    hiddenCountries, hiddenCompanies, toggleCountryVisibility, toggleCompanyVisibility,
    discoveryStatus, degradationReasons, clearDiscoveryStatus, loadFromAPI,
    revenueFilterRange, setRevenueFilterRange, employeeFilterRange, setEmployeeFilterRange
  } = useAppStore();
  const [activeTab, setActiveTab] = useState<'map' | 'table'>('map');
  const [searchFilter, setSearchFilter] = useState('');
  const [expandedCountries, setExpandedCountries] = useState<Set<string>>(new Set());
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAddExecForm, setShowAddExecForm] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [importPreview, setImportPreview] = useState<{headers: string[], rows: string[][], mappings: Record<string, string>} | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const countryDropdownRef = useRef<HTMLDivElement>(null);
  const [newCompany, setNewCompany] = useState({
    name: '',
    hq_city: '',
    hq_country: '',
    revenue_usd: '',
    employees: ''
  });
  const [newExecutive, setNewExecutive] = useState({
    name: '',
    title: ''
  });
  const [isAdding, setIsAdding] = useState(false);
  const [isAddingExec, setIsAddingExec] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);

  const handleEnrichAll = async () => {
    if (!currentProject?.id) {
      toast.error('No active project');
      return;
    }

    setIsEnriching(true);
    toast.info('Enriching companies... Watch for real-time updates!');
    
    let pollInterval: NodeJS.Timeout | null = null;
    
    const refreshCompanies = async () => {
      try {
        const res = await fetch(`/api/search-results/${currentProject.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.companies) {
            loadFromAPI(data.companies);
          }
        }
      } catch (e) {
        console.error('Refresh failed:', e);
      }
    };
    
    pollInterval = setInterval(refreshCompanies, 3000);
    
    try {
      const response = await fetch(`/api/search/${currentProject.id}/enrich-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (pollInterval) clearInterval(pollInterval);

      if (!response.ok) throw new Error('Enrichment failed');
      
      const result = await response.json();
      const { enrichment } = result;
      
      await refreshCompanies();
      
      toast.success(
        `Enriched ${enrichment.companiesProcessed} companies: ` +
        `${enrichment.revenueEnriched} revenues, ` +
        `${enrichment.employeesEnriched} employee counts, ` +
        `${enrichment.executivesAdded} executives added`
      );
    } catch (error) {
      if (pollInterval) clearInterval(pollInterval);
      toast.error('Enrichment failed. Please try again.');
    } finally {
      setIsEnriching(false);
    }
  };

  const handleDeleteCompany = async (e: React.MouseEvent, companyId: string, companyName: string) => {
    e.stopPropagation();
    if (!confirm(`Delete "${companyName}" from results?`)) return;
    
    try {
      await fetch(`/api/companies/${companyId}`, { method: 'DELETE' });
      deleteCompany(companyId);
      toast.success(`Removed ${companyName}`);
    } catch (error) {
      toast.error('Failed to delete company');
    }
  };

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentProject?.id || !newCompany.name.trim()) {
      toast.error('Please enter a company name');
      return;
    }

    setIsAdding(true);
    try {
      const normalizedCountry = normalizeCountryName(newCompany.hq_country);
      
      const centroid = getCountryCentroid(normalizedCountry);
      const lat = centroid ? centroid.lat : 0;
      const lng = centroid ? centroid.lng : 0;
        
      const response = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCompany.name,
          region: newCompany.hq_city || 'Unknown',
          country: normalizedCountry,
          revenue: newCompany.revenue_usd ? String(parseFloat(newCompany.revenue_usd)) : null,
          employees: parseInt(newCompany.employees) || 0,
          latitude: String(lat),
          longitude: String(lng),
          confidence: 5,
          searchQueryId: parseInt(currentProject.id)
        })
      });

      if (!response.ok) throw new Error('Failed to add company');
      
      const created = await response.json();
      const newCompanyCountry = normalizeCountryName(created.country || normalizedCountry);
      
      addCompany({
        id: String(created.id),
        name: created.name,
        industry: created.sector || '',
        hq_city: created.region || 'Unknown',
        hq_country: newCompanyCountry,
        lat: parseFloat(created.latitude) || 0,
        lng: parseFloat(created.longitude) || 0,
        revenue_usd: parseFloat(created.revenue) || 0,
        employees: created.employees || 0,
        confidence: created.confidence || 5,
        color: created.color || '#1e3a8a'
      });
      
      setExpandedCountries(prev => new Set(prev).add(newCompanyCountry));
      
      setNewCompany({ name: '', hq_city: '', hq_country: '', revenue_usd: '', employees: '' });
      setShowAddForm(false);
      toast.success(`Added ${created.name}`);
    } catch (error) {
      toast.error('Failed to add company');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteExecutive = async (e: React.MouseEvent, execId: string, execName: string) => {
    e.stopPropagation();
    if (!confirm(`Delete "${execName}" from results?`)) return;
    
    try {
      await fetch(`/api/executives/${execId}`, { method: 'DELETE' });
      deleteExecutive(execId);
      toast.success(`Removed ${execName}`);
    } catch (error) {
      toast.error('Failed to delete executive');
    }
  };

  const handleSelectExecutive = (e: React.MouseEvent, execId: string, companyId: string) => {
    e.stopPropagation();
    selectCompany(companyId);
    selectExecutive(execId);
  };

  const handleAddExecutive = async (e: React.FormEvent, companyId: string) => {
    e.preventDefault();
    if (!newExecutive.name.trim()) {
      toast.error('Please enter an executive name');
      return;
    }

    setIsAddingExec(true);
    try {
      const response = await fetch('/api/executives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newExecutive.name,
          title: newExecutive.title || 'Executive',
          companyId: parseInt(companyId),
          confidence: 5,
          source: 'manual'
        })
      });

      if (!response.ok) throw new Error('Failed to add executive');
      
      const created = await response.json();
      addExecutive({
        id: String(created.id),
        company_id: companyId,
        name: created.name,
        title: created.title || 'Executive',
        source: 'manual',
        confidence: created.confidence || 5,
        isEnriched: false
      });
      
      setNewExecutive({ name: '', title: '' });
      setShowAddExecForm(null);
      toast.success(`Added ${created.name}`);
    } catch (error) {
      toast.error('Failed to add executive');
    } finally {
      setIsAddingExec(false);
    }
  };

  const countriesData = useMemo(() => {
    const countryMap = new Map<string, CountryData>();
    
    companies.forEach(company => {
      const countryName = company.hq_country || 'Unknown';
      
      if (!countryMap.has(countryName)) {
        countryMap.set(countryName, {
          name: countryName,
          companies: []
        });
      }
      
      const companyExecs = executives
        .filter(e => e.company_id === company.id)
        .map(e => ({
          id: e.id,
          name: e.name,
          title: e.title,
          confidence: e.confidence,
          profileUrl: e.profileUrl,
          isEnriched: e.isEnriched,
          enrichmentSource: e.enrichmentSource
        }));
      
      countryMap.get(countryName)!.companies.push({
        id: company.id,
        name: company.name,
        revenue_usd: company.revenue_usd,
        employees: company.employees,
        confidence: company.confidence,
        hq_city: company.hq_city,
        lat: company.lat,
        lng: company.lng,
        color: company.color,
        executives: companyExecs
      });
    });

    const sorted = Array.from(countryMap.values()).sort((a, b) => {
      // Exclude null/0 revenues from totals (Unknown shouldn't affect ranking)
      const revenueA = a.companies.reduce((sum, c) => sum + (c.revenue_usd || 0), 0);
      const revenueB = b.companies.reduce((sum, c) => sum + (c.revenue_usd || 0), 0);
      return revenueB - revenueA;
    });

    sorted.forEach(country => {
      // Companies with known revenue first, then by revenue descending
      // Unknown revenues sorted to end
      country.companies.sort((a, b) => {
        const aHasRevenue = a.revenue_usd && a.revenue_usd > 0;
        const bHasRevenue = b.revenue_usd && b.revenue_usd > 0;
        if (aHasRevenue && !bHasRevenue) return -1;
        if (!aHasRevenue && bHasRevenue) return 1;
        return (b.revenue_usd || 0) - (a.revenue_usd || 0);
      });
    });

    return sorted;
  }, [companies, executives]);

  // Table data for Excel-like view
  const tableData = useMemo(() => {
    const data: { id: string; country: string; name: string; title: string; notes: string; email: string; phone: string; linkedin: string; careerSummary: string; remunerationNotes: string; availability: string; level: string; companyId: string; companyName: string; companyColor: string; isCompanyRow: boolean; customFields?: Record<string, string> }[] = [];
    
    companies.forEach(company => {
      const companyExecs = executives.filter(e => e.company_id === company.id);
      if (companyExecs.length === 0) {
        data.push({
          id: `company-${company.id}`,
          country: company.hq_country || 'Unknown',
          name: '',
          title: '',
          notes: '',
          email: '',
          phone: '',
          linkedin: '',
          careerSummary: '',
          remunerationNotes: '',
          availability: '',
          level: '',
          companyId: company.id,
          companyName: company.name,
          companyColor: company.color || '#1e3a8a',
          isCompanyRow: true
        });
      } else {
        companyExecs.forEach(exec => {
          data.push({
            id: exec.id,
            country: company.hq_country || 'Unknown',
            name: exec.name,
            title: exec.title,
            notes: exec.notes || '',
            email: exec.email || '',
            phone: exec.phone || '',
            linkedin: exec.linkedin || '',
            careerSummary: exec.careerSummary || '',
            remunerationNotes: exec.remunerationNotes || '',
            availability: exec.availability || '',
            level: exec.level || '',
            companyId: company.id,
            companyName: company.name,
            companyColor: company.color || '#1e3a8a',
            isCompanyRow: false,
            customFields: exec.customFields
          });
        });
      }
    });

    return data;
  }, [companies, executives]);

  const handleExportToExcel = () => {
    const exportData = tableData.map(row => {
      const base: Record<string, string> = {
        'Country': row.country || '',
        'Company': row.companyName || '',
        'Executive': row.name || '',
        'Title': row.title || '',
        'Notes': row.notes || '',
        'Email': row.email || '',
        'Phone': row.phone || '',
        'LinkedIn': row.linkedin || '',
        'Career Summary': row.careerSummary || '',
        'Remuneration': row.remunerationNotes || '',
        'Status': row.availability || '',
        'Level': row.level || '',
      };
      if (row.customFields) {
        Object.entries(row.customFields).forEach(([k, v]) => {
          base[k] = v || '';
        });
      }
      return base;
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Executives');
    
    const projectName = currentProject?.search_string?.slice(0, 30) || 'executives';
    XLSX.writeFile(wb, `${projectName.replace(/[^a-zA-Z0-9]/g, '_')}_export.xlsx`);
    toast.success('Exported to Excel');
  };

  const handleRowClick = (row: typeof tableData[0]) => {
    selectCompany(row.companyId);
    if (!row.isCompanyRow) {
      selectExecutive(row.id);
    }
  };

  const countryDropdownOptions = useMemo(() => {
    return COUNTRIES;
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (countryDropdownRef.current && !countryDropdownRef.current.contains(event.target as Node)) {
        setCountryDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const ALL_FIELD_PATTERNS: Record<string, string[]> = {
    name: [
      'name', 'full name', 'fullname', 'executive', 'executive name', 'person', 'candidate',
      'contact', 'contact name', 'individual', 'first name', 'firstname', 'last name', 'lastname',
      'employee name', 'staff name', 'member', 'personnel', 'talent', 'prospect',
      'candidate name', 'applicant', 'interviewee', 'nominee', 'person name'
    ],
    company: [
      'company', 'company name', 'companyname', 'organization', 'organisation', 'employer',
      'firm', 'business', 'enterprise', 'corporation', 'corp', 'entity', 'group',
      'current company', 'current employer', 'current organization', 'current organisation',
      'employer name', 'org', 'org name', 'workplace', 'place of work', 'holding',
      'conglomerate', 'parent company', 'subsidiary', 'brand'
    ],
    title: [
      'title', 'job title', 'jobtitle', 'position', 'role', 'designation', 'function',
      'job role', 'current title', 'current position', 'current role', 'job function',
      'rank', 'grade', 'level', 'seniority', 'post', 'appointment', 'office',
      'position title', 'role title', 'job designation', 'professional title'
    ],
    country: [
      'country', 'location', 'hq country', 'headquarters', 'hq', 'nation', 'region',
      'geography', 'geo', 'territory', 'market', 'domicile', 'base', 'based in',
      'country of origin', 'home country', 'operating country', 'jurisdiction',
      'country/region', 'loc', 'city/country', 'headquartered'
    ],
    email: [
      'email', 'e-mail', 'email address', 'e-mail address', 'mail', 'email id',
      'contact email', 'work email', 'business email', 'corporate email',
      'personal email', 'primary email', 'emailaddress'
    ],
    phone: [
      'phone', 'telephone', 'tel', 'mobile', 'cell', 'cellphone', 'cell phone',
      'phone number', 'contact number', 'mobile number', 'work phone', 'direct line',
      'landline', 'office phone', 'business phone', 'primary phone', 'phonenumber',
      'mob', 'contact phone'
    ],
    linkedin: [
      'linkedin', 'linkedin url', 'linkedin profile', 'profile url', 'linkedin link',
      'li url', 'li profile', 'linked in', 'social profile', 'linkedin page',
      'professional profile', 'linkedin address'
    ],
    notes: [
      'notes', 'comments', 'remarks', 'description', 'additional info', 'memo',
      'observation', 'info', 'information', 'additional notes', 'general notes',
      'comment', 'remark', 'note', 'detail', 'details', 'other', 'misc',
      'miscellaneous', 'summary', 'overview'
    ],
    careerSummary: [
      'career summary', 'bio', 'biography', 'background', 'career', 'experience',
      'work history', 'professional summary', 'profile summary', 'career history',
      'work experience', 'employment history', 'professional background',
      'career background', 'career profile', 'resume summary', 'cv summary'
    ],
    remunerationNotes: [
      'remuneration', 'salary', 'compensation', 'pay', 'package', 'total compensation',
      'comp', 'tc', 'total comp', 'salary range', 'pay range', 'earnings',
      'remuneration notes', 'comp notes', 'salary notes', 'base salary',
      'base pay', 'annual salary', 'ctc', 'cost to company', 'wage', 'income'
    ],
    availability: [
      'availability', 'available', 'status', 'availability status', 'open to',
      'notice period', 'notice', 'start date', 'available from', 'can start',
      'ready', 'timeline', 'availability date', 'current status', 'employment status'
    ],
    level: [
      'level', 'seniority', 'seniority level', 'executive level', 'management level',
      'grade', 'band', 'tier', 'rank', 'position level'
    ]
  };

  const detectColumnMappings = (headers: string[]): Record<string, string> => {
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

    if (Object.keys(mappings).length < normalizedHeaders.length) {
      normalizedHeaders.forEach((header, index) => {
        if (usedIndices.has(index)) return;
        for (const [field, patterns] of Object.entries(ALL_FIELD_PATTERNS)) {
          if (mappings[field]) continue;
          const match = patterns.some(p => header.includes(p) || p.includes(header));
          if (match) {
            mappings[field] = headers[index];
            usedIndices.add(index);
            break;
          }
        }
      });
    }

    return mappings;
  };

  const handlePasteData = () => {
    if (!importText.trim()) {
      toast.error('Please paste some data');
      return;
    }

    const lines = importText.trim().split('\n');
    if (lines.length < 2) {
      toast.error('Need at least a header row and one data row');
      return;
    }

    // Detect delimiter (tab or comma)
    const delimiter = lines[0].includes('\t') ? '\t' : ',';
    const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1).map(line => 
      line.split(delimiter).map(cell => cell.trim().replace(/^"|"$/g, ''))
    );

    const mappings = detectColumnMappings(headers);
    setImportPreview({ headers, rows, mappings });
  };

  const handleConfirmImport = async () => {
    if (!importPreview || !currentProject?.id) return;

    setIsImporting(true);
    try {
      const { headers, rows, mappings } = importPreview;
      
      const records = rows.map(row => {
        const record: Record<string, string> = {};
        headers.forEach((header, index) => {
          record[header] = row[index] || '';
        });
        return record;
      }).filter(r => {
        const nameField = mappings.name;
        const companyField = mappings.company;
        const titleField = mappings.title;
        const hasName = nameField && r[nameField]?.trim();
        const hasCompany = companyField && r[companyField]?.trim();
        const hasTitle = titleField && r[titleField]?.trim();
        return hasName || hasCompany || hasTitle;
      });

      if (records.length === 0) {
        toast.error('No valid records found (need at least a name, company, or title)');
        setIsImporting(false);
        return;
      }

      // Call bulk import API
      const response = await fetch('/api/executives/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchQueryId: parseInt(currentProject.id),
          mappings,
          records
        })
      });

      if (!response.ok) throw new Error('Import failed');

      const result = await response.json();
      
      // Reload data
      if (loadFromAPI && currentProject.id) {
        const res = await fetch(`/api/search-results/${currentProject.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.companies) {
            loadFromAPI(data.companies);
          }
        }
      }

      toast.success(`Imported ${result.imported} executives`);
      setShowImportModal(false);
      setImportText('');
      setImportPreview(null);
    } catch (error) {
      toast.error('Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  const filteredCountries = useMemo(() => {
    // Revenue thresholds: slider values * 50M (0-100 maps to 0-$5B)
    const revenueMin = revenueFilterRange[0] * 50000000;
    const revenueMax = revenueFilterRange[1] * 50000000;
    // Employee thresholds: slider values * 100 (0-100 maps to 0-10K)
    const employeeMin = employeeFilterRange[0] * 100;
    const employeeMax = employeeFilterRange[1] * 100;
    
    let result = countriesData;
    
    // Apply revenue and employee range filters
    const hasRevenueFilter = revenueFilterRange[0] > 0 || revenueFilterRange[1] < 100;
    const hasEmployeeFilter = employeeFilterRange[0] > 0 || employeeFilterRange[1] < 100;
    
    if (hasRevenueFilter || hasEmployeeFilter) {
      result = result
        .map(country => ({
          ...country,
          companies: country.companies.filter(c => {
            const revenue = c.revenue_usd || 0;
            const employees = c.employees || 0;
            if (hasRevenueFilter && (revenue < revenueMin || revenue > revenueMax)) return false;
            if (hasEmployeeFilter && (employees < employeeMin || employees > employeeMax)) return false;
            return true;
          })
        }))
        .filter(country => country.companies.length > 0);
    }
    
    
    // Apply text search filter
    if (searchFilter.trim()) {
      const filter = searchFilter.toLowerCase();
      result = result
        .map(country => ({
          ...country,
          companies: country.companies.filter(c => 
            c.name.toLowerCase().includes(filter) ||
            country.name.toLowerCase().includes(filter) ||
            c.executives.some(e => e.name.toLowerCase().includes(filter) || e.title.toLowerCase().includes(filter))
          )
        }))
        .filter(country => country.companies.length > 0 || country.name.toLowerCase().includes(filter));
    }
    
    return result;
  }, [countriesData, searchFilter, revenueFilterRange, employeeFilterRange]);

  const toggleCountry = (countryName: string) => {
    setExpandedCountries(prev => {
      const next = new Set(prev);
      if (next.has(countryName)) {
        next.delete(countryName);
      } else {
        next.add(countryName);
        
        // Pan and zoom map to this country
        const country = countriesData.find(c => c.name === countryName);
        if (country && country.companies.length > 0) {
          const map = (window as any).leafletMap;
          if (map) {
            const validCoords = country.companies
              .filter(c => (c.lat !== 0 || c.lng !== 0) && c.lat !== undefined && c.lng !== undefined)
              .map(c => [Number(c.lat), Number(c.lng)] as [number, number]);
              
            if (validCoords.length > 0) {
              try {
                const bounds = L.latLngBounds(validCoords);
                map.fitBounds(bounds, { padding: [50, 50], maxZoom: 8, animate: true });
              } catch (e) {
                console.error('Error fitting bounds:', e);
              }
            }
          }
        }
      }
      
      // If no countries are expanded, zoom out to fit all companies
      if (next.size === 0) {
        const map = (window as any).leafletMap;
        if (map && companies.length > 0) {
          const validCoords = companies
            .filter(c => (c.lat !== 0 || c.lng !== 0) && c.lat !== undefined && c.lng !== undefined)
            .map(c => [Number(c.lat), Number(c.lng)] as [number, number]);
            
          if (validCoords.length > 0) {
            try {
              const bounds = L.latLngBounds(validCoords);
              map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12, animate: true });
            } catch (e) {
              console.error('Error fitting bounds:', e);
            }
          }
        }
      }
      
      return next;
    });
  };

  const toggleCompany = (companyId: string) => {
    setExpandedCompanies(prev => {
      const next = new Set(prev);
      if (next.has(companyId)) {
        next.delete(companyId);
      } else {
        next.add(companyId);
      }
      return next;
    });
  };

  const totalCompanies = companies.length;
  const totalExecutives = executives.length;

  return (
    <div 
      className={`
        h-full bg-background/95 backdrop-blur-sm border-r border-border flex flex-col shadow-xl z-10 transition-all duration-300 relative shrink-0
        ${!isOpen ? 'w-0 border-r-0' : ''}
      `}
      style={{ width: isOpen ? width : 0, minWidth: isOpen ? 280 : 0 }}
    >
      <Button
        variant="secondary"
        size="icon"
        onClick={onToggle}
        className="absolute -right-8 top-4 h-8 w-8 rounded-l-none rounded-r-md border border-l-0 border-border shadow-md z-50 flex items-center justify-center bg-background"
        aria-label={isOpen ? "Collapse panel" : "Expand panel"}
        data-testid="button-toggle-left-panel"
      >
        {isOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </Button>

      <div className={`flex flex-col h-full overflow-hidden ${!isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <div className="p-4 border-b border-border min-w-[280px]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <img src={logoImage} alt="Logo" className="h-6 w-auto" />
              <h2 className="text-lg font-serif font-bold text-foreground">Results</h2>
              {onToggleFullscreen && (
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={onToggleFullscreen}
                        className="h-6 w-6"
                        data-testid="button-fullscreen-left-panel"
                      >
                        {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      {isFullscreen ? 'Exit full screen' : 'Full screen'}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <div className="flex gap-1">
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleEnrichAll}
                      disabled={isEnriching || totalCompanies === 0}
                      className="h-7 px-2 text-xs"
                      data-testid="button-enrich-all"
                    >
                      {isEnriching ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Zap className="h-3 w-3" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {isEnriching ? 'Enriching...' : 'Enrich all companies with revenue, employees & executives'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddForm(!showAddForm)}
                className="h-7 px-2 text-xs"
                data-testid="button-add-company"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            </div>
          </div>
          
          {/* Tab Navigation */}
          <div className="flex gap-1 mb-3 p-1 bg-muted/40 rounded-lg">
            <button
              onClick={() => setActiveTab('map')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                activeTab === 'map'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              data-testid="tab-map-view"
            >
              <MapIcon className="h-3.5 w-3.5" />
              Map View
            </button>
            <button
              onClick={() => setActiveTab('table')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                activeTab === 'table'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              data-testid="tab-table-view"
            >
              <Table className="h-3.5 w-3.5" />
              Table View
            </button>
          </div>
          
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {filteredCountries.length} countries
            </span>
            <span className="flex items-center gap-1">
              <Building2 className="h-3 w-3" /> {totalCompanies} companies
            </span>
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" /> {totalExecutives} executives
            </span>
          </div>
          
          {showAddForm && (
            <form onSubmit={handleAddCompany} className="mt-3 p-3 bg-muted/30 rounded-lg border border-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Add New Company</span>
                <button type="button" onClick={() => setShowAddForm(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <Input
                placeholder="Company name *"
                value={newCompany.name}
                onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })}
                className="h-8 text-xs"
                data-testid="input-new-company-name"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="City"
                  value={newCompany.hq_city}
                  onChange={(e) => setNewCompany({ ...newCompany, hq_city: e.target.value })}
                  className="h-8 text-xs"
                />
                <div className="relative" ref={countryDropdownRef}>
                  <Input
                    placeholder="Country"
                    value={newCompany.hq_country}
                    onChange={(e) => {
                      setNewCompany({ ...newCompany, hq_country: e.target.value });
                      setCountryDropdownOpen(true);
                    }}
                    onFocus={() => setCountryDropdownOpen(true)}
                    className="h-8 text-xs"
                    data-testid="input-country-dropdown"
                  />
                  {countryDropdownOpen && (
                    <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-40 overflow-auto">
                      {countryDropdownOptions.filter(c => 
                        c.toLowerCase().includes(newCompany.hq_country.toLowerCase())
                      ).slice(0, 10).map(country => (
                        <button
                          key={country}
                          type="button"
                          onClick={() => {
                            setNewCompany({ ...newCompany, hq_country: country });
                            setCountryDropdownOpen(false);
                          }}
                          className="w-full text-left px-2 py-1 text-xs hover:bg-muted/50 flex items-center gap-1"
                        >
                          {country}
                        </button>
                      ))}
                      {countryDropdownOptions.filter(c => 
                        c.toLowerCase().includes(newCompany.hq_country.toLowerCase())
                      ).length === 0 && (
                        <div className="px-2 py-1 text-xs text-muted-foreground">No countries found</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Revenue (USD)"
                  type="number"
                  value={newCompany.revenue_usd}
                  onChange={(e) => setNewCompany({ ...newCompany, revenue_usd: e.target.value })}
                  className="h-8 text-xs"
                />
                <Input
                  placeholder="Employees"
                  type="number"
                  value={newCompany.employees}
                  onChange={(e) => setNewCompany({ ...newCompany, employees: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <Button type="submit" size="sm" className="w-full h-8 text-xs" disabled={isAdding} data-testid="button-submit-add-company">
                {isAdding ? 'Adding...' : 'Add Company'}
              </Button>
            </form>
          )}
        </div>

        {/* Map View Content */}
        {activeTab === 'map' && (
          <>
        <div className="p-3 border-b border-border bg-muted/30 min-w-[280px]">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search countries, companies, executives..." 
              className="pl-9 h-9 text-sm bg-background"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              data-testid="input-filter-panel"
            />
          </div>
          
          {/* Revenue & Employee Range Filters */}
          <div className="mt-3 space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <DollarSign className="h-3 w-3" />
                  Revenue Range
                </span>
                <span className="font-medium text-foreground">
                  {revenueFilterRange[0] === 0 && revenueFilterRange[1] === 100 
                    ? 'All' 
                    : `$${revenueFilterRange[0] * 50}M - $${revenueFilterRange[1] >= 100 ? '5B+' : `${revenueFilterRange[1] * 50}M`}`}
                </span>
              </div>
              <Slider
                value={revenueFilterRange}
                onValueChange={(value) => setRevenueFilterRange(value as [number, number])}
                min={0}
                max={100}
                step={1}
                className="cursor-pointer"
                data-testid="slider-revenue-filter"
              />
            </div>
            
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Users className="h-3 w-3" />
                  Employee Range
                </span>
                <span className="font-medium text-foreground">
                  {employeeFilterRange[0] === 0 && employeeFilterRange[1] === 100 
                    ? 'All' 
                    : `${(employeeFilterRange[0] * 100).toLocaleString()} - ${employeeFilterRange[1] >= 100 ? '10K+' : (employeeFilterRange[1] * 100).toLocaleString()}`}
                </span>
              </div>
              <Slider
                value={employeeFilterRange}
                onValueChange={(value) => setEmployeeFilterRange(value as [number, number])}
                min={0}
                max={100}
                step={1}
                className="cursor-pointer"
                data-testid="slider-employee-filter"
              />
            </div>
            
          </div>
        </div>

        {/* Discovery Status Banner */}
        {discoveryStatus && discoveryStatus !== 'complete' && (
          <div 
            className={`mx-2 mb-2 p-3 rounded-lg border flex items-start gap-2 ${
              discoveryStatus === 'degraded' 
                ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' 
                : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
            }`}
            data-testid="discovery-status-banner"
          >
            {discoveryStatus === 'degraded' ? (
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            ) : (
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-medium ${
                discoveryStatus === 'degraded' 
                  ? 'text-amber-800 dark:text-amber-200' 
                  : 'text-blue-800 dark:text-blue-200'
              }`}>
                {discoveryStatus === 'degraded' ? 'Results may be limited' : 'Partial results'}
              </p>
              {degradationReasons && degradationReasons.length > 0 && (
                <p className={`text-xs mt-0.5 ${
                  discoveryStatus === 'degraded' 
                    ? 'text-amber-700 dark:text-amber-300' 
                    : 'text-blue-700 dark:text-blue-300'
                }`}>
                  {degradationReasons[0]}
                </p>
              )}
            </div>
            <button 
              onClick={() => clearDiscoveryStatus()} 
              className="text-muted-foreground hover:text-foreground"
              data-testid="dismiss-discovery-banner"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        <ScrollArea className="flex-1 w-full">
          <div className="p-2 space-y-1 min-w-[280px]">
            {filteredCountries.map((country) => {
              const isCountryExpanded = expandedCountries.has(country.name);
              // Only sum known revenues (exclude null/0 from totals)
              const companiesWithRevenue = country.companies.filter(c => c.revenue_usd && c.revenue_usd > 0);
              const totalRevenue = companiesWithRevenue.reduce((sum, c) => sum + (c.revenue_usd || 0), 0);
              const unknownCount = country.companies.length - companiesWithRevenue.length;
              
              const isCountryHidden = hiddenCountries.has(country.name);
              
              return (
                <div key={country.name} className="rounded-lg overflow-hidden">
                  <div
                    className="flex items-center gap-2 p-3 cursor-pointer transition-all duration-200 rounded-lg hover:bg-muted/50 border border-transparent group/country"
                    data-testid={`row-country-${country.name}`}
                  >
                    <ChevronRight 
                      className={`h-4 w-4 shrink-0 transition-transform duration-200 text-muted-foreground ${isCountryExpanded ? 'rotate-90' : ''}`}
                      onClick={() => toggleCountry(country.name)}
                    />
                    <div className="flex-1 min-w-0" onClick={() => toggleCountry(country.name)}>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate flex-1 min-w-0" title={country.name}>
                          {country.name}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {country.companies.length} {country.companies.length === 1 ? 'company' : 'companies'} • {totalRevenue > 0 ? `$${(totalRevenue / 1000000000).toFixed(1)}B` : 'Unknown'}{unknownCount > 0 && totalRevenue > 0 ? ` (+${unknownCount} unknown)` : ''}
                      </div>
                    </div>
                    <TooltipProvider delayDuration={0}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleCountryVisibility(country.name);
                            }}
                            className={`p-1.5 rounded-md transition-all shrink-0 ${
                              isCountryHidden 
                                ? 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50' 
                                : 'text-primary/70 hover:text-primary hover:bg-primary/10'
                            }`}
                            data-testid={`button-visibility-country-${country.name}`}
                          >
                            {isCountryHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="text-xs">
                          {isCountryHidden ? 'Show on map' : 'Hide from map'}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>

                  {isCountryExpanded && (
                    <div className="ml-4 pl-4 border-l-2 border-border/50 space-y-1 py-1">
                      {country.companies.map((company) => {
                        const isCompanyExpanded = expandedCompanies.has(company.id);
                        const isHighlighted = selectedCompanyId === company.id;
                        const isCompanyHidden = hiddenCompanies.has(company.id) || isCountryHidden;
                        
                        const companyColor = company.color || '#1e3a8a';
                        return (
                          <div key={company.id} className="group/company">
                            <div
                              className={`
                                flex items-center gap-2 p-2.5 rounded-md cursor-pointer transition-all duration-200
                                ${isHighlighted ? '' : 'hover:bg-muted/40 border border-transparent'}
                              `}
                              style={isHighlighted ? { backgroundColor: `${companyColor}20`, borderLeft: `3px solid ${companyColor}`, borderRadius: '6px' } : undefined}
                              onClick={() => {
                                toggleCompany(company.id);
                                selectCompany(company.id);
                              }}
                              data-testid={`row-company-${company.id}`}
                            >
                              <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${isHighlighted ? '' : 'text-muted-foreground'} ${isCompanyExpanded ? 'rotate-90' : ''}`} style={isHighlighted ? { color: companyColor } : undefined} />
                              <div className="flex-1 min-w-0">
                                <div className={`font-medium text-sm truncate`} style={isHighlighted ? { color: companyColor } : undefined} title={company.name}>
                                  {company.name}
                                </div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {company.revenue_usd ? `$${(company.revenue_usd / 1000000000).toFixed(1)}B` : 'Unknown'} • {company.employees ? `${company.employees.toLocaleString()} emp` : 'Unknown'} • {company.executives.length} exec{company.executives.length !== 1 ? 's' : ''}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <TooltipProvider delayDuration={0}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium whitespace-nowrap cursor-help ${
                                        company.confidence >= 7 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 
                                        company.confidence >= 4 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 
                                        'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                      }`}>
                                        {company.confidence}/10
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="left" className="text-xs max-w-[200px]">
                                      Research confidence based on source quality
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleCompanyVisibility(company.id);
                                  }}
                                  className={`p-1 rounded transition-all ${
                                    isCompanyHidden 
                                      ? 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50' 
                                      : 'text-primary/70 hover:text-primary hover:bg-primary/10'
                                  }`}
                                  data-testid={`button-visibility-company-${company.id}`}
                                >
                                  {isCompanyHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                </button>
                                <button
                                  onClick={(e) => handleDeleteCompany(e, company.id, company.name)}
                                  className="opacity-0 group-hover/company:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-all"
                                  title="Delete company"
                                  data-testid={`button-delete-company-${company.id}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            {isCompanyExpanded && (
                              <div className="ml-5 pl-3 border-l border-border/30 space-y-0.5 py-1">
                                {company.executives.map((exec) => {
                                  const isExecSelected = selectedExecutiveId === exec.id;
                                  return (
                                  <div
                                    key={exec.id}
                                    className={`flex items-center gap-2 p-2 rounded transition-colors cursor-pointer group/exec ${isExecSelected ? '' : 'hover:bg-muted/30'}`}
                                    style={isExecSelected ? { backgroundColor: `${companyColor}20`, borderLeft: `3px solid ${companyColor}` } : undefined}
                                    onClick={(e) => handleSelectExecutive(e, exec.id, company.id)}
                                    data-testid={`exec-${exec.id}`}
                                  >
                                    <div className={`relative h-6 w-6 rounded-full flex items-center justify-center shrink-0 transition-all ${exec.isEnriched ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-muted'}`}>
                                      <User className={`h-3 w-3 ${exec.isEnriched ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`} />
                                      {exec.isEnriched && (
                                        <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 flex items-center justify-center ring-1 ring-background">
                                          <CheckCircle2 className="h-2 w-2 text-white" />
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0 overflow-hidden">
                                      <div className="flex items-center gap-1 min-w-0">
                                        <span className="text-xs font-medium truncate group-hover/exec:text-primary transition-colors" title={exec.name}>
                                          {exec.name}
                                        </span>
                                        {exec.isEnriched && (
                                          <span title={`Enriched via ${exec.enrichmentSource || 'external source'}`} className="shrink-0">
                                            <Sparkles className="h-2.5 w-2.5 text-emerald-500" />
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[10px] text-muted-foreground truncate" title={exec.title}>
                                        {exec.title}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0 w-14 justify-end">
                                      <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium whitespace-nowrap ${
                                        exec.confidence >= 7 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 
                                        exec.confidence >= 4 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 
                                        'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                      }`}>
                                        {exec.confidence}/10
                                      </div>
                                    </div>
                                    <button
                                      onClick={(e) => handleDeleteExecutive(e, exec.id, exec.name)}
                                      className="opacity-0 group-hover/exec:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-all shrink-0"
                                      title="Delete executive"
                                      data-testid={`button-delete-exec-${exec.id}`}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                );
                                })}
                                
                                {showAddExecForm === company.id ? (
                                  <form onSubmit={(e) => handleAddExecutive(e, company.id)} className="p-2 bg-muted/20 rounded space-y-1.5">
                                    <Input
                                      placeholder="Name *"
                                      value={newExecutive.name}
                                      onChange={(e) => setNewExecutive({ ...newExecutive, name: e.target.value })}
                                      className="h-7 text-xs"
                                      autoFocus
                                    />
                                    <Input
                                      placeholder="Title"
                                      value={newExecutive.title}
                                      onChange={(e) => setNewExecutive({ ...newExecutive, title: e.target.value })}
                                      className="h-7 text-xs"
                                    />
                                    <div className="flex gap-1">
                                      <Button type="submit" size="sm" className="h-6 text-[10px] flex-1" disabled={isAddingExec}>
                                        {isAddingExec ? 'Adding...' : 'Add'}
                                      </Button>
                                      <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setShowAddExecForm(null)}>
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </form>
                                ) : (
                                  <button
                                    onClick={() => setShowAddExecForm(company.id)}
                                    className="w-full flex items-center gap-1 p-2 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                                    data-testid={`button-add-exec-${company.id}`}
                                  >
                                    <Plus className="h-3 w-3" />
                                    Add Executive
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredCountries.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <img src={logoImage} alt="Logo" className="h-10 w-auto mx-auto mb-2 opacity-50" />
                <p className="text-sm">No results found</p>
                <p className="text-xs mt-1">Try a different search term</p>
              </div>
            )}
          </div>
        </ScrollArea>
          </>
        )}

        {/* Table View Content */}
        {activeTab === 'table' && (
          <>
            <div className="p-2 border-b border-border bg-muted/30 min-w-[280px] flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowImportModal(true)}
                className="h-7 text-xs"
                data-testid="button-import-excel"
              >
                <Upload className="h-3 w-3 mr-1" />
                Import
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportToExcel}
                disabled={tableData.length === 0}
                className="h-7 text-xs"
                data-testid="button-export-excel"
              >
                <Download className="h-3 w-3 mr-1" />
                Export
              </Button>
            </div>

            <div className="flex-1 overflow-hidden min-w-[280px]">
              {tableData.length > 0 ? (
                <DataTable
                  data={tableData}
                  selectedCompanyId={selectedCompanyId}
                  selectedExecutiveId={selectedExecutiveId}
                  onRowClick={handleRowClick}
                />
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <img src={logoImage} alt="Logo" className="h-10 w-auto mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No executives found</p>
                  <p className="text-xs mt-1">Add companies and executives to see them here</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Import Modal */}
        {showImportModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowImportModal(false)}>
            <div 
              className="bg-background rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="font-semibold">Import from Excel</h3>
                <button onClick={() => { setShowImportModal(false); setImportPreview(null); setImportText(''); }} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              
              <div className="p-4 flex-1 overflow-auto">
                {!importPreview ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Copy rows from Excel and paste below. Include the header row.
                      The system will auto-detect columns like Name, Company, Title, LinkedIn, Notes, etc.
                    </p>
                    <textarea
                      className="w-full h-48 p-3 text-sm border rounded-md font-mono bg-muted/30"
                      placeholder="Paste your Excel data here..."
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      data-testid="textarea-import"
                    />
                    <Button onClick={handlePasteData} className="w-full" data-testid="button-preview-import">
                      Preview Import
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium text-sm mb-2">Column Mappings</h4>
                      <p className="text-xs text-muted-foreground mb-2">
                        Auto-detected mappings shown below. Use the dropdowns to adjust or assign unmapped columns.
                      </p>
                      <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-auto">
                        {importPreview.headers.map((header, idx) => {
                          const currentMapping = Object.entries(importPreview.mappings).find(([, h]) => h === header)?.[0] || '';
                          return (
                            <div key={idx} className="flex items-center gap-2 text-xs">
                              <span className="font-mono bg-muted/50 px-2 py-1 rounded min-w-[120px] truncate" title={header}>
                                {header}
                              </span>
                              <span className="text-muted-foreground">→</span>
                              <select
                                className="flex-1 border rounded px-2 py-1 text-xs bg-background"
                                value={currentMapping}
                                onChange={(e) => {
                                  const newMappings = { ...importPreview.mappings };
                                  Object.keys(newMappings).forEach(k => {
                                    if (newMappings[k] === header) delete newMappings[k];
                                  });
                                  if (e.target.value) {
                                    newMappings[e.target.value] = header;
                                  }
                                  setImportPreview({ ...importPreview, mappings: newMappings });
                                }}
                                data-testid={`mapping-select-${idx}`}
                              >
                                <option value="">-- Custom Field (keep as-is) --</option>
                                <option value="name" disabled={!!importPreview.mappings.name && importPreview.mappings.name !== header}>Name</option>
                                <option value="company" disabled={!!importPreview.mappings.company && importPreview.mappings.company !== header}>Company</option>
                                <option value="title" disabled={!!importPreview.mappings.title && importPreview.mappings.title !== header}>Title</option>
                                <option value="country" disabled={!!importPreview.mappings.country && importPreview.mappings.country !== header}>Country</option>
                                <option value="email" disabled={!!importPreview.mappings.email && importPreview.mappings.email !== header}>Email</option>
                                <option value="phone" disabled={!!importPreview.mappings.phone && importPreview.mappings.phone !== header}>Phone</option>
                                <option value="linkedin" disabled={!!importPreview.mappings.linkedin && importPreview.mappings.linkedin !== header}>LinkedIn</option>
                                <option value="notes" disabled={!!importPreview.mappings.notes && importPreview.mappings.notes !== header}>Notes</option>
                                <option value="careerSummary" disabled={!!importPreview.mappings.careerSummary && importPreview.mappings.careerSummary !== header}>Career Summary</option>
                                <option value="remunerationNotes" disabled={!!importPreview.mappings.remunerationNotes && importPreview.mappings.remunerationNotes !== header}>Remuneration</option>
                                <option value="availability" disabled={!!importPreview.mappings.availability && importPreview.mappings.availability !== header}>Status</option>
                                <option value="level" disabled={!!importPreview.mappings.level && importPreview.mappings.level !== header}>Level</option>
                              </select>
                              {currentMapping && (
                                <span className="text-green-600 text-xs shrink-0">Mapped</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {!importPreview.mappings.name && !importPreview.mappings.company && !importPreview.mappings.title && (
                        <p className="text-amber-600 text-xs mt-2">Please map at least one column to Name, Company, or Title to import.</p>
                      )}
                    </div>
                    
                    <div>
                      <h4 className="font-medium text-sm mb-2">Preview ({importPreview.rows.length} rows)</h4>
                      <div className="border rounded-md overflow-auto max-h-48">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/50 sticky top-0">
                            <tr>
                              {importPreview.headers.map((h, i) => {
                                const mapped = Object.entries(importPreview.mappings).find(([, v]) => v === h)?.[0];
                                return (
                                  <th key={i} className={`text-left p-2 font-medium whitespace-nowrap ${mapped ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}`}>
                                    {h}
                                    {mapped && <span className="ml-1 text-[10px] opacity-60">({mapped})</span>}
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {importPreview.rows.slice(0, 5).map((row, i) => (
                              <tr key={i} className="border-b border-border/30">
                                {row.map((cell, j) => (
                                  <td key={j} className="p-2 truncate max-w-[150px]" title={cell}>{cell || '-'}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {importPreview.rows.length > 5 && (
                          <div className="p-2 text-center text-xs text-muted-foreground bg-muted/30">
                            ... and {importPreview.rows.length - 5} more rows
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => { setImportPreview(null); }} className="flex-1">
                        Back
                      </Button>
                      <Button 
                        onClick={handleConfirmImport} 
                        disabled={isImporting || (!importPreview.mappings.name && !importPreview.mappings.company && !importPreview.mappings.title)}
                        className="flex-1"
                        data-testid="button-confirm-import"
                      >
                        {isImporting ? 'Importing...' : `Import ${importPreview.rows.length} Records`}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        <div className="p-2 border-t border-border bg-muted/20 text-[10px] text-center text-muted-foreground min-w-[280px]">
          {filteredCountries.reduce((sum, c) => sum + c.companies.length, 0)} Companies in {filteredCountries.length} Countries
        </div>
      </div>
    </div>
  );
}
