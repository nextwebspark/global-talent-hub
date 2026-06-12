export interface TableRowData {
  id: string;
  country: string;
  sector: string;
  revenue: number;
  employees: number;
  name: string;
  title: string;
  notes: string;
  email: string;
  phone: string;
  linkedin: string;
  remunerationNotes: string;
  availability: string;
  level: string;
  gender: string;
  ethnicity: string;
  companyId: string;
  companyName: string;
  companyColor: string;
  companyStatus: string;
  isCompanyRow: boolean;
  customFields?: Record<string, string>;
}

export interface DataTableProps {
  data: TableRowData[];
  selectedCompanyId: string | null;
  selectedExecutiveId: string | null;
  onRowClick: (row: TableRowData) => void;
}
