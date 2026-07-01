-- Run supabase/schema.sql first.
-- Then run the extra setup below in the Supabase SQL editor.

create extension if not exists pgcrypto;

alter table if exists projects
  add column if not exists project_manager_user_id uuid,
  add column if not exists project_manager_name text,
  add column if not exists project_manager_email text,
  add column if not exists project_manager_phone text,
  add column if not exists site_location text,
  add column if not exists subcontractor_name text,
  add column if not exists subcontract_po_number text,
  add column if not exists subcontract_po_amount numeric,
  add column if not exists subcontract_scope text;

alter table if exists users_profile
  add column if not exists phone text;

alter table if exists pm_daily_updates
  alter column activity_name set default 'PM Update',
  alter column today_progress_percent set default 0,
  alter column today_completed_quantity set default 0,
  alter column pending_equipment_cost set default 0,
  alter column sap_posted set default false;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'pm_daily_updates'
      and constraint_type = 'FOREIGN KEY'
      and constraint_name = 'pm_daily_updates_revenue_wbs_id_fkey'
  ) then
    alter table pm_daily_updates drop constraint pm_daily_updates_revenue_wbs_id_fkey;
  end if;

  alter table pm_daily_updates
    add constraint pm_daily_updates_revenue_wbs_id_fkey
    foreign key (revenue_wbs_id) references revenue_wbs(id) on delete restrict;
end $$;

alter table if exists pm_daily_updates
  add column if not exists subcontract_lines jsonb not null default '[]'::jsonb,
  add column if not exists manpower_lines jsonb not null default '[]'::jsonb,
  add column if not exists material_lines jsonb not null default '[]'::jsonb,
  add column if not exists material_sap_posted boolean not null default false,
  add column if not exists material_posted_at date,
  add column if not exists material_posted_by text,
  add column if not exists material_posting_reference text,
  add column if not exists material_updated_by text,
  add column if not exists material_updated_at timestamptz,
  add column if not exists subcontract_sap_posted boolean not null default false,
  add column if not exists subcontract_posted_at date,
  add column if not exists subcontract_posted_by text,
  add column if not exists subcontract_posting_reference text,
  add column if not exists subcontract_updated_by text,
  add column if not exists subcontract_updated_at timestamptz,
  add column if not exists manpower_sap_posted boolean not null default false,
  add column if not exists manpower_posted_at date,
  add column if not exists manpower_posted_by text,
  add column if not exists manpower_posting_reference text,
  add column if not exists manpower_updated_by text,
  add column if not exists manpower_updated_at timestamptz;

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

alter table if exists project_manpower_rates
  add column if not exists revenue_wbs_code text;


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

alter table if exists revenue_wbs
  add column if not exists reporting_wbs_level integer,
  add column if not exists planned_cost numeric not null default 0,
  add column if not exists actual_cost_to_date numeric not null default 0,
  add column if not exists mtd_actual_cost numeric not null default 0,
  add column if not exists ytd_actual_cost numeric not null default 0,
  add column if not exists planned_revenue numeric not null default 0,
  add column if not exists opening_recognized_revenue numeric not null default 0,
  add column if not exists recognized_revenue_to_date numeric not null default 0,
  add column if not exists current_month_revenue_recognition numeric not null default 0,
  add column if not exists mtd_revenue_recognition numeric not null default 0,
  add column if not exists ytd_revenue_recognition numeric not null default 0,
  add column if not exists remaining_revenue numeric not null default 0,
  add column if not exists remaining_cost numeric not null default 0,
  add column if not exists forecast_cost numeric not null default 0,
  add column if not exists forecast_revenue numeric not null default 0,
  add column if not exists forecast_margin numeric not null default 0,
  add column if not exists forecast_margin_percent numeric not null default 0,
  add column if not exists poc_percent numeric not null default 0,
  add column if not exists ytd_margin numeric not null default 0,
  add column if not exists ytd_margin_percent numeric not null default 0,
  add column if not exists mtd_margin numeric not null default 0,
  add column if not exists cost_category_breakdown jsonb not null default '{}'::jsonb,
  add column if not exists last_actual_posting_date date,
  add column if not exists last_sales_order_date date,
  add column if not exists reporting_period text;

create index if not exists idx_project_manpower_rates_project on project_manpower_rates(project_id, labor_category);
create index if not exists idx_project_material_master_project on project_material_master(project_id, revenue_wbs_code);
create index if not exists idx_project_cost_element_control_project on project_cost_element_control(project_id, cost_element);
create index if not exists idx_project_subcontracts_project on project_subcontracts(project_id, package_name);
create index if not exists idx_project_wbs_master_project on project_wbs_master(project_id, wbs_code);
create index if not exists idx_gr55_uploads_project_latest on gr55_uploads(project_id, is_latest desc, upload_date desc);
create index if not exists idx_sales_order_uploads_project_latest on sales_order_uploads(project_id, is_latest desc, upload_date desc);
create index if not exists idx_gr55_rows_project on gr55_rows(project_id, posting_date desc, wbs_code);

-- Add purchasing_document column to gr55_rows (safe migration, nullable)
alter table if exists gr55_rows add column if not exists purchasing_document text;
create index if not exists idx_gr55_rows_purchasing_doc on gr55_rows(project_id, purchasing_document);
create index if not exists idx_sales_order_rows_project on sales_order_rows(project_id, effective_date desc, wbs_code);

alter table if exists project_manpower_rates enable row level security;
alter table if exists project_material_master enable row level security;
alter table if exists project_cost_element_control enable row level security;
alter table if exists project_subcontracts enable row level security;
alter table if exists project_wbs_master enable row level security;
alter table if exists pm_daily_updates enable row level security;
alter table if exists gr55_uploads enable row level security;
alter table if exists gr55_rows enable row level security;
alter table if exists sales_order_uploads enable row level security;
alter table if exists sales_order_rows enable row level security;

drop policy if exists "Authenticated users can read manpower rates" on project_manpower_rates;
create policy "Authenticated users can read manpower rates"
on project_manpower_rates
for select
to authenticated
using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can write manpower rates" on project_manpower_rates;
create policy "Authenticated users can write manpower rates"
on project_manpower_rates
for insert
to authenticated
with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can delete manpower rates" on project_manpower_rates;
create policy "Authenticated users can delete manpower rates"
on project_manpower_rates
for delete
to authenticated
using (auth.role() = 'authenticated');


-- project_cost_element_control
drop policy if exists "Authenticated users can read cost element control" on project_cost_element_control;
create policy "Authenticated users can read cost element control" on project_cost_element_control for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can write cost element control" on project_cost_element_control;
create policy "Authenticated users can write cost element control" on project_cost_element_control for insert with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can delete cost element control" on project_cost_element_control;
create policy "Authenticated users can delete cost element control" on project_cost_element_control for delete using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can update cost element control" on project_cost_element_control;
create policy "Authenticated users can update cost element control" on project_cost_element_control for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "Authenticated users can read material master" on project_material_master;
create policy "Authenticated users can read material master"
on project_material_master
for select
to authenticated
using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can write material master" on project_material_master;
create policy "Authenticated users can write material master"
on project_material_master
for insert
to authenticated
with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can delete material master" on project_material_master;
create policy "Authenticated users can delete material master"
on project_material_master
for delete
to authenticated
using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read project subcontracts" on project_subcontracts;
create policy "Authenticated users can read project subcontracts"
on project_subcontracts
for select
to authenticated
using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can write project subcontracts" on project_subcontracts;
create policy "Authenticated users can write project subcontracts"
on project_subcontracts
for insert
to authenticated
with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can delete project subcontracts" on project_subcontracts;
create policy "Authenticated users can delete project subcontracts"
on project_subcontracts
for delete
to authenticated
using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read project wbs master" on project_wbs_master;
create policy "Authenticated users can read project wbs master"
on project_wbs_master
for select
to authenticated
using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can write project wbs master" on project_wbs_master;
create policy "Authenticated users can write project wbs master"
on project_wbs_master
for insert
to authenticated
with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can delete project wbs master" on project_wbs_master;
create policy "Authenticated users can delete project wbs master"
on project_wbs_master
for delete
to authenticated
using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read updates" on pm_daily_updates;
create policy "Authenticated users can read updates"
on pm_daily_updates
for select
to authenticated
using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can write updates" on pm_daily_updates;
create policy "Authenticated users can write updates"
on pm_daily_updates
for insert
to authenticated
with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can update updates" on pm_daily_updates;
create policy "Authenticated users can update updates"
on pm_daily_updates
for update
to authenticated
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can delete updates" on pm_daily_updates;
create policy "Authenticated users can delete updates"
on pm_daily_updates
for delete
to authenticated
using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read gr55 uploads" on gr55_uploads;
create policy "Authenticated users can read gr55 uploads"
on gr55_uploads
for select
to authenticated
using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can write gr55 uploads" on gr55_uploads;
create policy "Authenticated users can write gr55 uploads"
on gr55_uploads
for insert
to authenticated
with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read gr55 rows" on gr55_rows;
create policy "Authenticated users can read gr55 rows"
on gr55_rows
for select
to authenticated
using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can write gr55 rows" on gr55_rows;
create policy "Authenticated users can write gr55 rows"
on gr55_rows
for insert
to authenticated
with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read sales order uploads" on sales_order_uploads;
create policy "Authenticated users can read sales order uploads"
on sales_order_uploads
for select
to authenticated
using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can write sales order uploads" on sales_order_uploads;
create policy "Authenticated users can write sales order uploads"
on sales_order_uploads
for insert
to authenticated
with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read sales order rows" on sales_order_rows;
create policy "Authenticated users can read sales order rows"
on sales_order_rows
for select
to authenticated
using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can write sales order rows" on sales_order_rows;
create policy "Authenticated users can write sales order rows"
on sales_order_rows
for insert
to authenticated
with check (auth.role() = 'authenticated');

insert into storage.buckets (id, name, public)
values ('cn41-files', 'cn41-files', true)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public;

drop policy if exists "Authenticated users can upload CN41 files" on storage.objects;
create policy "Authenticated users can upload CN41 files"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'cn41-files');

drop policy if exists "Authenticated users can read CN41 files" on storage.objects;
create policy "Authenticated users can read CN41 files"
on storage.objects
for select
to authenticated
using (bucket_id = 'cn41-files');

drop policy if exists "Authenticated users can update CN41 files" on storage.objects;
create policy "Authenticated users can update CN41 files"
on storage.objects
for update
to authenticated
using (bucket_id = 'cn41-files')
with check (bucket_id = 'cn41-files');

drop policy if exists "Authenticated users can delete CN41 files" on storage.objects;
create policy "Authenticated users can delete CN41 files"
on storage.objects
for delete
to authenticated
using (bucket_id = 'cn41-files');

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

-- Drop existing policies to prevent conflicts
drop policy if exists "Authenticated users can update projects" on projects;
drop policy if exists "Authenticated users can delete projects" on projects;
drop policy if exists "Authenticated users can update project subcontracts" on project_subcontracts;
drop policy if exists "Authenticated users can update manpower rates" on project_manpower_rates;
drop policy if exists "Authenticated users can update material master" on project_material_master;
drop policy if exists "Authenticated users can update project wbs master" on project_wbs_master;

-- UPDATE and DELETE policies based on roles
create policy "Authenticated users can update projects" on projects for update using (public.get_user_role() = 'Admin') with check (public.get_user_role() = 'Admin');
create policy "Authenticated users can delete projects" on projects for delete using (public.get_user_role() = 'Admin');
create policy "Authenticated users can update project subcontracts" on project_subcontracts for update using (public.get_user_role() in ('Admin', 'Cost Controller')) with check (public.get_user_role() in ('Admin', 'Cost Controller'));
create policy "Authenticated users can update manpower rates" on project_manpower_rates for update using (public.get_user_role() in ('Admin', 'Cost Controller')) with check (public.get_user_role() in ('Admin', 'Cost Controller'));
create policy "Authenticated users can update material master" on project_material_master for update using (public.get_user_role() in ('Admin', 'Cost Controller')) with check (public.get_user_role() in ('Admin', 'Cost Controller'));
create policy "Authenticated users can update project wbs master" on project_wbs_master for update using (public.get_user_role() in ('Admin', 'Cost Controller')) with check (public.get_user_role() in ('Admin', 'Cost Controller'));
