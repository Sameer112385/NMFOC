create table if not exists users_profile (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  full_name text,
  phone text,
  role text not null default 'Viewer',
  created_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  project_code text not null unique,
  project_name text not null,
  client_name text,
  project_manager_user_id uuid,
  project_manager_name text,
  project_manager_email text,
  project_manager_phone text,
  site_location text,
  subcontractor_name text,
  subcontract_po_number text,
  subcontract_po_amount numeric,
  subcontract_scope text,
  status text not null default 'Active',
  created_at timestamptz not null default now()
);

create table if not exists cn41_uploads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  upload_date timestamptz not null default now(),
  uploaded_by uuid,
  version_no integer not null default 1,
  is_latest boolean not null default true
);

create table if not exists cn41_rows (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references cn41_uploads(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  level integer not null,
  object_type text,
  wbs_code text,
  wbs_description text,
  network text,
  activity text,
  status text,
  actual_cost numeric not null default 0,
  planned_cost numeric not null default 0,
  balance_cost numeric not null default 0,
  actual_work numeric not null default 0,
  remaining_work numeric not null default 0,
  prrevpl000 numeric,
  raw_data_json jsonb not null default '{}'::jsonb
);

create table if not exists gr55_uploads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  upload_date timestamptz not null default now(),
  uploaded_by uuid,
  version_no integer not null default 1,
  is_latest boolean not null default true
);

create table if not exists gr55_rows (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references gr55_uploads(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  posting_date date not null,
  fiscal_year integer,
  fiscal_period integer,
  wbs_code text not null,
  wbs_description text,
  cost_category text,
  cost_element text,
  cost_center text,
  purchasing_document text,
  amount numeric not null default 0,
  currency text,
  raw_data_json jsonb not null default '{}'::jsonb
);

create table if not exists sales_order_uploads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  upload_date timestamptz not null default now(),
  uploaded_by uuid,
  version_no integer not null default 1,
  is_latest boolean not null default true
);

create table if not exists sales_order_rows (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references sales_order_uploads(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  sales_order_number text not null,
  sales_order_item text,
  wbs_code text not null,
  wbs_description text,
  planned_revenue numeric not null default 0,
  amendment_delta numeric not null default 0,
  effective_date date,
  currency text,
  raw_data_json jsonb not null default '{}'::jsonb
);

create table if not exists revenue_wbs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  upload_id uuid references cn41_uploads(id) on delete cascade,
  wbs_code text not null,
  wbs_description text,
  reporting_wbs_level integer,
  planned_cost numeric not null default 0,
  actual_cost_to_date numeric not null default 0,
  mtd_actual_cost numeric not null default 0,
  ytd_actual_cost numeric not null default 0,
  planned_revenue numeric not null default 0,
  opening_recognized_revenue numeric not null default 0,
  recognized_revenue_to_date numeric not null default 0,
  current_month_revenue_recognition numeric not null default 0,
  mtd_revenue_recognition numeric not null default 0,
  ytd_revenue_recognition numeric not null default 0,
  remaining_revenue numeric not null default 0,
  remaining_cost numeric not null default 0,
  forecast_cost numeric not null default 0,
  forecast_revenue numeric not null default 0,
  forecast_margin numeric not null default 0,
  forecast_margin_percent numeric not null default 0,
  poc_percent numeric not null default 0,
  ytd_margin numeric not null default 0,
  ytd_margin_percent numeric not null default 0,
  mtd_margin numeric not null default 0,
  cost_category_breakdown jsonb not null default '{}'::jsonb,
  last_actual_posting_date date,
  last_sales_order_date date,
  reporting_period text,
  sap_actual_cost numeric not null default 0,
  sap_planned_cost numeric not null default 0,
  sap_poc_percent numeric not null default 0,
  prrevpl000 numeric,
  revenue_value numeric not null default 0,
  sap_earned_revenue numeric not null default 0,
  pm_pending_cost numeric not null default 0,
  simulated_actual_cost numeric not null default 0,
  simulated_poc_percent numeric not null default 0,
  simulated_revenue numeric not null default 0,
  revenue_difference numeric not null default 0,
  status text not null default 'Stable',
  unique(project_id, wbs_code)
);

create table if not exists project_wbs_master (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  wbs_code text not null,
  wbs_description text,
  is_revenue_generating boolean not null default false,
  include_in_cost boolean not null default true,
  is_active boolean not null default true,
  remarks text,
  created_at timestamptz not null default now(),
  unique(project_id, wbs_code)
);

create table if not exists project_manpower_rates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  revenue_wbs_code text not null,
  work_center text,
  cost_center text,
  labor_category text not null,
  hourly_rate numeric not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);


create table if not exists project_cost_element_control (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  cost_element text not null,
  cost_element_name text,
  include_in_cost boolean not null default true,
  remarks text,
  created_at timestamptz not null default now(),
  unique(project_id, cost_element)
);
create table if not exists project_material_master (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  revenue_wbs_code text not null,
  material_code text not null,
  material_description text not null,
  unit_of_measure text,
  planned_quantity numeric not null default 0,
  unit_price numeric not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists project_subcontracts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  package_name text not null,
  subcontractor_name text not null,
  po_number text,
  po_amount numeric,
  scope text,
  status text not null default 'Active',
  created_at timestamptz not null default now()
);

create table if not exists pm_daily_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  revenue_wbs_id uuid not null references revenue_wbs(id) on delete restrict,
  update_date date not null,
  expected_progress numeric not null default 0,
  activity_name text not null,
  today_progress_percent numeric not null default 0,
  today_completed_quantity numeric not null default 0,
  pending_material_cost numeric not null default 0,
  pending_subcontractor_cost numeric not null default 0,
  pending_manpower_cost numeric not null default 0,
  pending_equipment_cost numeric not null default 0,
  total_pending_cost numeric not null default 0,
  subcontract_lines jsonb not null default '[]'::jsonb,
  manpower_lines jsonb not null default '[]'::jsonb,
  material_lines jsonb not null default '[]'::jsonb,
  remarks text,
  issue_delay text,
  submitted_by text,
  approval_status text not null default 'Pending',
  sap_posted boolean not null default false,
  material_sap_posted boolean not null default false,
  material_posted_at date,
  material_posted_by text,
  material_posting_reference text,
  material_updated_by text,
  material_updated_at timestamptz,
  subcontract_sap_posted boolean not null default false,
  subcontract_posted_at date,
  subcontract_posted_by text,
  subcontract_posting_reference text,
  subcontract_updated_by text,
  subcontract_updated_at timestamptz,
  manpower_sap_posted boolean not null default false,
  manpower_posted_at date,
  manpower_posted_by text,
  manpower_posting_reference text,
  manpower_updated_by text,
  manpower_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists simulation_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  upload_id uuid references cn41_uploads(id) on delete cascade,
  snapshot_date timestamptz not null default now(),
  total_sap_actual_cost numeric not null default 0,
  total_sap_revenue numeric not null default 0,
  total_pm_pending_cost numeric not null default 0,
  total_simulated_actual_cost numeric not null default 0,
  total_simulated_revenue numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists risk_alerts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  wbs_code text not null,
  risk_type text not null,
  risk_description text not null,
  amount numeric not null default 0,
  severity text not null default 'Low',
  suggested_action text not null,
  status text not null default 'Open',
  created_at timestamptz not null default now()
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  wbs_code text not null,
  comment_text text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_cn41_uploads_project_latest on cn41_uploads(project_id, is_latest desc, upload_date desc);
create index if not exists idx_gr55_uploads_project_latest on gr55_uploads(project_id, is_latest desc, upload_date desc);
create index if not exists idx_sales_order_uploads_project_latest on sales_order_uploads(project_id, is_latest desc, upload_date desc);
create index if not exists idx_revenue_wbs_project on revenue_wbs(project_id);
create index if not exists idx_gr55_rows_project on gr55_rows(project_id, posting_date desc, wbs_code);
create index if not exists idx_sales_order_rows_project on sales_order_rows(project_id, effective_date desc, wbs_code);
create index if not exists idx_project_wbs_master_project on project_wbs_master(project_id, wbs_code);
create index if not exists idx_project_subcontracts_project on project_subcontracts(project_id, package_name);
create index if not exists idx_project_manpower_rates_project on project_manpower_rates(project_id, labor_category);
create index if not exists idx_project_material_master_project on project_material_master(project_id, revenue_wbs_code);
create index if not exists idx_project_cost_element_control_project on project_cost_element_control(project_id, cost_element);
create index if not exists idx_pm_updates_project on pm_daily_updates(project_id, update_date desc);
create index if not exists idx_risk_alerts_project on risk_alerts(project_id, severity, created_at desc);

alter table users_profile enable row level security;
alter table projects enable row level security;
alter table cn41_uploads enable row level security;
alter table cn41_rows enable row level security;
alter table gr55_uploads enable row level security;
alter table gr55_rows enable row level security;
alter table sales_order_uploads enable row level security;
alter table sales_order_rows enable row level security;
alter table revenue_wbs enable row level security;
alter table project_wbs_master enable row level security;
alter table project_subcontracts enable row level security;
alter table project_manpower_rates enable row level security;
alter table project_material_master enable row level security;
alter table project_cost_element_control enable row level security;
alter table pm_daily_updates enable row level security;
alter table simulation_snapshots enable row level security;
alter table risk_alerts enable row level security;
alter table comments enable row level security;

-- RLS Policies
-- projects
drop policy if exists "Authenticated users can read" on projects;
create policy "Authenticated users can read" on projects for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can write" on projects;
create policy "Authenticated users can write" on projects for insert with check (auth.role() = 'authenticated');

-- cn41_uploads
drop policy if exists "Authenticated users can read uploads" on cn41_uploads;
create policy "Authenticated users can read uploads" on cn41_uploads for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can write" on cn41_uploads;
create policy "Authenticated users can write" on cn41_uploads for insert with check (auth.role() = 'authenticated');

-- cn41_rows
drop policy if exists "Authenticated users can read rows" on cn41_rows;
create policy "Authenticated users can read rows" on cn41_rows for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can write rows" on cn41_rows;
create policy "Authenticated users can write rows" on cn41_rows for insert with check (auth.role() = 'authenticated');

-- gr55_uploads
drop policy if exists "Authenticated users can read gr55 uploads" on gr55_uploads;
create policy "Authenticated users can read gr55 uploads" on gr55_uploads for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can write gr55 uploads" on gr55_uploads;
create policy "Authenticated users can write gr55 uploads" on gr55_uploads for insert with check (auth.role() = 'authenticated');

-- gr55_rows
drop policy if exists "Authenticated users can read gr55 rows" on gr55_rows;
create policy "Authenticated users can read gr55 rows" on gr55_rows for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can write gr55 rows" on gr55_rows;
create policy "Authenticated users can write gr55 rows" on gr55_rows for insert with check (auth.role() = 'authenticated');

-- sales_order_uploads
drop policy if exists "Authenticated users can read sales order uploads" on sales_order_uploads;
create policy "Authenticated users can read sales order uploads" on sales_order_uploads for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can write sales order uploads" on sales_order_uploads;
create policy "Authenticated users can write sales order uploads" on sales_order_uploads for insert with check (auth.role() = 'authenticated');

-- sales_order_rows
drop policy if exists "Authenticated users can read sales order rows" on sales_order_rows;
create policy "Authenticated users can read sales order rows" on sales_order_rows for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can write sales order rows" on sales_order_rows;
create policy "Authenticated users can write sales order rows" on sales_order_rows for insert with check (auth.role() = 'authenticated');

-- revenue_wbs
drop policy if exists "Authenticated users can read revenue" on revenue_wbs;
create policy "Authenticated users can read revenue" on revenue_wbs for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can write revenue" on revenue_wbs;
create policy "Authenticated users can write revenue" on revenue_wbs for insert with check (auth.role() = 'authenticated');

-- project_wbs_master
drop policy if exists "Authenticated users can read project wbs master" on project_wbs_master;
create policy "Authenticated users can read project wbs master" on project_wbs_master for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can write project wbs master" on project_wbs_master;
create policy "Authenticated users can write project wbs master" on project_wbs_master for insert with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can delete project wbs master" on project_wbs_master;
create policy "Authenticated users can delete project wbs master" on project_wbs_master for delete using (auth.role() = 'authenticated');

-- project_subcontracts
drop policy if exists "Authenticated users can read project subcontracts" on project_subcontracts;
create policy "Authenticated users can read project subcontracts" on project_subcontracts for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can write project subcontracts" on project_subcontracts;
create policy "Authenticated users can write project subcontracts" on project_subcontracts for insert with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can delete project subcontracts" on project_subcontracts;
create policy "Authenticated users can delete project subcontracts" on project_subcontracts for delete using (auth.role() = 'authenticated');

-- project_manpower_rates
drop policy if exists "Authenticated users can read manpower rates" on project_manpower_rates;
create policy "Authenticated users can read manpower rates" on project_manpower_rates for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can write manpower rates" on project_manpower_rates;
create policy "Authenticated users can write manpower rates" on project_manpower_rates for insert with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can delete manpower rates" on project_manpower_rates;
create policy "Authenticated users can delete manpower rates" on project_manpower_rates for delete using (auth.role() = 'authenticated');

-- project_material_master
drop policy if exists "Authenticated users can read material master" on project_material_master;
create policy "Authenticated users can read material master" on project_material_master for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can write material master" on project_material_master;
create policy "Authenticated users can write material master" on project_material_master for insert with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can delete material master" on project_material_master;
create policy "Authenticated users can delete material master" on project_material_master for delete using (auth.role() = 'authenticated');


-- project_cost_element_control
drop policy if exists "Authenticated users can read cost element control" on project_cost_element_control;
create policy "Authenticated users can read cost element control" on project_cost_element_control for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can write cost element control" on project_cost_element_control;
create policy "Authenticated users can write cost element control" on project_cost_element_control for insert with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can delete cost element control" on project_cost_element_control;
create policy "Authenticated users can delete cost element control" on project_cost_element_control for delete using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can update cost element control" on project_cost_element_control;
create policy "Authenticated users can update cost element control" on project_cost_element_control for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
-- pm_daily_updates
drop policy if exists "Authenticated users can read updates" on pm_daily_updates;
create policy "Authenticated users can read updates" on pm_daily_updates for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can write updates" on pm_daily_updates;
create policy "Authenticated users can write updates" on pm_daily_updates for insert with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can update updates" on pm_daily_updates;
create policy "Authenticated users can update updates" on pm_daily_updates for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can delete updates" on pm_daily_updates;
create policy "Authenticated users can delete updates" on pm_daily_updates for delete using (auth.role() = 'authenticated');

-- simulation_snapshots
drop policy if exists "Authenticated users can read snapshots" on simulation_snapshots;
create policy "Authenticated users can read snapshots" on simulation_snapshots for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can write snapshots" on simulation_snapshots;
create policy "Authenticated users can write snapshots" on simulation_snapshots for insert with check (auth.role() = 'authenticated');

-- risk_alerts
drop policy if exists "Authenticated users can read risks" on risk_alerts;
create policy "Authenticated users can read risks" on risk_alerts for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can write risks" on risk_alerts;
create policy "Authenticated users can write risks" on risk_alerts for insert with check (auth.role() = 'authenticated');

-- comments
drop policy if exists "Authenticated users can read comments" on comments;
create policy "Authenticated users can read comments" on comments for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can write comments" on comments;
create policy "Authenticated users can write comments" on comments for insert with check (auth.role() = 'authenticated');

-- Helper function to check user roles in policies
create or replace function public.get_user_role()
returns text as $$
declare
  user_role text;
begin
  select role into user_role
  from public.users_profile
  where user_id = auth.uid()
  limit 1;
  return coalesce(user_role, 'Viewer');
end;
$$ language plpgsql security definer;

-- UPDATE and DELETE policies based on roles
drop policy if exists "Authenticated users can update projects" on projects;
create policy "Authenticated users can update projects" on projects for update using (public.get_user_role() = 'Admin') with check (public.get_user_role() = 'Admin');

drop policy if exists "Authenticated users can delete projects" on projects;
create policy "Authenticated users can delete projects" on projects for delete using (public.get_user_role() = 'Admin');

drop policy if exists "Authenticated users can update project subcontracts" on project_subcontracts;
create policy "Authenticated users can update project subcontracts" on project_subcontracts for update using (public.get_user_role() in ('Admin', 'Cost Controller')) with check (public.get_user_role() in ('Admin', 'Cost Controller'));

drop policy if exists "Authenticated users can update manpower rates" on project_manpower_rates;
create policy "Authenticated users can update manpower rates" on project_manpower_rates for update using (public.get_user_role() in ('Admin', 'Cost Controller')) with check (public.get_user_role() in ('Admin', 'Cost Controller'));

drop policy if exists "Authenticated users can update material master" on project_material_master;
create policy "Authenticated users can update material master" on project_material_master for update using (public.get_user_role() in ('Admin', 'Cost Controller')) with check (public.get_user_role() in ('Admin', 'Cost Controller'));

drop policy if exists "Authenticated users can update project wbs master" on project_wbs_master;
create policy "Authenticated users can update project wbs master" on project_wbs_master for update using (public.get_user_role() in ('Admin', 'Cost Controller')) with check (public.get_user_role() in ('Admin', 'Cost Controller'));
