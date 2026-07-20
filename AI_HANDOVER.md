# AI Handover Document

## 1. Current Architecture
The application is a Next.js 15.5 React application built with TypeScript, styled using Tailwind CSS, and backed by Supabase.

* **Frontend Layout**: Leverages server-side data loading on page routes (`app/(app)`) and passes data to Client Components (like `DashboardClientWorkspace` and `DashboardWbsFilter`) to support interactive WBS multiselects, sorting, and reporting month filters.
* **Storage**: Brand logos (Sidebar and Login page) are uploaded directly into a public Supabase Storage bucket (`cn41-files`), making assets dynamically fetchable.
* **Pagination & Loading**: A custom paginated Supabase rows fetcher (`lib/supabase/pagination.ts`) is used to fetch datasets exceeding standard REST client caps.
* **Dual-Mode Data Layer**: Every read in `lib/data.ts` branches on `isLocalDbMode()`. When Supabase env vars are absent the app falls back to `lib/local-db.ts`, a complete JSON-file-backed database used for demos and local scaffolding. Any new data-access function must be implemented on **both** paths.
* **Auth & RBAC**: Roles are `Admin` / `Cost Controller` / `Viewer`, resolved in `lib/current-user.ts` from the `users_profile` table (falling back to `user_metadata`). Permission helpers: `canEditProjectMaster()` and `canAccessSettings()` (both Admin **or** Cost Controller) gate project-master editing and the Settings route; `canManageDashboardLayout()` (**Admin only**) gates all dashboard-layout editing. In local-db mode a `sap-cn41-demo-session` cookie stands in for a real session.
* **The client never receives raw GR55 rows**: `app/(app)/dashboard/[projectId]/page.tsx` loads `getGr55Summaries()` (the pre-aggregated `gr55_summaries` table), **not** `getGr55Rows()`. A 55k-row raw export collapses to roughly 5–6k summary rows, which is what gets serialized to the browser. `getGr55Rows()` currently has no callers.

### Page & module map
Beyond the dashboard: **Reports** (`components/reports-builder.tsx`, Excel + print export), **Risk Alerts**, **Financial Performance** (`/simulation`), **Source Comparison** (`/sap-vs-simulation`), **Comments**, **Cost Elements**, **Revenue WBS**, and admin backup/reset endpoints. Note the **Trend Analysis panel lives on `/dashboard/[projectId]`** (the "Trend Analysis" tab inside `DashboardClientWorkspace`) — *not* on `/simulation`, despite the name.

### Dashboard Widget Layout system (show/hide + reorder)
Every dashboard visual can be shown/hidden **and reordered** reversibly — nothing is deleted. Admin-only. Two independent axes: **status** (hide/show) and **order** (drag-reorder).
* **Registry** — `lib/dashboard-widgets.ts`: `DASHBOARD_WIDGETS` lists ~30 widgets (stable `id`, `group`, `title`, and **`span`** = 2|4|6|12 cols) across the Financial Summary and Trend Analysis tabs. `isWidgetHidden(layout, id)` is the fail-safe gate: **only an explicit `hidden`/`archived` status hides**; unknown/typo'd ids stay visible. `SPAN_CLASS` is a **static** map of span→Tailwind `col-span` classes (never build `col-span-${n}` — Tailwind purges runtime classes). `defaultOrder(tab)` = the registry order for a tab (already the current visual order). `getWidget(id)` looks up a widget.
* **Storage** — `lib/dashboard-layout.ts`: one server-side JSON file `.local-db/dashboard-layout.json`. Shape now `{ global:{<id>:status}, projects:{<pid>:{<id>:status}}, order:{ global:{<tab>:[[row1ids],[row2ids],...]}, projects:{<pid>:{<tab>:[[row1ids],...]}} } }`. Order is **row-based** (`string[][]`): each inner array is a fixed row of widget ids. **Backward-compatible**: legacy flat arrays (`string[]`) are auto-migrated to rows using group boundaries (`flatOrderToRows`). Status effective = `global` merged with project override (project wins). Order effective = project row order ?? global row order ?? `defaultRowLayout(tab)`, **all-or-nothing per level** (not merged), always **completed** (`completeRows` appends missing registry ids into a new final row). Order writes drop a redundant override when equal to fallback.
* **Reorder UI** — `@dnd-kit` (core/sortable/modifiers/utilities). `components/dashboard-grid.tsx` (`DashboardGrid`) accepts `rows: GridItem[][]`. **View mode**: each row is a separate `flex items-stretch` container (`flex-1` per child → equal-width cards in the row); rows are stacked vertically with `space-y-4`. Cards **never flow between rows** — removing/hiding a card makes remaining cards in that row expand, but cards from the next row never move up. **Edit mode**: `DndContext` wraps all rows; each row is a `DroppableRow` with its own `SortableContext` (`horizontalListSortingStrategy`). Cross-row drag uses `onDragOver` to move the dragged item between rows in real-time (`liveRows` state). Explicit drag handle per cell (6px pointer activation). `DragOverlay` preview. `onReorder` emits the new `string[][]` row layout. Empty rows are auto-removed.
* **Row-based model**: the key behavioral change is that **rows are fixed containers**. A row with 6 stat cards keeps those 6 cards even if another row has space. Dragging a card between rows is explicit (cross-row drag in edit mode). Hiding a card shrinks its row — the other rows stay put. `defaultRowLayout(tab)` in `lib/dashboard-widgets.ts` defines the initial row grouping (stat cards in row 0, SAP/Management view in row 1, etc.).
* **Scope = global default + per-project overrides** for both axes.
  * Status: global in **Settings → Dashboard Layout** (`dashboard-layout-panel.tsx`); per-project via the **"Customize" gear** (`dashboard-customize-panel.tsx`).
  * Order: per-project via the **"Edit layout" button** in the dashboard tab bar (Admin-only, Summary tab) → drag → Save posts `{ order: string[][], tab }` to `/api/dashboard-layout/[projectId]` → reload.
* **Both APIs** (`/api/settings/dashboard-layout`, `/api/dashboard-layout/[projectId]`) handle both `{ layout }` and `{ order, tab }` (independent axes, one file), POST Admin-gated. The per-project route now accepts/returns `string[][]` for order. The settings route still uses the flat `saveGlobalOrder` wrapper which converts internally.
* **Render path** — `page.tsx` resolves `getEffectiveDashboardLayout` + `getEffectiveRowOrder(projectId,'summary'|'trends')` server-side (correct SSR, no order flash) and passes `dashboardLayout` + `summaryOrder: string[][]` + `trendsOrder: string[][]` to `DashboardClientWorkspace`. The **Summary tab is row-driven**: each visual is a case in `renderSummaryWidget(id)`, filtered by `isSummaryVisible(id)`, rendered via `DashboardGrid` with `rows` prop. Default (no file) = everything visible in `defaultRowLayout` order → the system is invisible until an Admin changes something. **Equal-height rows**: `DashboardGrid` cells use `flex-1 flex-col` so children fill the row height; `StatCard` has `h-full flex flex-col` so all stat cards in a row match the tallest.
* **Trend Analysis tab reorder is NOT wired yet** — `TrendAnalysisPanel` accepts `canCustomize`/`trendsOrder` (build-green) but still renders its 9 sections sequentially with `show(id)` gates. Its drag grid is the next phase (deliberately deferred: 2400-line file with portaled matrix popovers + drilldown; do it only after Summary drag is browser-verified).
* **Settings page** is organized into collapsible `SettingsSection` sub-modules (`components/settings-section.tsx`): Dashboard Layout (Admin-only), Company Branding, User Management, System Operations, Danger Zone, Environment Variables, Role Permissions. Server Component → `SettingsSection` takes an icon **name string** (not a component). Wrapped panels render "header-less" to avoid double chrome. The sections span full width (`w-full`).

**Not browser-verified:** the drag UX and cross-panel placement — the dashboard is behind login and the agent cannot authenticate. Verified via tsc + an order round-trip through the API (reverse preserved, unknown id dropped, omitted id appended). An Admin must click-test drag + persistence + per-project isolation.

---

## 2. Database Schema
Major operational tables in the Supabase PostgreSQL database:
* **`projects`**: Project identity, manager assignments, status codes.
* **`cn41_rows`**: CN41 planned baseline costs by WBS.
* **`gr55_rows`**: Raw actual cost postings by WBS, GL cost element, and Posting Date.
* **`sales_order_rows`**: Client billing contract items and planned revenue.
* **`historical_revenue_rows`**: Pre-2026 actual billed revenues.
* **`pm_daily_updates`**: Pending material, subcontractor, and manpower costs simulated in the field.
* **`gr55_summaries`**: Pre-aggregated GR55 postings, rebuilt by `syncGr55Summaries()` (`lib/financial-engine.ts`) on every upload/recalculate. Grouped by `wbs | po | cost_category | cost_element | business_transaction | month | upload_id`. **This is what the dashboard ships to the browser.**
* **`project_wbs_master`**: Active state toggle & revenue-generating boolean flags per WBS node.
* **`project_cost_element_control`**: whitelist/blacklist status per SAP cost element GL.
* **`revenue_wbs`**: Output summary storage cache, holding the calculated financial health of WBS items (used to feed grids and chart builders).
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

---

## 5. Files Modified Today & Recently

### Latest session — Drag-and-drop reorder (Summary tab) + misc fixes
New: `components/dashboard-grid.tsx` (reusable 12-col grid, view/edit-mode dnd). Deps: `@dnd-kit/core|sortable|modifiers|utilities`.
Changed: `lib/dashboard-widgets.ts` (+`span`, `SPAN_CLASS`, `defaultOrder`, `getWidget`), `lib/dashboard-layout.ts` (+`order` axis with sanitize/complete/effective/save), both dashboard-layout API routes (accept/return `order`), `app/(app)/dashboard/[projectId]/page.tsx` (resolve + pass `summaryOrder`/`trendsOrder`), `components/dashboard-client-workspace.tsx` (Summary tab → `renderSummaryWidget(id)` + `DashboardGrid` + Edit-layout mode; YTD IIFE lifted to a memo), `components/trend-analysis-panel.tsx` (accepts `canCustomize`/`trendsOrder` — grid deferred). Checkpoint commit `a94bf09`; feature commit `4006cdf`.
Also this session (committed): PM WBS dropdown `noTruncate` (`dark-select.tsx`, `pm-update-form.tsx`); Material Master search (`project-master-admin-panel.tsx`); PM "Submitted by" auto-fill from current user (`pm-update-form.tsx`, `pm-daily-updates/page.tsx`); Trend Filters z-index fix (dropdown was behind Cost Element card); clickable WBS → actual-cost drill-down in the Revenue-by-WBS matrix; removed duplicate Project Cost Masters from the dashboard; Settings full-width.

### Earlier session — Dashboard widget layout (show/hide) + per-project overrides
New files: `lib/dashboard-widgets.ts` (registry + `isWidgetHidden`), `lib/dashboard-layout.ts` (file store: global + per-project, flat-file migration), `components/dashboard-layout-panel.tsx` (global editor), `components/dashboard-customize-panel.tsx` (per-project gear editor), `components/settings-section.tsx` (collapsible sub-module), `app/api/settings/dashboard-layout/route.ts`, `app/api/dashboard-layout/[projectId]/route.ts`.
Changed: `app/(app)/dashboard/[projectId]/page.tsx` (reads effective layout, passes `dashboardLayout` + `canCustomize`), `components/dashboard-client-workspace.tsx` and `components/trend-analysis-panel.tsx` (gate ~30 visuals via `show(id)`; workspace hosts the Customize gear), `app/(app)/settings/page.tsx` (reorganized into `SettingsSection` accordions; Dashboard Layout section Admin-only), `lib/current-user.ts` (added `canManageDashboardLayout` = Admin-only), and the 4 existing settings panels (`company-logo-panel`, `supabase-connection-panel`, `user-management-panel`, `admin-reset-panel`) had their outer card + title stripped to render header-less inside sections. Also fixed `app/(app)/layout.tsx` (the swallowed `redirect()`). Baseline tag `dashboard-baseline-2026-07` marks the pre-change dashboard.

**Gotcha for the next dev:** the registry gate is fail-safe — a wrong/typo'd `show('...')` id resolves to *visible*, never hidden. Default (no layout file) = everything shown, so the whole system is a no-op until an Admin hides something.

### Earlier session — Revenue by WBS & Period matrix
* **[trends.ts](file:///d:/Antigravity/NMFOC%20Dashboard/lib/trends.ts)**:
  * `TrendDataPoint` gained a required **`wbsRevenue: Map<string, number>`** field — the per-WBS decomposition of each period's revenue, keyed by normalized WBS code. The engine already computed this per-WBS detail and discarded it; it is now retained rather than recalculated, which is what guarantees the matrix ties to the card.
  * `normalizeCode()` is now **exported** so consumers join rows on the identical rule.
  * `getPostedRevenueForPeriod()` was rewritten: it previously re-filtered *every* GR55 row once per period (O(periods × rows) — ~37 full scans at monthly granularity). It now reads a `Map<period, Map<wbs, amount>>` built in a **single pass**. Net performance improvement.
  * Postings roll up to the longest matching active WBS prefix, **falling back to the raw normalized code**. That fallback is load-bearing: it guarantees no posting is dropped, which is what keeps the invariant true.
  * Added a dev-only assert that the per-WBS breakdown partitions each period's total.
* **[trend-analysis-panel.tsx](file:///d:/Antigravity/NMFOC%20Dashboard/components/trend-analysis-panel.tsx)**: New **"Revenue by WBS & Period"** section (rows = WBS, columns = periods) between the Subcontractor PO card and the Drill-Down table. Inherits the panel's existing WBS / Interval / Start–End filters, so quarter and year views work for free. Adds a `"Revenue by WBS & Period"` sheet to the existing Export Excel button (built with `aoa_to_sheet`, since the period columns are dynamic).

**Layout constraints discovered the hard way — do not regress these:**
* The panel's filter bar is `sticky top-[138px] z-10` at **page** level. Any card containing sticky cells must carry `relative z-0` to create its own stacking context, or its `z-20`/`z-30` cells will paint *over* the filter bar.
* Never put `sticky` + `z-index` on `<thead>`/`<tfoot>`: a positioned `thead` creates a stacking context that traps its own corner cell beneath the body's sticky column. Sticky and z-index belong on the **cells**. Layering used: body-left `z-10` < header/footer `z-20` < corners `z-30`.
* Sticky cells need **fully opaque** backgrounds (`bg-panel` / `bg-panel2`). Translucent utilities like `bg-accent/10` let scrolling columns ghost through.
* Use `border-separate border-spacing-0`, not `border-collapse`: collapsed borders detach from sticky cells and scroll away. Consequently row rules live on cells, not on `<tr>` (a border on `<tr>` only paints under `border-collapse`).
* Runtime-computed widths must be an **inline style**. Tailwind cannot JIT `min-w-[${n}px]` and the table silently collapses.

### Earlier sessions
* **[pagination.ts](file:///d:/Antigravity/NMFOC%20Dashboard/lib/supabase/pagination.ts)**: Enforced strict `.order('id', { ascending: true })` constraints on paginated database queries to make pagination stable and prevent PostgreSQL arbitrary row ordering fluctuations.
* **[recalculate/route.ts](file:///d:/Antigravity/NMFOC%20Dashboard/app/api/financial-sources/recalculate/route.ts)** & **[pm-updates/route.ts](file:///d:/Antigravity/NMFOC%20Dashboard/app/api/pm-updates/route.ts)**: Queried and passed `historicalRevenueRows` to the calculations engine so that the pre-2026 baseline is not wiped out on recalculations or simulated updates.
* **[dashboard-client-workspace.tsx](file:///d:/Antigravity/NMFOC%20Dashboard/components/dashboard-client-workspace.tsx)**: Passed `historicalRevenueRows` to the trend builder hook (`buildTrendData`) so that the dashboard charts correctly establish the historical baseline.
* **[financial-imports.ts](file:///d:/Antigravity/NMFOC%20Dashboard/lib/financial-imports.ts)**: Replaced `toISOString()` with local date component extraction in `toIsoDate` to stop timezone drift.
* **[calculations.ts](file:///d:/Antigravity/NMFOC%20Dashboard/lib/calculations.ts)**: Standardized MTD and YTD calculations on the SAP billing offset formula to match trend metrics.
* **[trends.ts](file:///d:/Antigravity/NMFOC%20Dashboard/lib/trends.ts)**: Restored trend analysis to use the original historical sum of postings vs current month POC delta method.
* **[utils.ts](file:///d:/Antigravity/NMFOC%20Dashboard/lib/utils.ts)**: Fixed standard and compact currency functions to print `SAR ` instead of `₼`.
* **[dashboard-wbs-filter.tsx](file:///d:/Antigravity/NMFOC%20Dashboard/components/dashboard-wbs-filter.tsx)**: Added Month Selector dropdown, sticky summary footer, and aligned client recalculations with billing offset formula.
* **[company-logo-panel.tsx](file:///d:/Antigravity/NMFOC%20Dashboard/components/company-logo-panel.tsx)**: Created branding inputs and uploader panels for sidebar and login logos.
* **[settings/page.tsx](file:///d:/Antigravity/NMFOC%20Dashboard/app/(app)/settings/page.tsx)**: Integrated `<CompanyLogoPanel />` into settings.
* **[sidebar.tsx](file:///d:/Antigravity/NMFOC%20Dashboard/components/sidebar.tsx)**: Made header dynamic, logo size `w-12 h-12` (48px), and text size `17px` for high-visibility branding.
* **[login/page.tsx](file:///d:/Antigravity/NMFOC%20Dashboard/app/(auth)/login/page.tsx)**: Integrated dynamic login banner/logo URLs and set header text color to `#005B7F`.
* **[cn41-upload-form.tsx](file:///d:/Antigravity/NMFOC%20Dashboard/components/cn41-upload-form.tsx)**, **[project-admin-details-form.tsx](file:///d:/Antigravity/NMFOC%20Dashboard/components/project-admin-details-form.tsx)**, **[project-wbs-master-panel.tsx](file:///d:/Antigravity/NMFOC%20Dashboard/components/project-wbs-master-panel.tsx)**, **[project-cost-element-control-panel.tsx](file:///d:/Antigravity/NMFOC%20Dashboard/components/project-cost-element-control-panel.tsx)**: Changed `router.refresh()` to `window.location.reload()` on recalculate to push data changes instantly.

---

## 6. Open Issues

### Code bugs
* ~~Signed-out users get "Internal Server Error" instead of the login page~~ **FIXED** (`app/(app)/layout.tsx`): the `redirect('/login')` was inside a `try/catch` that swallowed the `NEXT_REDIRECT` throw, so the request 500'd. Now the session is computed inside the `try` (tolerating Supabase outages) and `redirect()` is called outside it. Verified: signed-out `/dashboard` → 307 `/login`.
* **`selectedPos` is not passed to `baseTrendData`** (`components/trend-analysis-panel.tsx`): `buildTrendData` accepts `selectedPos`, and `dashboard-client-workspace.tsx` *does* pass it — but the Trend panel does not. So the trend charts, the In Month Rev card, and the WBS × Period matrix are all **PO-blind**, while `filteredWbsRows` and the drill-down table honour the PO filter. With a PO selected, the card and the drill-down describe different populations. Fixing this **will move the card's number**, so it needs its own verification pass.
* **`getProjectWbsMaster()` does not paginate** (`lib/data.ts`): plain `select` capped at Supabase's default 1000 rows. It would silently truncate above 1000 WBS codes, and that map drives the cost-WBS filter.
* **`revenue_wbs.reporting_period` drifts per WBS**: each row's period is derived from *that WBS's own* latest posting date, so a project's rows can span many different months (currently 12 distinct values plus 30 nulls). Summing `mtd_revenue_recognition` across them adds different months together. The trends engine does not have this problem (one project-wide period).
* **`getGr55Rows()` is dead code** (`lib/data.ts`): no callers. Either delete it or find out which page regressed to summaries.

### Operational
* **Ingestion Timeouts**: Uploading massive GR55 exports (50,000+ rows) can take up to 25–30 seconds. On standard serverless runtimes (like Vercel), this may occasionally exceed HTTP execution timeout boundaries (10–15s), yielding a gateway error in the browser while the insertions continue processing in the database background.
* **`.next/` is committed to git** — 526 build-artifact files are tracked, and `.gitignore` contains only `node_modules`. This produces constant diff noise and makes a corrupted dev build awkward to clear. Recommended: add `.next` to `.gitignore` and `git rm -r --cached .next`.

### Data quality (SEC NG NMFOC Jeddah)
* **WBS `SIS-NGS.FOC.W.JD.00421` has a planned cost of 1.00 SAR** against 863,466.46 of planned revenue. Its 0.41 SAR of actual cost yields a 41% POC and **354,021.25 of recognized revenue** off a sub-riyal posting. This single row is larger than the entire In Month Rev figure — because that card is a *residual*, a bad planned-cost baseline passes straight to the bottom line undiluted. Verify the CN41 source for this WBS.
* Roughly half the revenue-generating WBS trip at least one baseline check (planned cost suspiciously low, POC capped because actual exceeded plan, or barely-started at <5%).

---

## 7. Next Recommended Tasks
1. **Wire the Trend Analysis tab's drag grid** *(next phase, deferred)* — apply the proven `DashboardGrid` pattern to the 9 trends widgets in `trend-analysis-panel.tsx`: extract each `{show('trends.X') && (...)}` section into a `renderTrendWidget(id)` case, build `isTrendVisible(id)` (preserve the `subcontractorPo` conditional), render via `DashboardGrid` in `trendsOrder`, add an Admin-only "Edit layout" button + Save/Cancel (POST `{ order, tab:'trends' }`). Do it **after** an Admin confirms Summary drag works in-browser. Higher risk: portaled matrix column-filter popovers + the drilldown.
2. **Browser-verify the dashboard-layout UI as an Admin** — storage + both APIs are curl-verified (migration, inheritance, project-override-wins, order reverse/sanitize/append, 403 for non-admins), but the authenticated UI (Settings accordions, the Customize gear + hide, and the new **Edit layout drag**) was never seen — the agent cannot log in. Confirm drag lands cross-panel, Save persists, and per-project order is isolated.
2. **Finish the pre-aggregation migration** *(partially done)*: `syncGr55Summaries()` already exists and the **dashboard already reads `gr55_summaries`**. What remains is the calculation path — `app/api/financial-sources/recalculate/route.ts` and `lib/financial-engine.ts` still read raw `gr55_rows`. Verified equivalent: `buildTrendData` produces **identical** results from `gr55_summaries` and raw `gr55_rows`, so the summaries preserve the amounts at month granularity.
3. **Excel Ingestion Progress Bar**: Add client-side chunking/progress feedback to the uploader component.
4. **Consider deriving the reporting period project-wide** rather than per-WBS in `lib/calculations.ts`, so `revenue_wbs` stops mixing months (see Open Issues).
