// web/src/components/StatementTable.tsx
// Renders hierarchical financial statement tables with proper formatting, indentation, and subtotals

import { useMemo, type ReactNode } from "react";
import { type FlattenedStatementRow } from "@/lib/statementTree";
import { REPORT_TABLE_STYLES } from "./ReportTable";

type ColumnModel = { key: string; label: string };

type StatementTableProps = {
  rows: FlattenedStatementRow[];
  columns: string[] | ColumnModel[]; // Column headers: either string[] (legacy) or ColumnModel[] (key + label)
  formatMoney?: (value: number | null | undefined) => string;
};

/**
 * Format money value with thousands separators, 2 decimals, negatives in parentheses.
 */
function defaultFormatMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const absValue = Math.abs(value);
  const formatted = absValue.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return value < 0 ? `(${formatted})` : formatted;
}

export function StatementTable({
  rows,
  columns,
  formatMoney = defaultFormatMoney,
}: StatementTableProps) {
  // Normalize columns to ColumnModel format
  const columnModels: ColumnModel[] = useMemo(() => {
    if (columns.length === 0) return [{ key: "account", label: "Account" }];
    // Check if first column is already a ColumnModel
    if (typeof columns[0] === "object" && "key" in columns[0]) {
      return columns as ColumnModel[];
    }
    // Legacy format: string[] - convert to ColumnModel[]
    return (columns as string[]).map((col, idx) => ({
      key: idx === 0 ? "account" : col || `col${idx}`,
      label: col || (idx === 0 ? "Account" : ""),
    }));
  }, [columns]);
  
  return (
    <div className={REPORT_TABLE_STYLES.container}>
      <table className={REPORT_TABLE_STYLES.table}>
        <thead className={REPORT_TABLE_STYLES.thead}>
          <tr>
            {columnModels.map((col, i) => (
              <th
                key={col.key}
                className={
                  i === 0
                    ? `${REPORT_TABLE_STYLES.th} min-w-[420px]`
                    : `${REPORT_TABLE_STYLES.thNumeric} min-w-[140px]`
                }
              >
                {col.label || (i === 0 ? "Account" : "")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const isGroup = row.isGroup;
            const isSubtotal = row.isSubtotal;
            const isTotal = row.isTotal;
            const indent = row.indent;

            // Determine row styling
            let rowClass = REPORT_TABLE_STYLES.tr;
            let cellClass = REPORT_TABLE_STYLES.tdAccount;
            let numericClass = REPORT_TABLE_STYLES.tdNumeric;

            if (isGroup) {
              rowClass = REPORT_TABLE_STYLES.trGroup;
              cellClass = REPORT_TABLE_STYLES.tdGroup;
              numericClass = REPORT_TABLE_STYLES.tdTotal;
            } else if (isSubtotal || isTotal) {
              rowClass = `${REPORT_TABLE_STYLES.tr} border-t border-slate-300`;
              cellClass = REPORT_TABLE_STYLES.tdGroup;
              numericClass = REPORT_TABLE_STYLES.tdTotal;
            }

            // CRITICAL: Use row.label (from flattened tree), NOT row.path or row.account_name
            // row.label is already formatted as "35 - Checking" for leaves, or "Assets" for groups
            const labelDisplay: ReactNode = row.label;

            return (
              <tr key={row.key || `row-${idx}`} className={rowClass}>
                <td className={cellClass} style={{ paddingLeft: `${8 + indent}px` }}>
                  <div className={isGroup || isSubtotal || isTotal ? "font-semibold" : ""}>
                    {labelDisplay}
                  </div>
                </td>
                {columnModels.slice(1).map((col) => {
                  // Use col.key to lookup value (e.g., "2025-09", "start", "end")
                  const value = row.values[col.key] ?? null;
                  
                  // Group headers should have blank cells, not "—" placeholders
                  if (isGroup) {
                    return (
                      <td key={col.key} className={numericClass}>
                        {/* Empty cell for group headers */}
                      </td>
                    );
                  }
                  
                  // For leaf/subtotal/total rows, use formatMoney (which shows "—" for null/undefined)
                  return (
                    <td key={col.key} className={numericClass}>
                      {formatMoney(value)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

