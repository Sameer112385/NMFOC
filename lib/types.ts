export type UserRole = 'Admin' | 'Cost Controller' | 'Project Manager' | 'Viewer';

export type RiskSeverity = 'High' | 'Medium' | 'Low';
export type RiskStatus = 'Open' | 'In Progress' | 'Closed';

export type Project = {
  id: string;
  project_code: string;
  project_name: string;
  client_name?: string | null;
  project_manager_user_id?: string | null;
  project_manager_name?: string | null;
  project_manager_email?: string | null;
  project_manager_phone?: string | null;
  site_location?: string | null;
  subcontractor_name?: string | null;
  subcontract_po_number?: string | null;
  subcontract_po_amount?: number | null;
  subcontract_scope?: string | null;
  status?: string | null;
  created_at?: string;
};

export type CN41Upload = {
  id: string;
  project_id: string;
  file_name: string;
  file_url: string;
  upload_date: string;
  uploaded_by?: string | null;
  version_no: number;
  is_latest: boolean;
};

export type CN41Row = {
  level: number;
  object_type: string;
  wbs_code?: string;
  wbs_description?: string;
  network?: string;
  activity?: string;
  status?: string;
  actual_cost: number;
  planned_cost: number;
  balance_cost: number;
  actual_work: number;
  remaining_work: number;
  actual_revenue: number | null;
  prrevpl000: number | null;
  raw_data_json: Record<string, string | number | boolean | null>;
};

export type RevenueWBS = {
  id?: string;
  project_id: string;
  upload_id?: string | null;
  wbs_code: string;
  wbs_description: string;
  reporting_wbs_level?: number | null;
  planned_cost: number;
  actual_cost_to_date: number;
  mtd_actual_cost: number;
  ytd_actual_cost: number;
  planned_revenue: number;
  opening_recognized_revenue: number;
  recognized_revenue_to_date: number;
  current_month_revenue_recognition: number;
  mtd_revenue_recognition: number;
  ytd_revenue_recognition: number;
  remaining_revenue: number;
  remaining_cost: number;
  forecast_cost: number;
  forecast_revenue: number;
  forecast_margin: number;
  forecast_margin_percent: number;
  poc_percent: number;
  ytd_margin: number;
  ytd_margin_percent: number;
  mtd_margin: number;
  cost_category_breakdown?: Record<string, number>;
  last_actual_posting_date?: string | null;
  last_sales_order_date?: string | null;
  status: string;
  // Legacy aliases retained during migration so the existing UI can be updated incrementally.
  sap_actual_cost: number;
  sap_planned_cost: number;
  sap_poc_percent: number;
  prrevpl000: number | null;
  revenue_value: number;
  sap_earned_revenue: number;
  pm_pending_cost: number;
  simulated_actual_cost: number;
  simulated_poc_percent: number;
  simulated_revenue: number;
  revenue_difference: number;
  actual_cost_categories?: Record<string, number>;
  reporting_period?: string | null;
};

export type Gr55CostRow = {
  id?: string;
  project_id: string;
  upload_id?: string | null;
  posting_date: string;
  fiscal_year?: number | null;
  fiscal_period?: number | null;
  wbs_code: string;
  wbs_description?: string | null;
  cost_category?: string | null;
  cost_element?: string | null;
  cost_center?: string | null;
  purchasing_document?: string | null;
  amount: number;
  currency?: string | null;
  raw_data_json: Record<string, string | number | boolean | null>;
};

export type HistoricalRevenueRow = {
  id?: string;
  project_id: string;
  upload_id?: string | null;
  posting_date: string;
  fiscal_year?: number | null;
  fiscal_period?: number | null;
  wbs_code: string;
  wbs_description?: string | null;
  cost_element: string;
  amount: number;
  currency?: string | null;
  raw_data_json: Record<string, string | number | boolean | null>;
};

export type SalesOrderRevenueRow = {
  id?: string;
  project_id: string;
  upload_id?: string | null;
  sales_order_number: string;
  sales_order_item?: string | null;
  wbs_code: string;
  wbs_description?: string | null;
  planned_revenue: number;
  amendment_delta: number;
  effective_date?: string | null;
  currency?: string | null;
  raw_data_json: Record<string, string | number | boolean | null>;
};

export type FinancialSummary = {
  project_id: string;
  planned_cost: number;
  planned_revenue: number;
  actual_cost_to_date: number;
  poc_percent: number;
  recognized_revenue_to_date: number;
  remaining_revenue: number;
  remaining_cost: number;
  forecast_margin: number;
  forecast_margin_percent: number;
  mtd_actual_cost: number;
  mtd_revenue_recognition: number;
  mtd_margin: number;
  ytd_actual_cost: number;
  ytd_revenue_recognition: number;
  ytd_margin: number;
  ytd_margin_percent: number;
};

export type ProjectWbsMaster = {
  id?: string;
  project_id: string;
  wbs_code: string;
  wbs_description: string;
  is_revenue_generating: boolean;
  include_in_cost: boolean;
  is_active: boolean;
  remarks?: string | null;
  created_at?: string;
};

export type ProjectManpowerRate = {
  id?: string;
  project_id: string;
  revenue_wbs_code: string;
  work_center?: string | null;
  cost_center?: string | null;
  labor_category: string;
  hourly_rate: number;
  is_active?: boolean;
  created_at?: string;
};


export type ProjectCostElementControl = {
  id?: string;
  project_id: string;
  cost_element: string;
  cost_element_name: string;
  include_in_cost: boolean;
  remarks?: string | null;
  created_at?: string;
};
export type ProjectMaterialMaster = {
  id?: string;
  project_id: string;
  revenue_wbs_code: string;
  material_code: string;
  material_description: string;
  unit_of_measure?: string | null;
  planned_quantity: number;
  unit_price: number;
  is_active?: boolean;
  created_at?: string;
};

export type ProjectSubcontract = {
  id?: string;
  project_id: string;
  package_name: string;
  subcontractor_name: string;
  po_number?: string | null;
  po_amount?: number | null;
  scope?: string | null;
  status?: string | null;
  created_at?: string;
};

export type PMSubcontractLine = {
  id: string;
  project_subcontract_id?: string | null;
  package_name: string;
  subcontractor_name?: string | null;
  coc_reference?: string | null;
  amount: number;
  remarks?: string | null;
};

export type PMManpowerLine = {
  id: string;
  master_id?: string | null;
  revenue_wbs_code?: string | null;
  work_center?: string | null;
  cost_center?: string | null;
  labor_category: string;
  hours_worked: number;
  hourly_rate: number;
  amount: number;
};

export type PMMaterialLine = {
  id: string;
  master_id?: string | null;
  material_code: string;
  material_description: string;
  unit_of_measure?: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
};

export type DailyUpdate = {
  id?: string;
  project_id: string;
  revenue_wbs_id: string;
  update_date: string;
  expected_progress: number;
  activity_name?: string | null;
  today_progress_percent?: number;
  today_completed_quantity?: number;
  pending_material_cost: number;
  pending_subcontractor_cost: number;
  pending_manpower_cost: number;
  pending_equipment_cost?: number;
  total_pending_cost: number;
  subcontract_lines?: PMSubcontractLine[];
  manpower_lines?: PMManpowerLine[];
  material_lines?: PMMaterialLine[];
  remarks?: string | null;
  issue_delay?: string | null;
  submitted_by?: string | null;
  approval_status?: string | null;
  sap_posted?: boolean;
  material_sap_posted?: boolean;
  material_posted_at?: string | null;
  material_posted_by?: string | null;
  material_posting_reference?: string | null;
  material_updated_by?: string | null;
  material_updated_at?: string | null;
  subcontract_sap_posted?: boolean;
  subcontract_posted_at?: string | null;
  subcontract_posted_by?: string | null;
  subcontract_posting_reference?: string | null;
  subcontract_updated_by?: string | null;
  subcontract_updated_at?: string | null;
  manpower_sap_posted?: boolean;
  manpower_posted_at?: string | null;
  manpower_posted_by?: string | null;
  manpower_posting_reference?: string | null;
  manpower_updated_by?: string | null;
  manpower_updated_at?: string | null;
  created_at?: string;
};

export type RiskAlert = {
  id?: string;
  project_id: string;
  wbs_code: string;
  risk_type: string;
  risk_description: string;
  amount: number;
  severity: RiskSeverity;
  suggested_action: string;
  status: RiskStatus;
  created_at?: string;
};

export type SimulationSnapshot = {
  id?: string;
  project_id: string;
  upload_id?: string | null;
  snapshot_date: string;
  total_sap_actual_cost: number;
  total_sap_revenue: number;
  total_pm_pending_cost: number;
  total_simulated_actual_cost: number;
  total_simulated_revenue: number;
  created_at?: string;
};

export type UserProfile = {
  id: string;
  user_id: string;
  full_name: string | null;
  role: UserRole;
  phone?: string | null;
  created_at: string;
  email?: string;
};
