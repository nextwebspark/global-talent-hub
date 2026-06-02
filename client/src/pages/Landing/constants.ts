export const ALL_FIELD_PATTERNS: Record<string, string[]> = {
  name: ['name', 'full name', 'fullname', 'executive', 'executive name', 'person', 'candidate', 'contact', 'contact name', 'individual', 'first name', 'lastname'],
  company: ['company', 'company name', 'companyname', 'organization', 'organisation', 'employer', 'firm', 'business', 'enterprise', 'corporation', 'entity', 'group', 'current company'],
  title: ['title', 'job title', 'jobtitle', 'position', 'role', 'designation', 'function', 'job role', 'current title', 'current position', 'rank'],
  country: ['country', 'location', 'hq country', 'headquarters', 'hq', 'nation', 'region', 'geography', 'geo', 'territory', 'market'],
  sector: ['sector', 'industry', 'vertical', 'segment', 'business type', 'business sector', 'field', 'domain'],
  revenue: ['revenue', 'annual revenue', 'total revenue', 'turnover', 'sales', 'annual sales', 'gross revenue'],
  employees: ['employees', 'employee count', 'headcount', 'staff count', 'workforce', 'number of employees', 'team size'],
  email: ['email', 'e-mail', 'email address', 'mail', 'email id', 'contact email'],
  phone: ['phone', 'telephone', 'tel', 'mobile', 'cell', 'phone number', 'contact number'],
  linkedin: ['linkedin', 'linkedin url', 'linkedin profile', 'profile url', 'linkedin link'],
  notes: ['notes', 'comments', 'remarks', 'description', 'additional info', 'memo'],
  remunerationNotes: ['remuneration', 'salary', 'compensation', 'pay', 'package', 'total compensation', 'comp'],
  availability: ['availability', 'available', 'status', 'availability status', 'notice period'],
};

export const FIELD_LABELS: Record<string, string> = {
  name: 'Name', company: 'Company', title: 'Title', country: 'Country',
  sector: 'Sector', revenue: 'Revenue', employees: 'Employees',
  email: 'Email', phone: 'Phone', linkedin: 'LinkedIn', notes: 'Notes',
  remunerationNotes: 'Remuneration', availability: 'Status',
};
