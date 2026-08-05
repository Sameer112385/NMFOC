# Project Context: Detasad Projects Dashboard (SAP CN41 Progress Simulation & Revenue)

## 1. Project Purpose
The dashboard serves as an executive-level financial management, progress simulation, and revenue recognition workspace. It maps raw SAP transactional data (planned costs, actual postings, sales orders) to WBS (Work Breakdown Structure) hierarchies, allowing project controllers and managers to calculate POC (Percentage of Completion), forecast margins, and simulate pending field costs in real-time.

---

## 2. Technology Stack
* **Framework**: Next.js 15.5 (App Router), React 19
* **Database & Storage**: Supabase (PostgreSQL, Realtime, Storage buckets for company branding)
* **Styling**: Tailwind CSS & custom Vanilla CSS branding systems
* **Data Visualization**: Recharts (for trend analysis and cost/revenue splits)
* **File Processing**: SheetJS (XLSX) for high-performance spreadsheet parsing on upload
* **Language**: TypeScript

---

## 3. Main Modules
1. **Data Ingestion Engine** (`/api/financial-sources/upload`):
   * **CN41**: Ingests planned baseline costs and WBS hierarchies.
   * **GR55**: Ingests actual cost transactions (Material, Subcontractor, Manpower, etc.) and actual billed revenue GL entries.
   * **Sales Order Report**: Ingests planned client revenue baselines and amendments.
   * **Historical Revenue**: Ingests pre-2026 actual billed revenues.
2. **Financial Recalculation Engine** (`/lib/calculations.ts` & `/lib/financial-engine.ts`):
   * Aggregates, filters, and computes margins, POC, MTD, and YTD metrics, writing results to `revenue_wbs`.
3. **Trend & Revenue Analysis Engine** (`/lib/trends.ts`, surfaced by `components/trend-analysis-panel.tsx`):
   * A **separate** engine from `calculations.ts`. It recomputes the period-by-period cost and revenue series directly from raw postings, and powers the **Revenue Trends** and **Cost Trends** tabs.
   * **Revenue Trends**: Renders Planned vs Actual vs In Month Revenue metrics, Forecast Revenue curves, and the **Revenue by WBS & Period** matrix.
   * **Cost Trends**: Renders Planned vs Actual vs In Month Cost metrics, dual concurrent cost trend charts (Cumulative and Periodic side-by-side), the Cost Element Analysis stacked chart, Subcontractor Performance (PO) tracking, and the new **Cost by WBS & Period** matrix.
   * Lives on the **project dashboard** (`/dashboard/[projectId]` → "Revenue Trends" and "Cost Trends" tabs), not on `/simulation`.
4. **PM Daily Updates & Simulation** (`/app/(app)/pm-daily-updates`):
   * Enables PMs to log pending material, subcontractor, and manpower costs. These simulate project exposure before they are officially posted in SAP.
   * **Access control**: Admin and Cost Controller always have access; Project Managers have access to their own projects. Project Managers can also **assign team members** (any user role) to a project via the *Project Team* tab in the project workspace. Assigned users gain access to submit PM updates for that project.
   * **SAP Posted flag**: Each cost type has its own SAP posting flag (`subcontract_sap_posted`, `manpower_sap_posted`, `material_sap_posted`). Once flagged, that cost component is excluded from all PM-pending calculations, chart overlays, and forecasts. Records are kept for audit history — never deleted.
5. **Project Master Configuration** (`/app/(app)/projects/[projectId]`):
   * 7 tabs: **Summary** (project metadata overview), **WBS Master** (toggle active status and revenue-generating designations), **Cost Elements** (include/exclude SAP GL cost elements), **Manpower** (labor categories and hourly rates per WBS), **Material** (material master items per WBS), **Subcontracts** (PO packages mapping subcontractor work to WBS segments), **Project Team** (assign users to the project).
   * Editable only by Admin or Cost Controller (`canEditProjectMaster`). PMs and Viewers see a read-only banner. Project Managers who don't own the project get `notFound()` — they cannot view other PMs' project admin workspaces.
6. **Reporting & Insights**: Reports builder (Excel export + auto-download PDF via `@react-pdf/renderer` with branded cover page, KPI cards, tables, and period-aware filtering), Risk Alerts, Financial Performance (`/simulation` — **cross-project aggregate, no projectId filter**), Source Comparison (`/sap-vs-simulation` — **cross-project aggregate, no projectId filter**, shows Match/Not Match per WBS), Comments, Cost Elements (`/cost-elements?projectId=<id>`, defaults to first project).
7. **Portfolio Overview** (`/dashboard/portfolio`, `components/portfolio-dashboard.tsx`): A management-facing page that aggregates all projects in one view. Shows 8 KPI cards (total planned revenue, recognized revenue, actual cost, portfolio forecast margin, active project count, on-track count, at-risk count, average margin %), three comparison charts (margin per project, risk donut, revenue vs cost grouped bars), and a card grid with inline KPIs and POC progress bar per project. All figures read directly from pre-stored `revenue_wbs` fields — no independent recalculation. Applies the same WBS master filter as the individual project dashboard. **POC formula**: `recognizedRevenue / plannedRevenue` (matches the project dashboard exactly). Accessible from the sidebar ("Portfolio Overview", between Dashboard and Projects). Role-filtered: PMs see only their own projects; Admin/Cost Controller see all.
 8. **Dashboard Layout Customization** (`lib/dashboard-widgets.ts`, `lib/dashboard-layout.ts`, `components/dashboard-grid.tsx`): every dashboard visual (~30) can be shown/hidden **and drag-reordered** **reversibly** — nothing deletes code. Two axes: **status** (hide/show) and **order** (drag). Scope is a **global default plus per-project overrides** for both. **Admin-only.** Hide/show: global in *Settings → Dashboard Layout*, per-project via the *"Customize" gear*. Reorder: the *"Edit layout"* drag mode on the dashboard tab bar (uses `@dnd-kit`; **live on all three tabs: Financial Summary, Revenue Trends, and Cost Trends**). Layout is **row-based** (`string[][]`): each row is a fixed container — removing/hiding a card makes remaining cards expand within the row, but cards from other rows never flow up. Dragging between rows is explicit in edit mode. Stored as one server-side JSON file (`.local-db/dashboard-layout.json`, backward-compatible with legacy flat arrays via auto-migration); nothing renders differently until an Admin changes something. New widgets auto-append to any saved order.
8. **Access Control (RBAC)**: Four roles — `Admin` / `Cost Controller` / `Project Manager` / `Viewer` — resolved in `lib/current-user.ts`. Route-level access via `requireRouteAccess(pathname)` in each page server component: Admin = all; Cost Controller = all except Settings; Project Manager = Dashboard + Projects + PM Daily Updates; Viewer = Dashboard + Projects + PM Daily Updates (if assigned to a project). Sidebar filters nav items by the same map. `canAccessSettings` is **Admin-only**; `canManageDashboardLayout` is **Admin-only**. `canSubmitPmUpdates(user, project)` governs which projects appear in the PM update form. Settings is organized into collapsible sub-modules (Dashboard Layout, Company Branding, User Management, System Operations, Danger Zone, Environment Variables, Role Permissions).
9. **Project Team Assignment** (`components/project-team-panel.tsx`, `/api/project-team/[projectId]`): Admin/PM can assign users to a project with a role label (Coordinator, Engineer, Supervisor, Inspector, Planner). Assigned users gain PM Daily Update submission access for that project. Stored in `projects.assigned_users` as a JSONB array.

---

## 4. Database Structure
* **`projects`**: Core project metadata (manager, client, budget codes). Has `assigned_users jsonb` column — run `alter table projects add column if not exists assigned_users jsonb;` in Supabase SQL editor if not yet applied.
* **`cn41_uploads` & `cn41_rows`**: Baseline WBS items, planned costs, and descriptions.
* **`gr55_uploads` & `gr55_rows`**: Cost postings with transaction types, amounts, and posting dates.
* **`sales_order_uploads` & `sales_order_rows`**: Baseline client contract items and planned revenue.
* **`historical_revenue_uploads` & `historical_revenue_rows`**: Historical pre-2026 revenue records.
* **`pm_daily_updates`**: Daily logs of simulated field cost items (material, subcontractor, manpower). Per-type posting flags: `subcontract_sap_posted`, `manpower_sap_posted`, `material_sap_posted`. Flagged components are excluded from live calculations but retained for audit history.
* **`project_wbs_master`**: Overriding rules for active WBS nodes and revenue-generating codes.
* **`project_cost_element_control`**: Cost element inclusion/exclusion whitelist/blacklist rules.
* **`revenue_wbs`**: The output table storing pre-calculated WBS-level financial stats (planned cost, actual cost to date, planned revenue, recognized revenue to date, MTD revenue, remaining balance).
* **`gr55_summaries`**: Pre-aggregated GR55 postings (by WBS, PO, cost category, cost element, transaction type, and month). This — not `gr55_rows` — is what the dashboard sends to the browser.
* **`users_profile`**: Role and display name per auth user.
* **`risk_alerts`**, **`simulation_snapshots`**: Derived outputs, rebuilt on every recalculate.

> **Local mode**: when Supabase env vars are absent, `lib/local-db.ts` provides a complete JSON-file-backed stand-in for all of the above. `lib/data.ts` branches on `isLocalDbMode()` for every read.

---

## 5. Main Calculations & Formulas

> **`lib/pm-posting.ts`** is the canonical source for PM pending cost access. Always use `getEffectivePendingCost(update)`, `getMaterialPendingCost(update)`, `getSubcontractPendingCost(update)`, and `getManpowerPendingCost(update)` — these check the per-type SAP posting flags and return 0 for posted components. Never sum raw PM update fields directly.

1. **Management Actual Cost to Date**:
   $$\text{Actual Cost} = \text{SAP Actual Cost} + \text{PM Simulated Pending Costs}$$
2. **Cost-to-Cost POC%** (stored in `revenue_wbs.poc_percent`):
   $$\text{POC \%} = \min\left(100\%, \frac{\text{Management Actual Cost}}{\text{Planned Cost}} \times 100\right)$$
3. **Cumulative Recognized Revenue to Date**:
   $$\text{Recognized Revenue} = \frac{\text{POC \%}}{100} \times \text{Planned Revenue}$$
   > The dashboard displays POC as `recognizedRevenue / plannedRevenue` — mathematically identical to the cost-to-cost formula above because `recognizedRevenue` is derived from `poc_percent × plannedRevenue`.
4. **Month-to-Date (MTD) Revenue Recognition (SAP Billing Offset)**:
   $$\text{MTD Recognized Revenue} = \text{Cumulative POC Revenue to Date} - \text{Cumulative Actual SAP Billed Revenue in Previous Months}$$
5. **Year-to-Date (YTD) Revenue Recognition**:
   $$\text{YTD Recognized Revenue} = \sum (\text{Historical Months Billed Revenue}) + \text{Current Month MTD Recognized Revenue}$$
6. **Forecast Cost** (`lib/calculations.ts`):
   $$\text{Forecast Cost} = \text{Management Actual Cost to Date}$$
   > There is no separate forward-looking projection. Forecast cost equals current actual cost — a conservative "no further spending" assumption.
7. **Forecast Margin**:
   $$\text{Forecast Margin} = \text{Planned Revenue} - \text{Management Actual Cost}$$

### Two engines compute "in-month revenue" — and they disagree by design
* **`lib/calculations.ts`** writes `revenue_wbs.mtd_revenue_recognition`. Each WBS uses **its own** latest posting date as the reporting period, so one project's rows can sit in many different months.
* **`lib/trends.ts`** computes the Trend panel's **In Month Rev** card independently from raw postings, using a **single project-wide period** (the latest posting date across the whole project).

The card is the trends engine's output. Do not reconcile it against `SUM(revenue_wbs.mtd_revenue_recognition)` — they are different measures over different period sets.

### How the In Month Rev card is built
$$\text{In Month Rev} = \sum_{\text{WBS}} (\text{POC Revenue to Date}) - \sum_{\text{prior months}} (\text{Actual Revenue Posted})$$

It is a **project-level residual**, so it is not attributable per WBS by simple division — the offset is a single lump across all prior months. `TrendDataPoint.wbsRevenue` provides the per-WBS decomposition that *does* tie exactly (see the invariant in `AI_HANDOVER.md`).

Two consequences worth internalising:
* **Posting cost increases recognised revenue.** A WBS whose billing lags its progress converts new cost almost directly into accrual.
* **A bad planned-cost baseline passes straight to the bottom line.** Because the figure is a residual, one WBS with a nonsense planned cost is not diluted by the other 85 (see the `00421` note in `AI_HANDOVER.md`).

### Period semantics
* All bucketing is by **calendar month** (`YYYY-MM` string slicing) — there is no rolling-30-day window anywhere.
* But *which* month counts as "current" is **derived from the data**, not the clock: it is the latest posting date found, never `new Date()`. A project whose last posting was in March reports March as its current month.
* The **Revenue by WBS & Period matrix** mixes two measures on purpose, to mirror the engine: past columns are actual posted revenue; the current-period column is a POC accrual. It is marked with `°` in the UI. Only that column's total ties to the card — the grand total does not.

---

## 6. Important Business & Parsing Rules
* **Deterministic Query Pagination**: All page-by-page database fetch operations on tables exceeding 1,000 rows (e.g. GR55 tables) must enforce a strict `.order('id', { ascending: true })` constraint. This prevents PostgreSQL from returning rows in an arbitrary/non-deterministic order across paginated limits, which would otherwise result in fluctuating calculation values on recalculations.
* **Strict Date Field Rule**: Always parse and evaluate costs/revenues using the **`Posting Date`** column inside spreadsheets.
* **Timezone Shifting Prevention**: Excel dates are processed using local date components (`getFullYear()`, `getMonth()`, `getDate()`) to prevent Saudi Arabia (UTC+3) or other local timezone offsets from shifting dates backward (e.g. July 1st becoming June 30th) when converted to UTC string representations.
* **Material Cost Designation**: Regardless of cost element names, if the transaction code is `COIE`, it is automatically categorized as a `Material` cost.
* **Dynamic Recalculations & UI Reload**: Any updates to WBS configurations, uploads, or manual recalculations trigger a page reload (`window.location.reload()`) to sync all client-side states (cards, charts, breakdown grid) with the database immediately.

---

## 7. Known Limitations & Constraints
* **Large File Uploads**: GR55 transactional exports can reach 50,000+ rows. Ingestion is batch-inserted in parallel chunks of 2,000 to remain responsive. A full recalculation query uses paginated query helpers (`lib/supabase/pagination.ts`) to bypass Supabase server row caps.
* **Recalculate is a full rebuild, never incremental**: it re-reads every raw row, rewrites all of `revenue_wbs`, and deletes/re-inserts `risk_alerts` and `simulation_snapshots`. It also **rewrites planned cost/revenue**, so headline figures can move after a recalculate even with no new upload.
* **New GR55 cost elements are opt-out, not opt-in**: recalculate auto-inserts any unseen cost element into `project_cost_element_control` with `include_in_cost: true`.
* **Dashboard-layout drag UI is partially browser-verified** — both tabs render correctly with row-based layout and the API returns proper `string[][]` orders, but the drag interaction itself (Edit layout button → drag handles → Save/Cancel) was not fully exercised by the agent due to auth limitations. An Admin should click-test drag + persistence + per-project isolation on both tabs. (The earlier signed-out-500 bug from a swallowed `redirect()` in `app/(app)/layout.tsx` is now **fixed**.)
* **The PO filter does not reach the trend charts, the In Month Rev card, or the WBS × Period matrix** — only the drill-down and WBS tables honour it. The Cost Element Analysis PM Pending overlay *does* honour the PO filter (via WBS code derivation from `targetGr55`). See `AI_HANDOVER.md` → Open Issues.
* **PM Pending is a state snapshot per WBS per period** — if the same WBS has multiple updates in a month, only the latest is used. Summing all entries would inflate pending costs.
* **Portfolio numbers must match project dashboard** — the portfolio reads pre-stored `revenue_wbs` values and applies the same WBS master filter. POC uses `recognizedRevenue / plannedRevenue` (not `actualCost / plannedCost`). If portfolio numbers diverge from the project dashboard, the most likely cause is a stale `revenue_wbs` table — trigger a Recalculate on the project to resync.
* **Company name/subtext stored in `localStorage`** — resets on a new browser or device. Cross-device persistence would require storing these in the database.
* **Logo requires public Supabase bucket + Vercel env vars** — the `cn41-files` bucket must be set to Public in Supabase Storage. `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` must be set in Vercel project environment variables and a redeploy triggered (these are inlined at build time).
* **Supabase migration required for Project Team feature**: `alter table projects add column if not exists assigned_users jsonb;` must be run in the Supabase SQL editor. Until applied, the projects query silently falls back to base columns (the app handles this gracefully via `isMissingProjectExtendedColumnError`).
* **`.next/` is committed to git** (526 files); `.gitignore` lists only `node_modules`.
* **`/simulation` and `/sap-vs-simulation` are cross-project aggregate pages** — they read all `revenue_wbs` rows with no `projectId` filter. Any changes to those pages must account for data from all projects being present simultaneously.
* **`revenue_wbs` legacy alias fields** — `sap_actual_cost`, `sap_planned_cost`, `sap_poc_percent`, `pm_pending_cost`, `simulated_actual_cost`, `simulated_poc_percent`, `simulated_revenue`, `revenue_difference`, `sap_earned_revenue`, `prrevpl000`, `revenue_value` exist as type aliases in `lib/types.ts` from a prior migration. Do not remove them — some pages may still reference them.
* **Company branding sidebar/login state** — sidebar open/close state in `localStorage` key `sap-cn41-sidebar-open`; company name/subtext in `localStorage` only (reset per browser/device).
* **`getProjectManagerUsers()` uses Supabase admin client** — service-role key, bypasses RLS. Required because `users_profile` RLS prevents non-admin reads. Any new function that lists users across the system needs the admin client similarly.

---

## 8. Latest Dashboard UX & Data Rules (2026-08-04)

* The dashboard has a two-stage project identity: the normal large project title appears at the top; after it scrolls away, a smaller fixed strip displays the project name and project code. This keeps exported screenshots identifiable without making the initial heading small.
* The compact strip follows the expandable/collapsible sidebar through CSS variable `--app-sidebar-width` set by `components/app-shell.tsx`. Its height is exposed as `--project-identity-height`, which is also used by sticky tabs and filters to avoid overlap.
* The Financial Summary tab segment and Summary WBS filter are sticky and intentionally compact. `Executive Dashboard` was removed from the project header; the application header is `Dashboard`.
* Financial Summary card order: Planned Cost, Planned Revenue, Actual Cost, Recognized Revenue, POC %, Forecast Margin. Actual Cost includes SAP posted cost plus PM simulated cost. Recognized Revenue is the combined revenue of all revenue-generating WBS.
* Revenue contribution is presented as a sortable WBS list: Name, formatted Revenue (M/K), and POC %. Fill colour is based on POC (red/amber/green); sorting supports Revenue or POC, ascending or descending.
* CN41 planned-cost source rule: filter `ObjectType` to `WBS element`; use `Projektelm` as WBS code, `Project Object` as description, and `OCostPlan0` or `PrCstSc000` as planned cost. Historical revenue uploads do not replace CN41 and cannot supply planned cost.
* Trend cumulative revenue must never fall in the current period because current POC is below historical posting. Per WBS, retain `max(prior posted cumulative revenue, POC revenue)` for the current cumulative point.
