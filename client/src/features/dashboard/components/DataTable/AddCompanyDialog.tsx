import { useState, useCallback, useRef, useEffect } from 'react';
import type { VisibilityState } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppStore, transformAPICompany, transformAPIExecutive } from '@/lib/store';
import { toast } from 'sonner';
import { SectorPickerButton } from './cells/SectorPickerButton';
import { COUNTRIES } from './utils/constants';
import { formatRevenue, formatEmployees, parseRevenueInput } from './utils/formatters';

interface AddCompanyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columnVisibility: VisibilityState;
}

export function AddCompanyDialog({ open, onOpenChange, columnVisibility }: AddCompanyDialogProps) {
  const { addCompany, addExecutive, currentProject, companies } = useAppStore();

  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyCountry, setNewCompanyCountry] = useState('');
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const countryDropdownRef = useRef<HTMLDivElement>(null);
  const [newExecName, setNewExecName] = useState('');
  const [newExecTitle, setNewExecTitle] = useState('');
  const [newSector, setNewSector] = useState('');
  const [newRevenue, setNewRevenue] = useState('');
  const [newEmployees, setNewEmployees] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newLinkedin, setNewLinkedin] = useState('');
  const [newRemunerationNotes, setNewRemunerationNotes] = useState('');
  const [newAvailability, setNewAvailability] = useState('');
  const [newLevel, setNewLevel] = useState('');
  const [matchedCompany, setMatchedCompany] = useState<any>(null);
  const [companySuggestions, setCompanySuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (countryDropdownRef.current && !countryDropdownRef.current.contains(event.target as Node)) {
        setCountryDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchCompanies = useCallback(async (name: string) => {
    if (name.length < 2) {
      setCompanySuggestions([]);
      setMatchedCompany(null);
      return;
    }
    try {
      const exactLocalMatch = companies.find(c =>
        c.name.toLowerCase() === name.toLowerCase().trim()
      );
      if (exactLocalMatch) {
        setMatchedCompany(exactLocalMatch);
        setCompanySuggestions([]);
        setShowSuggestions(false);
        return;
      }
      const localMatches = companies.filter(c =>
        c.name.toLowerCase().includes(name.toLowerCase())
      );
      if (localMatches.length > 0) {
        setCompanySuggestions(localMatches.slice(0, 8));
        setShowSuggestions(true);
        return;
      }
      const res = await fetch(`/api/companies/search?name=${encodeURIComponent(name)}`);
      if (res.ok) {
        const results = await res.json();
        const transformed = results.map((c: any) => transformAPICompany(c));
        const exactDbMatch = transformed.find((c: any) =>
          c.name.toLowerCase() === name.toLowerCase().trim()
        );
        if (exactDbMatch) {
          setMatchedCompany(exactDbMatch);
          setCompanySuggestions([]);
          setShowSuggestions(false);
        } else {
          setCompanySuggestions(transformed.slice(0, 8));
          setShowSuggestions(transformed.length > 0);
        }
      }
    } catch {
      /* ignore */
    }
  }, [companies]);

  const handleCompanyNameChange = useCallback((val: string) => {
    setNewCompanyName(val);
    setMatchedCompany(null);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => searchCompanies(val), 250);
  }, [searchCompanies]);

  const selectSuggestion = useCallback((company: any) => {
    setNewCompanyName(company.name);
    setMatchedCompany(company);
    setShowSuggestions(false);
    setCompanySuggestions([]);
  }, []);

  const resetDialogFields = useCallback(() => {
    setNewCompanyName('');
    setNewCompanyCountry('');
    setNewExecName('');
    setNewExecTitle('');
    setNewSector('');
    setNewRevenue('');
    setNewEmployees('');
    setNewNotes('');
    setNewEmail('');
    setNewPhone('');
    setNewLinkedin('');
    setNewRemunerationNotes('');
    setNewAvailability('');
    setNewLevel('');
    setMatchedCompany(null);
    setCompanySuggestions([]);
  }, []);

  // Reset fields whenever the dialog is opened (preserves origin behavior where
  // the "New Company" button called resetDialogFields() right before opening).
  useEffect(() => {
    if (open) resetDialogFields();
  }, [open, resetDialogFields]);

  const handleAddCompanySubmit = useCallback(async () => {
    if (!newCompanyName.trim()) return;
    setIsSubmitting(true);
    try {
      const searchQueryId = currentProject?.id ? parseInt(currentProject.id) : null;
      let companyId: string;

      if (matchedCompany) {
        const existingInProject = companies.find(c =>
          c.name.toLowerCase() === matchedCompany.name.toLowerCase()
        );
        if (existingInProject) {
          companyId = existingInProject.id;
        } else {
          const res = await fetch('/api/companies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: matchedCompany.name,
              country: matchedCompany.hq_country || 'Unknown',
              sector: matchedCompany.industry || newSector.trim() || 'Unknown',
              region: 'Unknown',
              latitude: String(matchedCompany.lat || 0),
              longitude: String(matchedCompany.lng || 0),
              revenue: String(matchedCompany.revenue_usd || (newRevenue.trim() ? parseRevenueInput(newRevenue) : 0)),
              employees: matchedCompany.employees || (newEmployees.trim() ? parseInt(newEmployees.replace(/[^0-9]/g, '')) || 0 : 0),
              ...(searchQueryId ? { searchQueryId } : {}),
            }),
          });
          if (!res.ok) throw new Error('Failed to create company');
          const company = await res.json();
          const transformed = transformAPICompany(company);
          addCompany(transformed);
          companyId = transformed.id;
        }
      } else {
        const res = await fetch('/api/companies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newCompanyName.trim(),
            country: newCompanyCountry.trim() || 'Unknown',
            sector: newSector.trim() || 'Unknown',
            revenue: newRevenue.trim() ? String(parseRevenueInput(newRevenue)) : undefined,
            employees: newEmployees.trim() ? parseInt(newEmployees.replace(/[^0-9]/g, '')) || 0 : undefined,
            ...(searchQueryId ? { searchQueryId } : {}),
          }),
        });
        if (!res.ok) throw new Error('Failed to create company');
        const company = await res.json();
        const transformed = transformAPICompany(company);
        addCompany(transformed);
        companyId = transformed.id;
      }

      if (newExecName.trim()) {
        const execRes = await fetch('/api/executives', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId: parseInt(companyId),
            name: newExecName.trim(),
            title: newExecTitle.trim() || 'Unknown',
            notes: newNotes.trim() || undefined,
            email: newEmail.trim() || undefined,
            phone: newPhone.trim() || undefined,
            linkedin: newLinkedin.trim() || undefined,
            remunerationNotes: newRemunerationNotes.trim() || undefined,
            availability: newAvailability || undefined,
            level: newLevel || undefined,
          }),
        });
        if (execRes.ok) {
          const exec = await execRes.json();
          addExecutive(transformAPIExecutive(exec, companyId));
        }
      }

      toast.success(matchedCompany ? `Added executive to "${matchedCompany.name}"` : `Created "${newCompanyName.trim()}"`);
      onOpenChange(false);
      resetDialogFields();
    } catch {
      toast.error('Failed to add company');
    } finally {
      setIsSubmitting(false);
    }
  }, [newCompanyName, newCompanyCountry, newExecName, newExecTitle, newSector, newRevenue, newEmployees, newNotes, newEmail, newPhone, newLinkedin, newRemunerationNotes, newAvailability, newLevel, matchedCompany, currentProject, addCompany, addExecutive, companies, resetDialogFields, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-add-company">
        <DialogHeader>
          <DialogTitle>Add Company & Executive</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Company Details</div>
            <div className="space-y-3">
              <div className="relative">
                <Label htmlFor="company-name" className="text-xs font-medium">Company Name *</Label>
                <Input
                  id="company-name"
                  value={newCompanyName}
                  onChange={(e) => handleCompanyNameChange(e.target.value)}
                  onFocus={() => companySuggestions.length > 0 && setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder="Type to search or create new..."
                  className="mt-1"
                  data-testid="input-company-name"
                  autoFocus
                />
                {showSuggestions && companySuggestions.length > 0 && (
                  <div
                    ref={suggestionsRef}
                    className="absolute z-50 mt-1 w-full border border-border rounded-md shadow-lg max-h-48 overflow-auto" style={{ backgroundColor: 'hsl(var(--popover))' }}
                  >
                    {companySuggestions.map((c) => (
                      <button
                        key={c.id}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center justify-between"
                        onMouseDown={(e) => { e.preventDefault(); selectSuggestion(c); }}
                        data-testid={`suggestion-${c.id}`}
                      >
                        <span className="font-medium truncate">{c.name}</span>
                        <span className="text-xs text-muted-foreground ml-2 shrink-0">
                          {c.hq_country !== 'Unknown' ? c.hq_country : ''}
                          {c.revenue_usd > 0 ? ` · ${formatRevenue(c.revenue_usd)}` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {matchedCompany && (
                  <div className="mt-2 p-2 bg-muted/30 rounded-md text-xs space-y-0.5">
                    <div className="text-muted-foreground">Existing company data will be auto-filled:</div>
                    <div>Country: <span className="font-medium">{matchedCompany.hq_country || 'Unknown'}</span></div>
                    <div>Sector: <span className="font-medium">{matchedCompany.industry || 'Unknown'}</span></div>
                    {matchedCompany.revenue_usd > 0 && <div>Revenue: <span className="font-medium">{formatRevenue(matchedCompany.revenue_usd)}</span></div>}
                    {matchedCompany.employees > 0 && <div>Employees: <span className="font-medium">{formatEmployees(matchedCompany.employees)}</span></div>}
                  </div>
                )}
              </div>
              {!matchedCompany && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="relative" ref={countryDropdownRef}>
                      <Label htmlFor="company-country" className="text-xs font-medium">Country</Label>
                      <Input
                        id="company-country"
                        value={newCompanyCountry}
                        onChange={(e) => {
                          setNewCompanyCountry(e.target.value);
                          setCountryDropdownOpen(true);
                        }}
                        onFocus={() => setCountryDropdownOpen(true)}
                        placeholder="Search country..."
                        className="mt-1"
                        autoComplete="off"
                        data-testid="input-company-country"
                      />
                      {countryDropdownOpen && newCompanyCountry.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 border border-border rounded-md shadow-lg max-h-40 overflow-auto" style={{ backgroundColor: 'hsl(var(--popover))' }}>
                          {COUNTRIES.filter(c =>
                            c.toLowerCase().includes(newCompanyCountry.toLowerCase())
                          ).slice(0, 10).map(country => (
                            <button
                              key={country}
                              type="button"
                              onClick={() => {
                                setNewCompanyCountry(country);
                                setCountryDropdownOpen(false);
                              }}
                              className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                            >
                              {country}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {columnVisibility.sector !== false && (
                      <div>
                        <Label className="text-xs font-medium">Sector</Label>
                        <SectorPickerButton value={newSector} onChange={setNewSector} className="mt-1" />
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="company-revenue" className="text-xs font-medium">Revenue (USD)</Label>
                      <Input
                        id="company-revenue"
                        value={newRevenue}
                        onChange={(e) => setNewRevenue(e.target.value)}
                        placeholder="e.g. 500M, 1.2B"
                        className="mt-1"
                        data-testid="input-company-revenue"
                      />
                    </div>
                    <div>
                      <Label htmlFor="company-employees" className="text-xs font-medium">Employees</Label>
                      <Input
                        id="company-employees"
                        value={newEmployees}
                        onChange={(e) => setNewEmployees(e.target.value)}
                        placeholder="e.g. 5000"
                        className="mt-1"
                        data-testid="input-company-employees"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="border-t border-border/40 pt-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Executive Details</div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="exec-name" className="text-xs font-medium">Name</Label>
                  <Input
                    id="exec-name"
                    value={newExecName}
                    onChange={(e) => setNewExecName(e.target.value)}
                    placeholder="e.g. John Smith"
                    className="mt-1"
                    data-testid="input-exec-name"
                  />
                </div>
                <div>
                  <Label htmlFor="exec-title" className="text-xs font-medium">Title</Label>
                  <Input
                    id="exec-title"
                    value={newExecTitle}
                    onChange={(e) => setNewExecTitle(e.target.value)}
                    placeholder="e.g. CEO, CFO"
                    className="mt-1"
                    data-testid="input-exec-title"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {columnVisibility.level !== false && (
                  <div>
                    <Label htmlFor="exec-level" className="text-xs font-medium">Level</Label>
                    <select
                      id="exec-level"
                      value={newLevel}
                      onChange={(e) => setNewLevel(e.target.value)}
                      className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      data-testid="select-exec-level"
                    >
                      <option value="">Select level...</option>
                      <option value="Board">Board</option>
                      <option value="C-Suite">C-Suite</option>
                      <option value="N-1">N-1</option>
                      <option value="N-2">N-2</option>
                    </select>
                  </div>
                )}
                {columnVisibility.availability !== false && (
                  <div>
                    <Label htmlFor="exec-status" className="text-xs font-medium">Status</Label>
                    <select
                      id="exec-status"
                      value={newAvailability}
                      onChange={(e) => setNewAvailability(e.target.value)}
                      className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      data-testid="select-exec-status"
                    >
                      <option value="">Select status...</option>
                      <option value="Interested">Interested</option>
                      <option value="Not Interested">Not Interested</option>
                    </select>
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="exec-notes" className="text-xs font-medium">Notes</Label>
                <Input
                  id="exec-notes"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Any notes about the executive"
                  className="mt-1"
                  data-testid="input-exec-notes"
                />
              </div>
            </div>
          </div>

          {(columnVisibility.email !== false || columnVisibility.phone !== false || columnVisibility.linkedin !== false) && (
            <div className="border-t border-border/40 pt-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Contact Info</div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {columnVisibility.email !== false && (
                    <div>
                      <Label htmlFor="exec-email" className="text-xs font-medium">Email</Label>
                      <Input
                        id="exec-email"
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="john@example.com"
                        className="mt-1"
                        data-testid="input-exec-email"
                      />
                    </div>
                  )}
                  {columnVisibility.phone !== false && (
                    <div>
                      <Label htmlFor="exec-phone" className="text-xs font-medium">Phone</Label>
                      <Input
                        id="exec-phone"
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        placeholder="+971 50 123 4567"
                        className="mt-1"
                        data-testid="input-exec-phone"
                      />
                    </div>
                  )}
                </div>
                {columnVisibility.linkedin !== false && (
                  <div>
                    <Label htmlFor="exec-linkedin" className="text-xs font-medium">LinkedIn</Label>
                    <Input
                      id="exec-linkedin"
                      value={newLinkedin}
                      onChange={(e) => setNewLinkedin(e.target.value)}
                      placeholder="linkedin.com/in/username"
                      className="mt-1"
                      data-testid="input-exec-linkedin"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {columnVisibility.remunerationNotes !== false && (
            <div className="border-t border-border/40 pt-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Compensation</div>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="exec-remuneration" className="text-xs font-medium">Remuneration Notes</Label>
                  <Input
                    id="exec-remuneration"
                    value={newRemunerationNotes}
                    onChange={(e) => setNewRemunerationNotes(e.target.value)}
                    placeholder="e.g. Base 200k, Bonus 50k"
                    className="mt-1"
                    data-testid="input-exec-remuneration"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            size="sm"
            onClick={handleAddCompanySubmit}
            disabled={!newCompanyName.trim() || isSubmitting}
            data-testid="button-submit-add-company"
          >
            {isSubmitting ? 'Adding...' : matchedCompany ? 'Add Executive' : 'Create Company'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
