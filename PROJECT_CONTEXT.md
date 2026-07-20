# Project Context: SAP CN41 Progress Simulation & Revenue Dashboard

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
   * A **separate** engine from `calculations.ts`. It recomputes the period-by-period cost and revenue series directly from raw postings, and powers the Trend Analysis tab: the KPI cards (including **In Month Rev**), the four trend charts, cost-element and subcontractor-PO analysis, the **Revenue by WBS & Period matrix**, and the transaction drill-down.
   * Lives on the **project dashboard** (`/dashboard/[projectId]` → "Trend Analysis" tab), not on `/simulation`.
4. **PM Daily Updates & Simulation** (`/app/(app)/pm-daily-updates`):
   * Enables PMs to log pending material, subcontractor, and manpower costs. These simulate project exposure before they are officially posted in SAP.
5. **Project Master Configuration** (`/app/(app)/projects/[projectId]`):
   * **WBS Master**: Toggle active status and revenue-generating designations for WBS nodes.
   * **Cost Element Control**: Include/exclude specific SAP GL cost elements from cost totals.
   * **Subcontract Packages**: Map subcontractor POs to WBS segments.
6. **Reporting & Insights**: Reports builder (Excel + print), Risk Alerts, Financial Performance (`/simulation`), Source Comparison (`/sap-vs-simulation`), and Comments.
7. **Dashboard Layout Customization** (`lib/dashboard-widgets.ts`, `lib/dashboard-layout.ts`, `components/dashboard-grid.tsx`): every dashboard visual (~30) can be shown/hidden **and drag-reordered** **reversibly** — nothing deletes code. Two axes: **status** (hide/show) and **order** (drag). Scope is a **global default plus per-project overrides** for both. **Admin-only.** Hide/show: global in *Settings → Dashboard Layout*, per-project via the *"Customize" gear*. Reorder: the *"Edit layout"* drag mode on the dashboard tab bar (uses `@dnd-kit`; **live on both Financial Summary and Trend Analysis tabs**). Layout is **row-based** (`string[][]`): each row is a fixed container — removing/hiding a card makes remaining cards expand within the row, but cards from other rows never flow up. Dragging between rows is explicit in edit mode. Stored as one server-side JSON file (`.local-db/dashboard-layout.json`, backward-compatible with legacy flat arrays via auto-migration); nothing renders differently until an Admin changes something. New widgets auto-append to any saved order.
8. **Access Control**: `Admin` / `Cost Controller` / `Viewer` roles resolved in `lib/current-user.ts`. `canAccessSettings` (Admin or Cost Controller) gates the Settings page and project-master editing; `canManageDashboardLayout` (**Admin only**) gates dashboard-layout editing. Settings is organized into collapsible sub-modules (Dashboard Layout, Company Branding, User Management, System Operations, Danger Zone, Environment Variables, Role Permissions).

---

## 4. Database Structure
* **`projects`**: Core project metadata (manager, client, budget codes).
* **`cn41_uploads` & `cn41_rows`**: Baseline WBS items, planned costs, and descriptions.
* **`gr55_uploads` & `gr55_rows`**: Cost postings with transaction types, amounts, and posting dates.
* **`sales_order_uploads` & `sales_order_rows`**: Baseline client contract items and planned revenue.
* **`historical_revenue_uploads` & `historical_revenue_rows`**: Historical pre-2026 revenue records.
* **`pm_daily_updates`**: Daily logs of simulated field cost items (material, subcontractor, manpower) and their SAP posting status.
* **`project_wbs_master`**: Overriding rules for active WBS nodes and revenue-generating codes.
* **`project_cost_element_control`**: Cost element inclusion/exclusion whitelist/blacklist rules.
* **`revenue_wbs`**: The output table storing pre-calculated WBS-level financial stats (planned cost, actual cost to date, planned revenue, recognized revenue to date, MTD revenue, remaining balance).
* **`gr55_summaries`**: Pre-aggregated GR55 postings (by WBS, PO, cost category, cost element, transaction type, and month). This — not `gr55_rows` — is what the dashboard sends to the browser.
* **`users_profile`**: Role and display name per auth user.
* **`risk_alerts`**, **`simulation_snapshots`**: Derived outputs, rebuilt on every recalculate.

> **Local mode**: when Supabase env vars are absent, `lib/local-db.ts` provides a complete JSON-file-backed stand-in for all of the above. `lib/data.ts` branches on `isLocalDbMode()` for every read.

---

## 5. Main Calculations & Formulas
1. **Management Actual Cost to Date**:
   $$\text{Actual Cost} = \text{SAP Actual Cost} + \text{PM Simulated Pending Costs}$$
2. **Cost-to-Cost POC%**:
   $$\text{POC \%} = \min\left(100\%, \frac{\text{Management Actual Cost}}{\text{Planned Cost}} \times 100\right)$$
3. **Cumulative Recognized Revenue to Date**:
   $$\text{Recognized Revenue} = \frac{\text{POC \%}}{100} \times \text{Planned Revenue}$$
4. **Month-to-Date (MTD) Revenue Recognition (SAP Billing Offset)**:
   $$\text{MTD Recognized Revenue} = \text{Cumulative POC Revenue to Date} - \text{Cumulative Actual SAP Billed Revenue in Previous Months}$$
5. **Year-to-Date (YTD) Revenue Recognition**:
   $$\text{YTD Recognized Revenue} = \sum (\text{Historical Months Billed Revenue}) + \text{Current Month MTD Recognized Revenue}$$
6. **Forecast Margin**:
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
* **The PO filter does not reach the trend charts, the In Month Rev card, or the WBS × Period matrix** — only the drill-down and WBS tables honour it. See `AI_HANDOVER.md` → Open Issues.
* **`.next/` is committed to git** (526 files); `.gitignore` lists only `node_modules`.
