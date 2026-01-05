# Month-End Dashboard - UX Redesign Inventory

## 1) Top Bar / Run Context

### File: `web/src/components/TopBar.tsx`
- **Component**: `TopBar` (default export)
- **Renders**: Sticky top navigation bar with brand, period context, and nav links
- **Key Code**:
  ```tsx
  // Period context display (lines 69-87)
  const orgLine = orgId ? orgName ? `orgId: ${orgId} • ${orgName}` : `orgId: ${orgId}` : "orgId: —";
  const from = state.from || "—";
  const to = state.to || "—";
  // Rendered as: {orgLine} • Period: {from} → {to}
  ```
- **Navigation Links** (lines 59-67):
  - Home (`/`)
  - Trial Balance (`/tb`)
  - Balance Sheet (`/bs`)
  - P&L (`/pnl`)
  - Cash Flow (`/cf`)
  - Accruals (`/accruals`)
  - Recon (`/recon`)

### File: `web/src/app/page.tsx`
- **Component**: `HomePage` (default export)
- **"From / To" Date Inputs** (lines 757-779):
  ```tsx
  <div className="flex flex-wrap items-end gap-3">
    <div>
      <label>From</label>
      <input type="date" value={from} onChange={(e) => setState({ from: e.target.value })} />
    </div>
    <div>
      <label>To</label>
      <input type="date" value={to} onChange={(e) => setState({ to: e.target.value })} />
    </div>
  </div>
  ```
- **"Hide" Button** (lines 781-787):
  ```tsx
  <button onClick={() => setLeftOpen((v) => !v)}>
    {leftOpen ? "Hide" : "Setup / Rules"}
  </button>
  ```
- **"API: OK" Status** (lines 791-807):
  ```tsx
  <div className="rounded-3xl border border-slate-200 bg-white/80 shadow-sm backdrop-blur p-5">
    <div>Status</div>
    {process.env.NODE_ENV === "development" && (
      <div>API: {apiOnline ? "OK" : "OFFLINE"}</div>
    )}
    <div>{status || "—"}</div>
    {process.env.NODE_ENV !== "production" && (
      <div>API_BASE={API_BASE}</div>
    )}
  </div>
  ```
- **State Management**:
  - `apiOnline` state (line 179): Managed via `checkApiHealth()` polling (lines 351-364)
  - `status` state (line 175): Updated by various actions
  - Period state: Managed by `OrgPeriodProvider` (`useOrgPeriod()` hook)

---

## 2) Rules/Setup/Ownership Section

### File: `web/src/app/page.tsx`
- **Component**: `HomePage`
- **Left Panel Toggle** (lines 810-1633):
  - Controlled by `leftOpen` state (line 183)
  - Tabs: `leftTab` state (line 184): `"setup" | "rules" | "account-owners"`
  - **Setup Tab** (lines 845-512): Org creation, QBO connection
  - **Rules Tab** (lines 513-1240): Rule management UI
  - **Account Ownership Tab** (lines 1418-1692): Account owner assignments
- **Key Code**:
  ```tsx
  {leftOpen && (
    <section className="rounded-3xl border border-slate-200 bg-white/80 shadow-sm backdrop-blur p-5">
      <div className="flex items-center justify-between gap-3">
        <div>{leftTab === "setup" ? "Setup" : leftTab === "rules" ? "Rules" : "Account Ownership"}</div>
        <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1">
          <button onClick={() => setLeftTab("setup")}>Setup</button>
          <button onClick={() => setLeftTab("rules")}>Rules</button>
          <button onClick={() => setLeftTab("account-owners")}>Account Ownership</button>
        </div>
      </div>
      {/* Tab content */}
    </section>
  )}
  ```

---

## 3) Top Navigation

### File: `web/src/components/TopBar.tsx`
- **Component**: `TopBar`
- **NavLink Component** (lines 19-52):
  - **Styling Classes** (lines 31-46):
    ```tsx
    className={[
      "h-10 min-w-[113px] px-2.5",           // Size
      "rounded-2xl text-sm font-semibold",    // Shape/text
      "border shadow-sm backdrop-blur",       // Visual
      "transition-all duration-200 ease-out", // Transitions
      "hover:scale-125 active:scale-110",      // Hover/active transforms
      "focus:ring-4 focus:ring-blue-300",     // Focus styles
      active ? "border-blue-400 bg-white" : "border-slate-200/80 bg-white/80"
    ].join(" ")}
    ```
  - **Hover Behavior**: `hover:scale-125` (25% scale increase)
  - **Active State**: `border-blue-400 bg-white text-slate-900 shadow-md`
  - **Inactive State**: `border-slate-200/80 bg-white/80 text-slate-800 hover:bg-white hover:shadow-md`
- **Layout**: Rendered in `web/src/app/layout.tsx` (line 37) - wraps all pages

---

## 4) Reports (TB/BS/P&L/CF)

### Route Structure
All reports are **separate App Router routes**:
- **Trial Balance**: `web/src/app/tb/page.tsx`
- **Balance Sheet**: `web/src/app/bs/page.tsx`
- **P&L**: `web/src/app/pnl/page.tsx`
- **Cash Flow**: `web/src/app/cf/page.tsx`

### Trial Balance (`/tb`)

**File**: `web/src/app/tb/page.tsx`
- **Component**: `TrialBalancePage` (default export)
- **API Function**: `loadTrialBalance(orgId, from, to)` from `@/lib/api`
- **API Endpoint**: `GET /qbo/tb?orgId={orgId}&from={from}&to={to}`
- **Data Shape**:
  ```typescript
  type TbRow = {
    accountId?: string;
    accountName?: string;
    accountType?: string;
    beginning?: number | null;
    debit?: number | null;
    credit?: number | null;
    ending?: number | null;
  };
  ```
- **Raw Data Structure**: `{ tb: { Rows: { Row: TbRow[] } } }`
- **Key Code** (lines 114-143):
  ```tsx
  async function loadTbAuto() {
    const json = await loadTrialBalance(orgId, fromIso, toIso);
    setRaw(json);
    const rawRows = json?.tb?.Rows?.Row ?? [];
    // Accounts computed via useMemo from rawRows
  }
  ```

### Balance Sheet (`/bs`)

**File**: `web/src/app/bs/page.tsx`
- **Component**: `BalanceSheetPage` (default export)
- **API Functions**:
  - `loadBalanceSheet(orgId, from, to)` - Single month
  - `loadBalanceSheetSeries(orgId, from, to)` - Multi-month
- **API Endpoints**:
  - `GET /qbo/bs?orgId={orgId}&from={from}&to={to}`
  - `GET /qbo/bs/series?orgId={orgId}&from={from}&to={to}`
- **Data Processing**:
  - Uses `flattenQboRows()` from `@/lib/qboFlatten`
  - Uses `buildStatementTree()` and `flattenStatementTree()` from `@/lib/statementTree`
- **Data Shape**: `StatementRow[]` (hierarchical tree structure)
- **Key Code** (lines 332-357):
  ```tsx
  async function loadBsAuto() {
    if (spansMultipleMonths) {
      const series = await loadBalanceSheetSeries(orgId, from, to);
      setSeriesData(series);
    } else {
      const data = await loadBalanceSheet(orgId, from, to);
      setRaw(data);
    }
  }
  ```

### P&L (`/pnl`)

**File**: `web/src/app/pnl/page.tsx`
- **Component**: `PnlPage` (default export)
- **API Functions**:
  - `loadPnl(orgId, from, to)` - Single month
  - `loadPnlSeries(orgId, from, to)` - Multi-month
- **API Endpoints**:
  - `GET /qbo/pnl?orgId={orgId}&from={from}&to={to}`
  - `GET /qbo/pnl/series?orgId={orgId}&from={from}&to={to}`
- **Data Processing**: Same as BS (uses `flattenQboRows`, `buildStatementTree`, `flattenStatementTree`)
- **Data Shape**: `StatementRow[]` (hierarchical tree structure)
- **Key Code** (lines 211-225):
  ```tsx
  async function loadPnlAuto() {
    if (spansMultipleMonths) {
      const series = await loadPnlSeries(orgId, from, to);
      setSeriesData(series);
    } else {
      const data = await loadPnl(orgId, from, to);
      setRaw(data);
    }
  }
  ```

### Cash Flow (`/cf`)

**File**: `web/src/app/cf/page.tsx`
- **Component**: `CashFlowPage` (default export)
- **API Functions**:
  - `loadCashFlow(orgId, from, to)` - Single month
  - `loadCashFlowSeries(orgId, from, to)` - Multi-month
- **API Endpoints**:
  - `GET /qbo/cf?orgId={orgId}&from={from}&to={to}`
  - `GET /qbo/cf/series?orgId={orgId}&from={from}&to={to}`
- **Data Processing**: Same as BS/P&L (uses `flattenQboRows`, `buildStatementTree`, `flattenStatementTree`)
- **Data Shape**: `StatementRow[]` (hierarchical tree structure)
- **Key Code** (lines 56-79):
  ```tsx
  async function loadCfAuto() {
    if (spansMultipleMonths) {
      const series = await loadCashFlowSeries(orgId, from, to);
      setSeriesData(series);
    } else {
      const data = await loadCashFlow(orgId, from, to);
      setRaw(data);
    }
  }
  ```

### Shared Components
- **ReportHeader**: `web/src/components/ReportHeader.tsx` - Shared header for all reports
- **StatementTable**: `web/src/components/StatementTable.tsx` - Renders hierarchical statement data (BS/P&L/CF)
- **SeriesTable**: `web/src/components/SeriesTable.tsx` - Renders multi-month series data

### API Module
**File**: `web/src/lib/api.ts`
- **Functions** (lines 382-453):
  - `loadPnl(orgId, from, to)`
  - `loadTrialBalance(orgId, from, to)`
  - `loadBalanceSheet(orgId, from, to)`
  - `loadCashFlow(orgId, from, to)`
  - `loadPnlSeries(orgId, from, to)`
  - `loadTrialBalanceSeries(orgId, from, to)`
  - `loadBalanceSheetSeries(orgId, from, to)`
  - `loadCashFlowSeries(orgId, from, to)`

---

## 5) Month-End Run / Review

### "Run Month End" Button

**File**: `web/src/app/page.tsx`
- **Location**: Lines 1642-1649
- **Code**:
  ```tsx
  <button
    className={`${ui.btn} ${ui.btnPrimary}`}
    onClick={onRunMonthEnd}
    disabled={!hasOrgId}
  >
    Run Month-End
  </button>
  ```

### Handler Function

**File**: `web/src/app/page.tsx`
- **Function**: `onRunMonthEnd()` (lines 659-722)
- **API Call**: `runMonthEndQbo(payload)` from `@/lib/api`
- **API Endpoint**: `POST /runs/month-end/qbo`
- **Payload**:
  ```typescript
  {
    orgId: string;
    from: string;
    to: string;
    rules?: Rule[]; // Optional: draft rules override
  }
  ```
- **Response**:
  ```typescript
  {
    ok: boolean;
    netIncome?: number | null;
    findings?: Finding[];
    error?: string;
  }
  ```

### Last Run Loading

**File**: `web/src/app/page.tsx`
- **Function**: `getMonthEndRun(orgId, from, to)` from `@/lib/api`
- **API Endpoint**: `GET /runs/month-end/qbo?orgId={orgId}&from={from}&to={to}`
- **Location**: Lines 366-393 (useEffect hook)
- **Code**:
  ```tsx
  useEffect(() => {
    (async () => {
      if (!hasOrgId || !from || !to) return;
      const run = await getMonthEndRun(orgId, from, to);
      if (run.found && run.findings) {
        setFindings(asArray<Finding>(run.findings));
        if (typeof run.netIncome === "number") {
          setNetIncomeValue(run.netIncome);
        }
        setStatus(`Loaded last run for ${from} → ${to} ✅`);
      }
    })();
  }, [orgId, from, to]);
  ```

### State Management

**File**: `web/src/app/page.tsx`
- **State Variables**:
  - `findings` (line 177): `Finding[]` - Array of findings from last run
  - `netIncomeValue` (line 178): `number | null` - Net income from last run
  - `status` (line 175): `string` - Status message (includes "Month-end completed ✅" on success)

### API Functions

**File**: `web/src/lib/api.ts`
- **`runMonthEndQbo(args)`** (lines 328-346):
  - Endpoint: `POST ${API_BASE}/runs/month-end/qbo`
  - Body: `{ orgId, from, to, rules? }`
- **`getMonthEndRun(orgId, from, to)`** (lines 348-377):
  - Endpoint: `GET ${API_BASE}/runs/month-end/qbo?orgId={orgId}&from={from}&to={to}`
  - Returns: `{ ok, found, runId?, orgId?, from?, to?, netIncome?, findings?, ruleEngineVersion?, createdAt? }`

---

## Summary: File Paths (Relative to Repo Root)

### Core Components
- `web/src/components/TopBar.tsx` - Top navigation bar
- `web/src/components/ui.ts` - Button styling utilities
- `web/src/components/ReportHeader.tsx` - Shared report header
- `web/src/components/StatementTable.tsx` - Hierarchical statement table
- `web/src/components/SeriesTable.tsx` - Multi-month series table
- `web/src/components/OrgPeriodProvider.tsx` - Global org/period state

### Pages
- `web/src/app/page.tsx` - Home page (Setup/Rules/Findings)
- `web/src/app/tb/page.tsx` - Trial Balance
- `web/src/app/bs/page.tsx` - Balance Sheet
- `web/src/app/pnl/page.tsx` - P&L
- `web/src/app/cf/page.tsx` - Cash Flow
- `web/src/app/accruals/page.tsx` - Accruals
- `web/src/app/recon/page.tsx` - Reconciliation
- `web/src/app/layout.tsx` - Root layout (includes TopBar)

### API & Data
- `web/src/lib/api.ts` - All API functions (reports, month-end run, rules, etc.)
- `web/src/lib/statementTree.ts` - Tree building/flattening for BS/P&L/CF
- `web/src/lib/qboFlatten.ts` - QBO data flattening utilities
- `web/src/lib/ownerResolver.ts` - Account ownership resolution

### Styling
- `web/src/components/ui.ts` - Button classes (`ui.btn`, `ui.btnPrimary`, `ui.btnGhost`)
- `web/src/app/globals.css` - Global styles + Tailwind directives

---

## Key UI Strings Reference

| String | File | Line(s) | Context |
|--------|------|---------|---------|
| "From" | `web/src/app/page.tsx` | 760 | Date input label |
| "To" | `web/src/app/page.tsx` | 771 | Date input label |
| "Hide" | `web/src/app/page.tsx` | 786 | Toggle button (when left panel open) |
| "Setup / Rules" | `web/src/app/page.tsx` | 786 | Toggle button (when left panel closed) |
| "Run Month-End" | `web/src/app/page.tsx` | 1648 | Primary action button |
| "Month-end completed ✅" | `web/src/app/page.tsx` | 711, 713, 717 | Status message |
| "API: OK" | `web/src/app/page.tsx` | 797 | API health indicator |
| "API_BASE=" | `web/src/app/page.tsx` | 804 | Dev-only debug info |
| "Setup" | `web/src/app/page.tsx` | 827 | Tab button |
| "Rules" | `web/src/app/page.tsx` | 833 | Tab button |
| "Account Ownership" | `web/src/app/page.tsx` | 839 | Tab button |
| "Trial Balance" | `web/src/components/TopBar.tsx` | 61 | Nav link |
| "Balance Sheet" | `web/src/components/TopBar.tsx` | 62 | Nav link |
| "P&L" | `web/src/components/TopBar.tsx` | 63 | Nav link |
| "Cash Flow" | `web/src/components/TopBar.tsx` | 64 | Nav link |
| "Accruals" | `web/src/components/TopBar.tsx` | 65 | Nav link |
| "Recon" | `web/src/components/TopBar.tsx` | 66 | Nav link |

