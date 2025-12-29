type QboRow = any;

export type PnlLine = {
  name: string;
  value: number;
  source?: "data" | "summary";
  // Parent section (Income / Expenses / etc.)
  section?: string;
  // QBO group key if present (NetIncome, Expenses, etc.)
  group?: string;
};

function toNumber(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/,/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function cleanName(v: any): string {
  return String(v ?? "").trim();
}

function getTotalColIndex(reportJson: any): number | null {
  const cols = reportJson?.Columns?.Column;
  if (!Array.isArray(cols)) return null;

  // Prefer metadata ColKey=total, else ColTitle="Total"
  for (let i = 0; i < cols.length; i++) {
    const meta = cols[i]?.MetaData;
    if (Array.isArray(meta)) {
      const colKey = meta.find((m: any) => m?.Name === "ColKey")?.Value;
      if (String(colKey).toLowerCase() === "total") return i;
    }
  }
  for (let i = 0; i < cols.length; i++) {
    if (String(cols[i]?.ColTitle ?? "").toLowerCase().trim() === "total") return i;
  }
  return null;
}

function pickValueFromCols(cols: any[], preferredIdx: number | null): number | null {
  // Try preferred column (Total)
  if (preferredIdx != null && preferredIdx >= 1 && preferredIdx < cols.length) {
    const n = toNumber(cols[preferredIdx]?.value);
    if (n != null) return n;
  }

  // Otherwise scan right-to-left (skip the name column 0)
  for (let i = cols.length - 1; i >= 1; i--) {
    const n = toNumber(cols[i]?.value);
    if (n != null) return n;
  }

  // Fallback
  const n1 = toNumber(cols[1]?.value);
  return n1 != null ? n1 : null;
}

function walkRows(
  rows: any,
  fn: (row: QboRow, ctx: { section?: string }) => void,
  ctx: { section?: string } = {}
) {
  if (!rows) return;
  const arr = Array.isArray(rows) ? rows : rows.Row;
  if (!arr) return;

  for (const r of arr) {
    // If this is a Section with a Header, treat that header as the current section label
    let nextCtx = ctx;
    const headerCols = r?.Header?.ColData;
    if (Array.isArray(headerCols) && headerCols[0]?.value) {
      const sec = cleanName(headerCols[0]?.value);
      if (sec) nextCtx = { ...ctx, section: sec };
    }

    fn(r, nextCtx);

    if (r?.Rows?.Row) walkRows(r.Rows, fn, nextCtx);
  }
}

function addLine(
  out: PnlLine[],
  name: any,
  value: number | null,
  source: "data" | "summary",
  extras: { group?: string; section?: string }
) {
  const n = cleanName(name);
  if (!n) return;
  if (value == null) return;

  const lower = n.toLowerCase();
  if (lower === "total") return;

  const keepZero =
    lower.includes("net income") ||
    lower.includes("net operating income") ||
    lower.includes("gross profit") ||
    lower.includes("total income") ||
    lower.includes("total expenses");

  if (!keepZero && value === 0) return;

  out.push({ name: n, value, source, group: extras.group, section: extras.section });
}

/**
 * Extract P&L lines from QBO ProfitAndLoss report JSON.
 * - Captures account-level Data rows (row.ColData).
 * - Captures Section totals from row.Summary.ColData (Total Expenses, Net Income, etc.).
 * - Tracks parent section labels (Income, Expenses, etc.).
 */
export function extractPnlLines(reportJson: any): PnlLine[] {
  const rows: QboRow[] = reportJson?.Rows?.Row ?? [];
  const out: PnlLine[] = [];
  const totalIdx = getTotalColIndex(reportJson);

  walkRows(rows, (r, ctx) => {
    // Data rows (accounts)
    if (Array.isArray(r?.ColData)) {
      const cols = r.ColData;
      const name = cols[0]?.value;
      const value = pickValueFromCols(cols, totalIdx);
      addLine(out, name, value, "data", { group: r?.group, section: ctx.section });
    }

    // Summary rows (totals/net income/etc.)
    if (Array.isArray(r?.Summary?.ColData)) {
      const cols = r.Summary.ColData;
      const name = cols[0]?.value;
      const value = pickValueFromCols(cols, totalIdx);
      addLine(out, name, value, "summary", { group: r?.group, section: ctx.section });
    }
  });

  // De-dupe safely:
  // For each key, keep the value with the largest magnitude (avoids accidental double-counting).
  const best = new Map<string, PnlLine>();

  for (const line of out) {
    const key = `${line.section ?? ""}::${line.source ?? ""}::${line.name}`;
    const prev = best.get(key);
    if (!prev || Math.abs(line.value) > Math.abs(prev.value)) {
      best.set(key, line);
    }
  }

  return [...best.values()];
}

/**
 * Find Net Income from the P&L report.
 * In your QBO output, Net Income is a Section Summary row.
 */
export function findNetIncome(reportJson: any): number | null {
  const rows: QboRow[] = reportJson?.Rows?.Row ?? [];
  const totalIdx = getTotalColIndex(reportJson);

  let found: number | null = null;

  walkRows(rows, (r) => {
    // Prefer Summary rows
    const cols = r?.Summary?.ColData ?? r?.ColData;
    if (!Array.isArray(cols) || cols.length < 2) return;

    const label = cleanName(cols[0]?.value).toLowerCase();
    const group = String(r?.group ?? "").toLowerCase();

    const isNetIncome =
      label === "net income" ||
      label.includes("net income") ||
      group === "netincome";

    if (!isNetIncome) return;

    const v = pickValueFromCols(cols, totalIdx);
    if (v != null) found = v;
  });

  return found;
}
