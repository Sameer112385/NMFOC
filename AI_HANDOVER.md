# AI Handover Document

## 1. Current Architecture
The application is a Next.js 15.5 React application built with TypeScript, styled using Tailwind CSS, and backed by Supabase.

* **Frontend Layout**: Leverages server-side data loading on page routes (`app/(app)`) and passes data to Client Components (like `DashboardClientWorkspace` and `DashboardWbsFilter`) to support interactive WBS multiselects, sorting, and reporting month filters.
* **Storage**: Brand logos (Sidebar and Login page) are uploaded directly into a public Supabase Storage bucket (`cn41-files`), making assets dynamically fetchable.
* **Pagination & Loading**: A custom paginated Supabase rows fetcher (`lib/supabase/pagination.ts`) is used to fetch datasets exceeding standard REST client caps.
* **Dual-Mode Data Layer**: Every read in `lib/data.ts` branches on `isLocalDbMode()`. When Supabase env vars are absent the app falls back to `lib/local-db.ts`, a complete JSON-file-backed database used for demos and local scaffolding. Any new data-access function must be implemented on **both** paths.
* **Auth & RBAC**: Four roles — `Admin` / `Cost Controller` / `Project Manager` / `Viewer` — resolved in `lib/current-user.ts` from the `users_profile` table (falling back to `user_metadata`). Route-level access is enforced by `requireRouteAccess(pathname)` in each page's server component: Admin gets `*`; Cost Controller gets all modules except Settings; Project Manager gets Dashboard + Projects + PM Daily Updates; Viewer gets Dashboard + Projects + PM Daily Updates. Unauthorized users are redirected to `/dashboard`. `canAccessSettings()` is **Admin-only**. Sidebar navigation (`components/sidebar.tsx`) filters items by the same role→routes map. `canManageDashboardLayout()` (**Admin only**) gates all dashboard-layout editing. In local-db mode a `sap-cn41-demo-session` cookie stands in for a real session.
* **The client never receives raw GR55 rows**: `app/(app)/dashboard/[projectId]/page.tsx` loads `getGr55Summaries()` (the pre-aggregated `gr55_summaries` table), **not** `getGr55Rows()`. A 55k-row raw export collapses to roughly 5–6k summary rows, which is what gets serialized to the browser. `getGr55Rows()` currently has no callers.

### Page & module map
Beyond the dashboard: **Reports** (`components/reports-builder.tsx`, Excel export + PDF auto-download via `@react-pdf/renderer`), **Risk Alerts**, **Financial Performance** (`/simulation`), **Source Comparison** (`/sap-vs-simulation`), **Comments**, **Cost Elements** (`/cost-elements?projectId=<id>` — uses `?projectId=` query param for project switching, defaults to first project), **Revenue WBS**, and admin backup/reset endpoints. Note the **Trend Analysis panel lives on `/dashboard/[projectId]`** (the "Trend Analysis" tab inside `DashboardClientWorkspace`) — *not* on `/simulation`, despite the name.

**`/simulation` and `/sap-vs-simulation` are cross-project aggregate views**: both call `getRevenueRows()` with **no `projectId` filter** — they aggregate WBS rows across all projects. `/simulation` shows the full cross-project financial simulation table; `/sap-vs-simulation` shows a side-by-side comparison (actual vs planned, Match/Not Match badge). Neither page is per-project.

**Project Admin Workspace** (`app/(app)/projects/[projectId]/page.tsx`, `components/project-admin-workspace.tsx`): 7 tabs — `summary`, `wbs-master`, `cost-elements`, `manpower`, `material`, `subcontracts`, `team`. Read-only banner shown for non-`canEditProjectMaster` users (Viewers and Project Managers). `canEditProjectMaster` = Admin or Cost Controller only (defined in `lib/current-user.ts`). **PM access restriction**: `notFound()` is returned for Project Managers who do NOT own the project (checks `project_manager_user_id` and `project_manager_email`). Team members in `assigned_users` are *not* granted project admin access — they only gain PM Daily Update submission access.

**Sidebar/AppShell state**: `components/app-shell.tsx` persists the sidebar open/closed state in `localStorage` key `sap-cn41-sidebar-open`. Sidebar is 272px wide (open) and 72px (collapsed). On mobile it becomes a slide-in overlay.

**Demo mode**: `lib/mock-data.ts` contains `demoProjects` (codes SAP-1001, SAP-1002) used when `sap-cn41-demo-session` cookie is present. `lib/current-user.ts` returns a hardcoded Admin user (`id: 'demo-admin'`, `email: 'admin@local'`, `fullName: 'Sameer Shaikh'`) for this cookie. Demo mode takes priority even when Supabase is configured.

### PDF Report Generation
The Reports page (`components/reports-builder.tsx`) generates professional vector PDFs using `@react-pdf/renderer` (`components/pdf-report-document.tsx`). The PDF is rendered entirely client-side and auto-downloads — no print dialog. Features: branded cover page with DETASAD header, teal-themed page headers/footers with page numbers, KPI summary cards, WBS performance table with totals row, subcontractor PO table, risk exceptions, and PM daily site logs. Period-aware: uses `mtd_actual_cost`/`mtd_revenue_recognition` for "This Month", `ytd_*` for "This Year", cumulative `*_to_date` for "All Time". Period filter presets: All Time, This Month, Last 3/6 Months, This Year, Last Year, Custom Range.

### Dashboard Widget Layout system (show/hide + reorder)
Every dashboard visual can be shown/hidden **and reordered** reversibly — nothing is deleted. Admin-only. Two independent axes: **status** (hide/show) and **order** (drag-reorder).
* **Registry** — `lib/dashboard-widgets.ts`: `DASHBOARD_WIDGETS` lists ~30 widgets (stable `id`, `group`, `title`, and **`span`** = 2|4|6|12 cols) across the Financial Summary and Trend Analysis tabs. `isWidgetHidden(layout, id)` is the fail-safe gate: **only an explicit `hidden`/`archived` status hides**; unknown/typo'd ids stay visible. `SPAN_CLASS` is a **static** map of span→Tailwind `col-span` classes (never build `col-span-${n}` — Tailwind purges runtime classes). `defaultOrder(tab)` = the registry order for a tab (already the current visual order). `getWidget(id)` looks up a widget.
* **Storage** — `lib/dashboard-layout.ts`: one server-side JSON file `.local-db/dashboard-layout.json`. Shape now `{ global:{<id>:status}, projects:{<pid>:{<id>:status}}, order:{ global:{<tab>:[[row1ids],[row2ids],...]}, projects:{<pid>:{<tab>:[[row1ids],...]}} } }`. Order is **row-based** (`string[][]`): each inner array is a fixed row of widget ids. **Backward-compatible**: legacy flat arrays (`string[]`) are auto-migrated to rows using group boundaries (`flatOrderToRows`). Status effective = `global` merged with project override (project wins). Order effective = project row order ?? global row order ?? `defaultRowLayout(tab)`, **all-or-nothing per level** (not merged), always **completed** (`completeRows` appends missing registry ids into a new final row). Order writes drop a redundant override when equal to fallback.
* **Reorder UI** — `@dnd-kit` (core/sortable/modifiers/utilities). `components/dashboard-grid.tsx` (`DashboardGrid`) accepts `rows: GridItem[][]`. **View mode**: each row is a separate `flex items-stretch` container (`flex-1` per child → equal-width cards in the row); rows are stacked vertically with `space-y-4`. Cards **never flow between rows** — removing/hiding a card makes remaining cards in that row expand, but cards from the next row never move up. **Edit mode**: `DndContext` wraps all rows; each row is a `DroppableRow` with its own `SortableContext` (`horizontalListSortingStrategy`). Cross-row drag uses `onDragOver` to move the dragged item between rows in real-time (`liveRows` state). Explicit drag handle per cell (6px pointer activation). `DragOverlay` preview. `onReorder` emits the new `string[][]` row layout. Empty rows are auto-removed.
* **Row-based model**: the key behavioral change is that **rows are fixed containers**. A row with 6 stat cards keeps those 6 cards even if another row has space. Dragging a card between rows is explicit (cross-row drag in edit mode). Hiding a card shrinks its row — the other rows stay put. `defaultRowLayout(tab)` in `lib/dashboard-widgets.ts` defines the initial row grouping (stat cards in row 0, SAP/Management view in row 1, etc.).
* **Scope = global default + per-project overrides** for both axes.
  * Status: global in **Settings → Dashboard Layout** (`dashboard-layout-panel.tsx`); per-project via the **"Customize" gear** (`dashboard-customize-panel.tsx`).
  * Order: per-project via the **"Edit layout" button** in the dashboard tab bar (Admin-only, **both tabs**) → drag → Save posts `{ order: string[][], tab }` to `/api/dashboard-layout/[projectId]` → reload.
* **Both APIs** (`/api/settings/dashboard-layout`, `/api/dashboard-layout/[projectId]`) handle both `{ layout }` and `{ order, tab }` (independent axes, one file), POST Admin-gated. The per-project route now accepts/returns `string[][]` for order. The settings route still uses the flat `saveGlobalOrder` wrapper which converts internally.
* **Render path** — `page.tsx` resolves `getEffectiveDashboardLayout` + `getEffectiveRowOrder(projectId,'summary'|'trends')` server-side (correct SSR, no order flash) and passes `dashboardLayout` + `summaryOrder: string[][]` + `trendsOrder: string[][]` to `DashboardClientWorkspace`. The **Summary tab is row-driven**: each visual is a case in `renderSummaryWidget(id)`, filtered by `isSummaryVisible(id)`, rendered via `DashboardGrid` with `rows` prop. Default (no file) = everything visible in `defaultRowLayout` order → the system is invisible until an Admin changes something. **Equal-height rows**: `DashboardGrid` cells use `flex-1 flex-col` so children fill the row height; `StatCard` has `h-full flex flex-col` so all stat cards in a row match the tallest.
* **Trend Analysis tab** is fully row-driven, same as Summary. `TrendAnalysisPanel` accepts `editingLayout`/`setEditingLayout` props (aliased to `editingTrends`/`setEditingTrends` internally). All 9 trend widgets are extracted into `renderTrendWidget(id)` and rendered via `DashboardGrid` with `rows: GridItem[][]`. Edit mode: `editTrendRows` state, `startEditTrends`/`saveTrendLayout` (POST to API), cross-row drag same as Summary. The "Edit layout" button in the workspace tab bar is tab-aware — it triggers Summary or Trends edit mode depending on `activeTab`.
* **Settings page** is organized into collapsible `SettingsSection` sub-modules (`components/settings-section.tsx`): Dashboard Layout (Admin-only), Company Branding, User Management, System Operations, Danger Zone, Environment Variables, Role Permissions. Server Component → `SettingsSection` takes an icon **name string** (not a component). Wrapped panels render "header-less" to avoid double chrome. The sections span full width (`w-full`).

**Not browser-verified:** the drag UX and cross-panel placement — the dashboard is behind login and the agent cannot authenticate. Verified via tsc + an order round-trip through the API (reverse preserved, unknown id dropped, omitted id appended). An Admin must click-test drag + persistence + per-project isolation.

---

## 2. Database Schema
Major operational tables in the Supabase PostgreSQL database:
* **`projects`**: Project identity, manager assignments, status codes. Has `assigned_users jsonb` column (added this session — run `alter table projects add column if not exists assigned_users jsonb;` if missing).
* **`cn41_rows`**: CN41 planned baseline costs by WBS.
* **`gr55_rows`**: Raw actual cost postings by WBS, GL cost element, and Posting Date.
* **`sales_order_rows`**: Client billing contract items and planned revenue.
* **`historical_revenue_rows`**: Pre-2026 actual billed revenues.
* **`pm_daily_updates`**: Pending material, subcontractor, and manpower costs simulated in the field. Has per-type SAP posting flags: `subcontract_sap_posted`, `manpower_sap_posted`, `material_sap_posted`. Once any flag is `true`, that cost component is excluded from PM-pending calculations and charts — it is accounted for in GR55.
* **`gr55_summaries`**: Pre-aggregated GR55 postings, rebuilt by `syncGr55Summaries()` (`lib/financial-engine.ts`) on every upload/recalculate. Grouped by `wbs | po | cost_category | cost_element | business_transaction | month | upload_id`. **This is what the dashboard ships to the browser.**
* **`project_wbs_master`**: Active state toggle & revenue-generating boolean flags per WBS node.
* **`project_cost_element_control`**: whitelist/blacklist status per SAP cost element GL.
* **`revenue_wbs`**: Output summary storage cache, holding the calculated financial health of WBS items (used to feed grids and chart builders). Legacy alias fields retained during migration: `sap_actual_cost`, `sap_planned_cost`, `sap_poc_percent`, `pm_pending_cost`, `simulated_actual_cost`, `simulated_poc_percent`, `simulated_revenue`, `revenue_difference`, `sap_earned_revenue`, `prrevpl000`, `revenue_value` — these are type aliases in `lib/types.ts` and must not be removed.
* **`users_profile`**: Role and full name per auth user; drives RBAC.
* **`risk_alerts`**, **`simulation_snapshots`**: Derived outputs; both are deleted and re-inserted wholesale on every recalculate.
* **`project_subcontracts`**, **`project_manpower_rates`**, **`project_material_master`**, **`comments`**: Supporting master data and collaboration.

---

## 3. Core API Endpoints
* **`/api/financial-sources/upload` [POST]**: Uploads and parses spreadsheets (CN41, GR55, Sales Orders, or Historical Revenue), clears previous project rows, chunks new insertions, and runs calculations.
* **`/api/financial-sources/recalculate` [POST]**: Manually calculates WBS-level margins, POC%, recognized revenue, and MTD/YTD values from the latest uploaded raw datasets, writing results back to `revenue_wbs`.
* **`/api/settings/supabase` [GET/POST]**: System config settings and environment check.
* **`/api/pm-updates`**, **`/api/project-wbs-master`**, **`/api/project-cost-elements`**, **`/api/project-subcontracts`**, **`/api/project-masters/*`**: Master-data CRUD; most trigger a recalculate.
* **`/api/admin/backup`**, **`/api/admin/reset`**, **`/api/admin/users`**: Admin-only; `requireAdminUser()` in `lib/current-user.ts`.
* **`/api/settings/dashboard-layout` [GET/POST]**: Global dashboard layout (GET open; POST Admin-only). **`/api/dashboard-layout/[projectId]` [GET/POST]**: per-project overrides (GET returns `{ global, project, effective }`; POST Admin-only). Not under `(app)`, so GET is not behind the auth-layout redirect.
* **`/api/project-team/[projectId]` [POST]**: Save the `assigned_users` array on a project. Allowed for Admin, Cost Controller, and Project Manager roles. Body: `{ assigned_users: ProjectTeamMember[] }`.
* **`/api/admin/users` [GET]**: Returns all users from `users_profile`. Uses the **Supabase admin client** (`createSupabaseAdminClient`, a service-role client bypassing RLS). `getProjectManagerUsers()` in `lib/data.ts` also uses the admin client to list PM-role users for the team-assignment dropdown.

**What Recalculate actually does** (`recalculate/route.ts`) — a full rebuild, never incremental:
1. Resolves the latest `is_latest = true` upload for CN41 / GR55 / Sales Orders (historical revenue and PM updates are fetched project-wide, not per upload).
2. Fetches all raw rows via the paginated helper, plus PM updates, existing `revenue_wbs`, and both override tables.
3. **Auto-registers any new GR55 cost element** into `project_cost_element_control` with `include_in_cost: true` — new cost elements are *opt-out*, not opt-in.
4. Rebuilds `gr55_summaries`.
5. Recomputes every WBS row and upserts on `project_id,wbs_code`.
6. Deletes and re-inserts all `risk_alerts` and `simulation_snapshots` for the project.

Note the uploader **clears previous rows** for the source it replaces, so `gr55_rows` holds exactly one upload generation at a time. Recalculate rewrites `revenue_wbs.planned_cost` / `planned_revenue`, so **the In Month Rev card can move after a recalculate even with no new upload.**

---

## 4. Key Business & Calculations Rules
1. **Posting Date Rule**: All spreadsheet calculations (actual costs, actual revenues) must evaluate and filter dates strictly using the `Posting Date` column.
2. **Material Categorization**: If the GR55 business transaction code is `COIE`, it is treated as a `Material` cost, irrespective of the GL name.
3. **Preventing Timezone Drift**: Spreadsheet dates are parsed extracting the local year, month, and day components. This prevents Saudi Arabia's local timezone offset (UTC+3) from shifting dates backward when serialized into UTC strings.
4. **MTD Revenue (SAP Billing Offset)**: In-Month recognized revenue for a WBS equals: `[Cumulative POC Revenue to Date] - [Cumulative SAP Actual Revenue Posted in Previous Months]`.
5. **Dynamic UI Synchronization**: Recalculating or uploading triggers a full page reload (`window.location.reload()`) to force all client components and overview cards to reload from the database immediately.
6. **Revenue GL accounts**: `400110`, `400119`, `400210`, `400310`. These are *excluded* from actual cost and treated as billed revenue. Defined as `REVENUE_GL_CODES` in `lib/trends.ts`; still duplicated as inline literals in `lib/calculations.ts` and `lib/financial-engine.ts`.
7. **Revenue sign convention**: Raw SAP GR55 revenue postings are **negative** (credits) and must be negated. `historical_revenue_rows` amounts are **already positive** from ingestion and must *not* be negated. Getting this asymmetry wrong silently doubles or cancels revenue.
8. **The 2026-01 boundary**: Revenue before `2026-01` is read from `historical_revenue_rows`; from `2026-01` onward it comes from GR55. This cutover is hardcoded in `lib/calculations.ts`, `lib/trends.ts`, and `components/dashboard-wbs-filter.tsx`.
9. **Two engines, two answers**: `lib/calculations.ts` writes `revenue_wbs.mtd_revenue_recognition` (per-WBS, each row using *its own* latest posting date as the period). `lib/trends.ts` computes the Trend panel's "In Month Rev" card independently from raw postings using one project-wide period. **These do not agree and are not expected to.** The card is `buildTrendData`'s output, not `revenue_wbs`.
10. **`TrendDataPoint.wbsRevenue` invariant**: `sum(wbsRevenue.values()) === recognizedRevenue === forecastRevenue` for every period. A dev-only assert in `lib/trends.ts` warns on violation. Any change to the revenue branch must preserve this — it is what makes the WBS × Period matrix tie to the card.
11. **PM Pending = unposted only**: Any PM update component whose SAP-posting flag is `true` (`subcontract_sap_posted`, `manpower_sap_posted`, `material_sap_posted`) is excluded from all PM-pending totals, forecasts, and the Cost Element Analysis PM overlay. Posted records are kept in the database for audit/history but have zero impact on live calculations.
12. **PM Pending is a state snapshot, not incremental**: If the same WBS has multiple daily updates in a month, only the **latest update per WBS per period** is used. Summing all entries would inflate the pending cost proportionally to how many days updates were submitted.
13. **`lib/pm-posting.ts` — canonical SAP-posting-aware cost accessors**: Use these functions to get PM pending costs; never sum the raw fields directly. Key exports:
    * `getEffectivePendingCost(update)` — sums all non-SAP-posted cost components (material + subcontract + manpower)
    * `getMaterialPendingCost(update)` — returns material pending cost if `material_sap_posted !== true`, else 0
    * `getSubcontractPendingCost(update)` — same for subcontract (checks `subcontract_sap_posted`)
    * `getManpowerPendingCost(update)` — same for manpower (checks `manpower_sap_posted`)
    * `buildRevenueSimulationPatch(update)` — used by the `/simulation` page's legacy simulation view
14. **`forecast_cost = managementActualCostToDate`** (`lib/calculations.ts` line 148): there is no separate forward-looking forecast model. Forecast cost is set equal to the current actual cost — a conservative assumption meaning the project won't spend any more than it already has. `forecast_margin = plannedRevenue - managementActualCostToDate`.
15. **POC formula dual representation**: The stored `poc_percent` in `revenue_wbs` is computed as `managementActualCostToDate / plannedCost` (cost-to-cost method, `lib/calculations.ts`). The dashboard displays `recognizedRevenue / plannedRevenue` which is mathematically equivalent because `recognized_revenue_to_date = (poc_percent / 100) * plannedRevenue`. Both expressions yield the same percentage. The **Portfolio Overview uses `recognizedRevenue / plannedRevenue`** — the same formula as `dashboard-client-workspace.tsx` line 233.

---

## 5. Files Modified in This Session

### Portfolio Overview page (`/dashboard/portfolio`)
* **`app/(app)/dashboard/portfolio/page.tsx`** (NEW) — Server component. Fetches all visible projects (PM-filtered), then for each fetches `getRevenueGeneratingRows`, `getRevenueRows`, `getProjectWbsMaster`, and `getLatestUploadDate` in parallel. Applies the **exact same WBS master filter** as the project dashboard (`is_active !== false && include_in_cost !== false`) before summing cost rows. All figures are read directly from pre-stored `revenue_wbs` fields — no re-derivation. POC = `recognizedRevenue / plannedRevenue` (identical formula to `dashboard-client-workspace.tsx` line 233). `forecast_margin` and all revenue fields summed from `revenue_wbs` directly.
* **`components/portfolio-dashboard.tsx`** (NEW) — Client component. Renders:
  * 8 KPI cards (2 rows): Total Planned Revenue, Recognized Revenue, Actual Cost, Portfolio Forecast Margin, Active Projects count, On Track, At Risk, Average Margin %.
  * **Project Forecast Margin bar chart** — sortable by Margin / Actual Cost / Revenue / POC % via toggle buttons; at-risk projects render in red.
  * **Risk Status donut chart** — Safe vs At Risk breakdown.
  * **Revenue vs Actual Cost grouped bar chart** — planned revenue vs actual cost per project side by side.
  * **Project cards grid** — 2–3 col responsive, each card shows Recognized Revenue, Actual Cost, POC%, Forecast Margin, a POC progress bar, risk badge, and "Open dashboard" link to `/dashboard/[projectId]`.
* **`components/sidebar.tsx`** — Added `Layers` icon import; added "Portfolio Overview" nav item linking to `/dashboard/portfolio` between Dashboard and Projects.
* **`lib/current-user.ts`** — Added `/dashboard/portfolio` to Cost Controller, Project Manager, and Viewer allowlists (belt-and-suspenders; `/dashboard` prefix already grants access via `startsWith` matching).

### POC formula — critical finding
The dashboard POC card (`summary.card.pocPercent`) computes: `recognizedRevenue / plannedRevenue * 100` — **not** `actualCost / plannedCost`. Using `actualCost / plannedCost` in the portfolio produced different (wrong) numbers. The portfolio now uses the correct formula matching the dashboard exactly.

### Company logo not showing on Vercel (diagnosis & fix)
* **Root cause**: `NEXT_PUBLIC_SUPABASE_URL` was not set in Vercel environment variables. Without it, the sidebar and login page client components build an empty logo URL and fall back to the initial letter placeholder. The `cn41-files` bucket also needed to be set to **Public** in Supabase Storage settings.
* **Fix applied (by user)**: Set bucket to Public in Supabase Storage dashboard; add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to Vercel project → Settings → Environment Variables, then redeploy (these vars are inlined at build time).
* **Note**: Company name/subtext are stored in `localStorage` — they reset to defaults on a new device/browser. If cross-device persistence is needed, store them in the database instead.

### Per-project team assignment for PM Daily Updates
* **`lib/types.ts`** — Added `ProjectTeamMember` type (`{ user_id, email, full_name, role_label }`) and `assigned_users?: ProjectTeamMember[] | null` field to `Project` type.
* **`lib/data.ts`** — Added `assigned_users` to `PROJECT_SELECT_EXTENDED` query string. Added `'assigned_users'` to `isMissingProjectExtendedColumnError` so a missing column gracefully falls back to `PROJECT_SELECT_BASE` (this was the **root cause** of the blank Projects page when Supabase didn't have the column yet).
* **`lib/current-user.ts`** — Added `canSubmitPmUpdates(user, project)` helper: returns `true` for Admin/Cost Controller, or if the user is the project PM (by id or email), or if the user appears in `assigned_users`. Also added `/pm-daily-updates` to the Viewer route allowlist so assigned Viewers can access the page.
* **`lib/local-db.ts`** — `updateProject` already handles `assigned_users` (JSONB stored as-is in JSON file).
* **`components/project-team-panel.tsx`** (NEW) — Panel UI: lists current members with role labels, role-change dropdown, remove button. Dropdown to add users from `users_profile` (fetches `/api/admin/users`). Saves via POST to `/api/project-team/[projectId]`. Shows only to users with `canEdit`.
* **`components/project-admin-workspace.tsx`** — Added `ProjectTeamPanel` import and "Project Team" tab (renders `<ProjectTeamPanel>` when active).
* **`app/api/project-team/[projectId]/route.ts`** (NEW) — POST endpoint; allowed for Admin/Cost Controller/Project Manager. Updates `projects.assigned_users` via Supabase admin client or `updateProject` in local-db mode.
* **`app/(app)/pm-daily-updates/page.tsx`** — Imports `canSubmitPmUpdates`; filters `projects`, `revenueWbs`, `manpowerRates`, `materialMasters`, `projectSubcontracts` to only those accessible to the current user before passing to `PMUpdateForm`.
* **`supabase/manual-setup.sql`** — Added `alter table if exists projects add column if not exists assigned_users jsonb;` migration.

### Cost Element Analysis — PM Pending overlay
* **`components/trend-analysis-panel.tsx`** — `categoryTrendData` memo extended to compute PM pending per period alongside GR55 SAP actuals:
  * Builds `allowedWbsCodes` from the already-filtered `targetGr55` set — when a PO or WBS filter is active, PM updates are restricted to only those WBS codes (PM updates have no PO field, so WBS derivation from filtered GR55 is the bridge).
  * `getPmAmount(up)` respects per-type posting flags: skips `pending_subcontractor_cost` if `subcontract_sap_posted`, etc.
  * Takes the **latest update per WBS per period** (pending is a state snapshot, not an increment).
  * PM Pending renders as a separate stacked bar segment with 35% opacity fill + dashed stroke — visually distinct from SAP actuals.
  * Appears in the Cost Category Consumption Ranking as a lighter entry.
  * Label pattern: `"Subcontractor (PM Pending)"`, `"Manpower (PM Pending)"`, etc.
  * Added `costRows` to the memo's dependency array (used for `wbsIdToCode` mapping).

### Subcontractor PO filter — popover stays open
* **`components/trend-analysis-panel.tsx`** — Fixed the `isTrendVisible` check: removed `selectedPos.length === 1` from the condition that hid the Subcontractor Performance section. Now the section (and its PO dropdown) stays visible at all times when in subcontractor view, regardless of how many POs are filtered.

### Column filter popover — stays open on click/type
* **`components/trend-analysis-panel.tsx`** — Fixed `ColumnFilterButton` and `WbsColumnFilter` scroll listener: `onScroll` now checks `popRef.current?.contains(e.target as Node)` and skips closing if the scroll originates inside the popover. Previously, clicking a checkbox or focusing an input could trigger a micro-scroll that fired `setOpen(false)`.

### Projects blank page fix (Supabase mode)
* **`lib/data.ts`** — Root cause: `PROJECT_SELECT_EXTENDED` included `assigned_users` which didn't exist in Supabase yet → query failed → silent `return []`. Fix: added `'assigned_users'` to `isMissingProjectExtendedColumnError` so the fallback query runs correctly until the migration is applied.

---

## 6. Files Modified Previously (still relevant)

### Latest prior session — RBAC, PDF generation, period filters, branding
New: `components/pdf-report-document.tsx` (professional `@react-pdf/renderer` PDF document with cover page, branded headers/footers, KPI cards, tables with totals, risk alerts, PM site logs). Deps: `@react-pdf/renderer`.
Changed: `lib/current-user.ts` (+`AppRole` type, `ALLOWED_ROUTES` map with 4 roles, `getAllowedRoutes()`, `canAccessRoute()`, `requireRouteAccess()`, `canAccessSettings()` now Admin-only). `components/sidebar.tsx` (nav filtering by role→routes map). 10 page server components (added `requireRouteAccess()` guard: upload-cn41, reports, simulation, sap-vs-simulation, risk-alerts, comments, pm-daily-updates, revenue-wbs, cost-elements, settings). `components/reports-builder.tsx` (replaced `window.print()` with `@react-pdf/renderer` auto-download; added period filter with 7 presets; period-aware cost/revenue field switching using MTD/YTD/cumulative fields; removed html2canvas/jsPDF). `components/trend-analysis-panel.tsx` (KPI card number alignment fix — flex column + grow spacer). `app/layout.tsx` (title → "Detasad Project Dashboard"). `components/print-report-layout.tsx` (NMFOC → Detasad Projects Dashboard). `components/pdf-report-document.tsx` (all references → Detasad Projects Dashboard). `app/(auth)/login/page.tsx` (removed Supabase settings panel; added small connection status dot indicator at bottom of login card).

### Row-based layout + drag reorder (both tabs)
New: `components/dashboard-grid.tsx` (reusable row-based grid, view/edit-mode dnd with cross-row drag). Deps: `@dnd-kit/core|sortable|modifiers|utilities`.
Changed: `lib/dashboard-widgets.ts` (+`span`, `SPAN_CLASS`, `defaultOrder`, `defaultRowLayout`, `flatOrderToRows`, `getWidget`), `lib/dashboard-layout.ts` (rewritten for row-based `string[][]` order — `TabRowOrder`, `sanitizeRowsForStore`, `completeRows`, `rowsEqual`, `getEffectiveRowOrder`, `saveProjectRowOrder`; legacy flat wrappers kept), both dashboard-layout API routes, `app/(app)/dashboard/[projectId]/page.tsx` (resolve + pass `summaryOrder`/`trendsOrder` as `string[][]`), `components/dashboard-client-workspace.tsx` (Summary tab → `renderSummaryWidget(id)` + `DashboardGrid` + Edit-layout mode on both tabs), `components/trend-analysis-panel.tsx` (fully row-driven: `renderTrendWidget(id)` switch, `DashboardGrid` with `rows`, edit mode with `editTrendRows`/`startEditTrends`/`saveTrendLayout`).

### Splitting Trend Analysis into Revenue Trends and Cost Trends tabs
Changed:
* **`lib/trends.ts`**: Updated `TrendDataPoint` type and `buildTrendData` calculation engine to compute and store per-WBS periodic costs (`wbsCost`) alongside revenue.
* **`lib/dashboard-widgets.ts`**: Registered the new `'costTrends'` tab and configured all its widgets (`costTrends.kpis`, `costTrends.chart.costTrendCumulative`, `costTrends.chart.costTrendPeriod`, `costTrends.section.costElementAnalysis`, `costTrends.section.subcontractorPo`, `costTrends.section.costByWbsMatrix`, `costTrends.section.drilldown`). Refocused `trends` (Revenue Trends) widgets entirely on revenue.
* **`lib/dashboard-layout.ts`**: Updated order deserialization and layout sanitizers to recognize and save `'costTrends'` layouts.
* **`app/(app)/dashboard/[projectId]/page.tsx`**: Resolved `costTrendsOrder` layout server-side and passed it down to the UI.
* **`app/api/dashboard-layout/[projectId]/route.ts`** & **`app/api/settings/dashboard-layout/route.ts`**: Handled layout saving/validation checks for `'costTrends'`.
* **`components/dashboard-client-workspace.tsx`**: Added a new tab button "Cost Trends", renamed "Trend Analysis" to "Revenue Trends", and structured reordering capabilities and layout states for all three tabs.
* **`components/trend-analysis-panel.tsx`**: Added support for `mode: "revenue" | "cost"`. Implemented two concurrent cost charts (Cumulative and Period side-by-side) without toggles, custom KPI card subsets per mode, and a new Cost by WBS & Period matrix leveraging the `wbsCost` dataset.

---

## 7. Open Issues

### Code bugs
* **`selectedPos` is not passed to `baseTrendData`** (`components/trend-analysis-panel.tsx`): `buildTrendData` accepts `selectedPos`, and `dashboard-client-workspace.tsx` *does* pass it — but the Trend panel does not. So the trend charts, the In Month Rev card, and the WBS × Period matrix are all **PO-blind**, while `filteredWbsRows` and the drill-down table honour the PO filter. With a PO selected, the card and the drill-down describe different populations. Fixing this **will move the card's number**, so it needs its own verification pass.
* **`getProjectWbsMaster()` does not paginate** (`lib/data.ts`): plain `select` capped at Supabase's default 1000 rows. It would silently truncate above 1000 WBS codes, and that map drives the cost-WBS filter.
* **`revenue_wbs.reporting_period` drifts per WBS**: each row's period is derived from *that WBS's own* latest posting date, so a project's rows can span many different months. Summing `mtd_revenue_recognition` across them adds different months together. The trends engine does not have this problem (one project-wide period).
* **`getGr55Rows()` is dead code** (`lib/data.ts`): no callers. Either delete it or find out which page regressed to summaries.

### Operational
* **Ingestion Timeouts**: Uploading massive GR55 exports (50,000+ rows) can take up to 25–30 seconds. On standard serverless runtimes (like Vercel), this may occasionally exceed HTTP execution timeout boundaries (10–15s), yielding a gateway error in the browser while the insertions continue processing in the database background.
* **`.next/` is committed to git** — 526 build-artifact files are tracked, and `.gitignore` contains only `node_modules`. Recommended: add `.next` to `.gitignore` and `git rm -r --cached .next`.
* **Supabase migration required**: Run `alter table if exists projects add column if not exists assigned_users jsonb;` in the Supabase SQL editor if projects are not showing (the app now gracefully falls back to `PROJECT_SELECT_BASE` if the column is missing, but the Project Team feature requires it).

### Data quality (SEC NG NMFOC Jeddah)
* **WBS `SIS-NGS.FOC.W.JD.00421` has a planned cost of 1.00 SAR** against 863,466.46 of planned revenue. Its 0.41 SAR of actual cost yields a 41% POC and **354,021.25 of recognized revenue** off a sub-riyal posting. This single row is larger than the entire In Month Rev figure. Verify the CN41 source for this WBS.
* Roughly half the revenue-generating WBS trip at least one baseline check (planned cost suspiciously low, POC capped because actual exceeded plan, or barely-started at <5%).

---

## 8. Next Recommended Tasks
1. **Run Supabase migration** — execute `alter table if exists projects add column if not exists assigned_users jsonb;` in the SQL editor to fully enable the Project Team feature.
2. **Browser-verify Portfolio Overview** — log in as Admin on Vercel, click "Portfolio Overview" in sidebar, confirm all KPI numbers match the individual project dashboards exactly (especially POC % and Forecast Margin).
3. **Browser-verify the dashboard-layout UI as an Admin** — storage + both APIs are curl-verified, but the authenticated drag UI was never fully exercised by the agent (login limitation). Confirm: drag works cross-row on **both** Summary and Trends tabs, Save persists, per-project order is isolated, Cancel reverts, non-Admin sees no Edit button.
4. **Browser-verify Project Team panel** — go to a project → Project Detail → "Project Team" tab, assign a Coordinator/Engineer user, verify they appear in the PM Daily Updates project dropdown.
5. **Fix PO filter blind spot in trend charts** — pass `selectedPos` into `buildTrendData` inside `TrendAnalysisPanel` so the In Month Rev card, trend charts, and WBS × Period matrix all honour the PO filter (note: this will move card numbers, so verify carefully).
6. **Company name/subtext cross-device persistence** — currently stored in `localStorage` only; resets on new browser/device. Store in database if management wants consistent branding across all users.
7. **Finish the pre-aggregation migration** *(partially done)*: `syncGr55Summaries()` already exists and the **dashboard already reads `gr55_summaries`**. The calculation path (`recalculate/route.ts`, `lib/financial-engine.ts`) still reads raw `gr55_rows`.
8. **Consider deriving the reporting period project-wide** rather than per-WBS in `lib/calculations.ts`, so `revenue_wbs` stops mixing months.

---

## 9. Latest Implementation Notes (2026-08-04)

### Dashboard identity and layout
* The project dashboard keeps the normal, full-size project heading at the top of the page. Once the user scrolls past it, `components/project-sticky-identity.tsx` shows a compact fixed strip with **Project name + project code** so screenshots remain identifiable.
* The compact strip must align with the live sidebar state. `components/app-shell.tsx` writes CSS variable `--app-sidebar-width` (`272px` expanded / `72px` collapsed); the strip uses it on desktop. Do not restore a `left: 0` full-window strip, as it will render beneath the sidebar and hide the project name.
* Dashboard tabs and the Summary WBS filter are sticky. Their offsets use `--project-identity-height`, which is `0px` normally and `44px` only while the compact identity strip is visible. This prevents the controls from overlapping the strip.
* Header spacing and the Summary WBS selector were intentionally compacted. The old `Executive Dashboard` subtitle was removed; the global top bar remains simply `Dashboard`.

### Financial-summary presentation
* Summary order is **Planned Cost, Planned Revenue, Actual Cost, Recognized Revenue, POC %, Forecast Margin**.
* Labels: `Management Actual Cost` is now `Actual Cost`; its helper text is `SAP Posted Cost + PM Simulated Cost`. Recognized Revenue helper text is `Combined Revenue of All Revenue-Generating WBS`.
* The WBS POC chart was replaced by a scrollable revenue-contribution list showing **Name | Revenue | POC %**. Revenue abbreviates to M/K where applicable, row progress fill follows POC (red/amber/green), and sorting supports Revenue and POC in both directions.

### CN41 planned-cost mapping
* For CN41 imports, keep only `ObjectType = WBS element` rows for WBS baseline extraction.
* `Projektelm` is the WBS code; `Project Object` is the WBS description; `OCostPlan0` or `PrCstSc000` is planned cost.
* A saved WBS master must not suppress a valid CN41 planned-cost WBS merely because it has not yet been registered in the master. Explicit inactive/excluded master rows still exclude it.
* If planned cost/revenue appears incorrect after upload, first verify the source type. A historical revenue file uploaded in place of CN41 cannot supply planned cost; the app will recalculate correctly once the proper CN41 file is uploaded.

### Trend integrity
* Current-period cumulative revenue uses the greater of prior posted cumulative revenue and POC revenue per WBS. This prevents the cumulative revenue curve from dropping at the latest period.

---

## 10. Weekly Change Log (2026-08-03 to 2026-08-10)

### PO commitment and vendor master
* Added ME2J PO commitment import at **Upload Financial Sources**. Data is stored per project in `po_commitment_rows`; an ME2J re-upload replaces only that project's previous commitment rows.
* ME2J is the source for **issued provision / PO value only**. Rows whose Deletion Indicator is `L` are excluded; `S` is retained and labelled Locked.
* GR55 remains the only source for posted actual cost. PO utilization is `GR55 actual / issued provision`; remaining PO balance is `issued provision - GR55 actual`.
* Added confidential `vendor_master` mapping (`vendor_id` -> `vendor_name`) and the Admin-only **Settings -> Vendor Master** upload. Vendor names enrich PO data server-side. Do not expose or send the master file to the browser unnecessarily.
* Added `getPoCommitmentRows(projectId)` in both Supabase and local-db paths. Vendor lookup failure must not prevent PO data from loading.

### Cost Trends: PO and vendor spending
* Replaced the former subcontractor-only PO section with **PO & Vendor Spending**. It shows issued provision, GR55 actual, remaining balance, utilization, and active PO count.
* The utilization visual is a stacked vendor bar: GR55 actual plus remaining PO balance equals the issued provision. The previous activity commitment/consumption chart was intentionally removed.
* Added one **Spending Analysis** table with **By Vendor** and **By PO** tabs. Every utilization cell contains a horizontal progress bar. Clicking a vendor opens the PO view filtered to that vendor; the filter can be cleared.
* Both tabs support column-level ascending/descending sorting and direct Excel download. Cost Trend KPI cards now include PO Count, Subcontractor Count, and Remaining PO Balance.

### Revenue and cost matrices
* **Revenue by WBS & Period** is a required Revenue Trends widget and was restored after an accidental renderer omission. It retains WBS selection, column filters, hide-empty rows, sorting, totals, drill-down, and Excel export.
* **Cost by WBS & Period** remains a separate Cost Trends widget. Do not replace or remove either matrix when changing PO/Vendor visuals.

### Chart and dashboard behavior
* Presentation charts now render point labels using SAR with M/K abbreviations and horizontally open at the latest calendar year. Keep sufficient right-side chart margin so the final value is visible.
* The former Forecast Cost series duplicated Actual Cost (`GR55 + PM simulated cost`). It has been removed from the Revenue Trends chart and renamed **Cost vs Budget Trend**, showing Actual Cost and Planned Cost/Budget only. A true EAC forecast has not been implemented yet.
* The dashboard keeps the project identity strip solid/opaque and aligned beneath the Dashboard bar. Header/tab/filter spacing was tightened and the old Executive Dashboard subtitle removed.
* Dashboard visual customization and layout editing are available to **Admin and Cost Controller**. Settings access remains Admin-only. Customization is reversible: hide/show and row order must never delete widgets or data.

### Forecasting and AI proposal (not implemented)
* A Project Forecasting & Completion module was designed but not implemented. It will require trustworthy planned start/finish dates and a dated physical-progress series. Cost-derived POC cannot be reused as physical progress because that creates a circular forecast.
* Phase 1 should use transparent deterministic methods (burn rate, progress-based estimate where physical progress is available, and commitment-aware forecast) before any model interpretation.
* AI will explain verified forecast inputs, surface risks, and propose actions; it must not invent financial figures. No provider is configured in `.env` today. A Modal-hosted **DeepSeek-V4-Flash-0731** endpoint was provisioned by the user but was still deploying as of 2026-08-09; confirm its ready status, inference path, authentication, and model identifier before integration. Keep its token server-side only.

### Verification and caution
* Latest code validation: `npx tsc --noEmit` and `git diff --check` passed after the Revenue matrix restoration and dashboard-layout permission update.
* `tsconfig.tsbuildinfo` is generated by TypeScript checks and should not be committed as a functional code change.