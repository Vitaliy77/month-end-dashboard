// web/src/components/ReportTable.tsx
// Shared table component with book-like spacing for financial reports

import { type ReactNode } from "react";

export const REPORT_TABLE_STYLES = {
  // Table container
  container: "overflow-auto rounded-2xl border border-slate-200 bg-white",
  // Table element
  table: "min-w-[980px] w-full text-sm leading-snug",
  // Header - denser: py-1.5 instead of py-2
  thead: "sticky top-0 bg-slate-50 border-b border-slate-200",
  th: "px-4 py-1.5 text-left font-medium text-slate-700 tracking-wide",
  thNumeric: "px-4 py-1.5 text-right font-medium text-slate-700 tracking-wide tabular-nums",
  // Body rows
  tr: "border-b border-slate-100 hover:bg-slate-50/60",
  trGroup: "border-b border-slate-200 bg-slate-50/40",
  trTotal: "border-t-2 border-slate-300 bg-white font-semibold",
  // Cells - denser: py-0.5 instead of py-1
  td: "px-4 py-0.5 text-slate-900",
  tdNumeric: "px-4 py-0.5 text-right tabular-nums text-slate-900",
  tdAccount: "px-4 py-0.5 text-slate-900", // Account name - allows wrapping
  tdGroup: "px-4 py-1 font-semibold text-slate-900", // Group label - slightly more space
  tdTotal: "px-4 py-1 text-right tabular-nums font-semibold text-slate-900", // Total rows - slightly more space
};

type ReportTableProps = {
  columns: string[];
  children: ReactNode;
  className?: string;
};

export function ReportTable({ columns, children, className = "" }: ReportTableProps) {
  const columnsCount = Math.max(columns.length, 2);

  return (
    <div className={`${REPORT_TABLE_STYLES.container} ${className}`}>
      <table className={REPORT_TABLE_STYLES.table}>
        <thead className={REPORT_TABLE_STYLES.thead}>
          <tr>
            {columns.map((c, i) => (
              <th
                key={i}
                className={
                  i === 0
                    ? REPORT_TABLE_STYLES.th
                    : `${REPORT_TABLE_STYLES.thNumeric} min-w-[140px]`
                }
              >
                {c || (i === 0 ? "Account" : "")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

