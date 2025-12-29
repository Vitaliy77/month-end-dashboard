// web/src/components/SeriesTable.tsx
"use client";

import { useMemo } from "react";
import type { SeriesResponse } from "@/lib/api";

function formatMoney(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMonthLabel(monthKey: string): string {
  // "2025-09" -> "Sep 2025"
  const [year, month] = monthKey.split("-");
  const monthNum = parseInt(month, 10);
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${monthNames[monthNum - 1]} ${year}`;
}

function priorDay(dateISO: string): string {
  const d = new Date(dateISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split("T")[0];
}

type SeriesTableProps = {
  data: SeriesResponse;
  reportType: "tb" | "bs" | "pnl" | "cf";
  from: string;
  to: string;
};

export function SeriesTable({ data, reportType, from, to }: SeriesTableProps) {
  const { columns, rows, months } = data;

  const isBalanceReport = reportType === "tb" || reportType === "bs";

  const columnHeaders = useMemo(() => {
    return columns.map((col) => {
      if (col === "start") {
        return {
          key: "start",
          label: "Start",
          tooltip: `As of ${priorDay(from)} (day before period start)`,
          sticky: true,
        };
      }
      if (col === "end") {
        return {
          key: "end",
          label: "End",
          tooltip: `As of ${to} (period end)`,
          sticky: true,
        };
      }
      // Month column
      return {
        key: col,
        label: formatMonthLabel(col),
        tooltip: `Month: ${col}`,
        sticky: false,
      };
    });
  }, [columns, from, to]);

  return (
    <div className="overflow-auto rounded-2xl border border-slate-200 bg-white">
      <table className="min-w-[980px] w-full text-sm">
        <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
          <tr>
            <th className="px-4 py-3 font-semibold text-slate-700 text-left min-w-[360px] sticky left-0 bg-slate-50 z-20">
              Account Name
            </th>
            {columnHeaders.map((col, idx) => (
              <th
                key={col.key}
                className={[
                  "px-4 py-3 font-semibold text-slate-700 text-right min-w-[140px]",
                  col.sticky && idx === 0 ? "sticky left-[360px] bg-slate-50 z-20" : "",
                  col.sticky && idx === columnHeaders.length - 1 ? "sticky right-0 bg-slate-50 z-20" : "",
                ].join(" ")}
                title={col.tooltip}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length + 1} className="px-4 py-8 text-center text-slate-600">
                No data available
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={row.account_id || `${row.account_name}-${i}`} className="border-b border-slate-100 hover:bg-slate-50/60">
                <td className="px-4 py-2.5 text-slate-900 sticky left-0 bg-white z-10">
                  {row.account_id && (
                    <span className="text-[11px] tabular-nums rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-slate-600 mr-2">
                      {row.account_id}
                    </span>
                  )}
                  {row.account_name || "—"}
                </td>
                {columnHeaders.map((col, idx) => {
                  const value = row.values[col.key] ?? null;
                  const isStart = col.key === "start";
                  const isEnd = col.key === "end";
                  const isMonth = !isStart && !isEnd;
                  
                  return (
                    <td
                      key={col.key}
                      className={[
                        "px-4 py-2.5 text-right tabular-nums text-slate-900",
                        isStart && idx === 0 ? "sticky left-[360px] bg-white z-10" : "",
                        isEnd && idx === columnHeaders.length - 1 ? "sticky right-0 bg-white z-10" : "",
                        isBalanceReport && (isStart || isEnd) ? "font-semibold" : "",
                        isMonth && reportType === "pnl" ? "" : "",
                      ].join(" ")}
                    >
                      {formatMoney(value)}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot className="sticky bottom-0 bg-slate-100 border-t-2 border-slate-300">
            <tr>
              <td className="px-4 py-3 font-bold text-slate-900 sticky left-0 bg-slate-100 z-20">Total</td>
              {columnHeaders.map((col, idx) => {
                const total = rows.reduce((sum, row) => sum + (row.values[col.key] ?? 0), 0);
                return (
                  <td
                    key={col.key}
                    className={[
                      "px-4 py-3 text-right tabular-nums font-bold text-slate-900",
                      col.sticky && idx === 0 ? "sticky left-[360px] bg-slate-100 z-20" : "",
                      col.sticky && idx === columnHeaders.length - 1 ? "sticky right-0 bg-slate-100 z-20" : "",
                    ].join(" ")}
                  >
                    {formatMoney(total)}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

