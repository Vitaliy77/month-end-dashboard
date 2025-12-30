// web/src/components/HierarchicalReportTable.tsx
// Renders hierarchical financial report tables with indentation and grouping

import { type ReactNode } from "react";
import { type HierarchyNode } from "@/lib/hierarchy";
import { REPORT_TABLE_STYLES } from "./ReportTable";

type HierarchicalReportTableProps = {
  tree: HierarchyNode;
  columns: string[];
  renderValue: (node: HierarchyNode, colKey: string) => ReactNode;
  formatMoney?: (value: number | null | undefined) => string;
  showGrouped?: boolean;
  onToggleGroup?: (key: string) => void;
  collapsedGroups?: Set<string>;
};

export function HierarchicalReportTable({
  tree,
  columns,
  renderValue,
  formatMoney = (v) => (v == null ? "—" : String(v)),
  showGrouped = true,
  onToggleGroup,
  collapsedGroups = new Set(),
}: HierarchicalReportTableProps) {
  const renderNode = (node: HierarchyNode): ReactNode[] => {
    if (node.key === "root") {
      // Render all root children
      return node.children.flatMap((child) => renderNode(child));
    }

    const isCollapsed = collapsedGroups.has(node.key);
    const indent = node.level * 16; // 16px per level (pl-4 = 16px)

    const rows: ReactNode[] = [];

    if (node.isGroup) {
      if (showGrouped) {
        // Group header row (only in grouped view)
        rows.push(
          <tr
            key={node.key}
            className={`${REPORT_TABLE_STYLES.trGroup} ${node.level === 0 ? "border-t-2 border-slate-300" : ""}`}
          >
            <td className={REPORT_TABLE_STYLES.tdGroup} style={{ paddingLeft: `${8 + indent}px` }}>
              <div className="flex items-center gap-2">
                {onToggleGroup && node.children.length > 0 && (
                  <button
                    onClick={() => onToggleGroup(node.key)}
                    className="h-5 w-5 inline-flex items-center justify-center rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs"
                    aria-label={isCollapsed ? "Expand" : "Collapse"}
                  >
                    {isCollapsed ? "▸" : "▾"}
                  </button>
                )}
                <span>{node.label}</span>
              </div>
            </td>
            {columns.slice(1).map((col, i) => (
              <td key={i} className={REPORT_TABLE_STYLES.tdTotal}>
                {formatMoney(node.values?.[col] ?? null)}
              </td>
            ))}
          </tr>
        );

        // Render children if not collapsed
        if (!isCollapsed) {
          for (const child of node.children) {
            rows.push(...renderNode(child));
          }
        }
      } else {
        // Flat view: skip group rows, just render children
        for (const child of node.children) {
          rows.push(...renderNode(child));
        }
      }
    } else {
      // Leaf account row
      rows.push(
        <tr key={node.key} className={REPORT_TABLE_STYLES.tr}>
          <td className={REPORT_TABLE_STYLES.tdAccount} style={{ paddingLeft: `${8 + indent}px` }}>
            <div className="max-w-md">{node.label}</div>
          </td>
          {columns.slice(1).map((col, i) => (
            <td key={i} className={REPORT_TABLE_STYLES.tdNumeric}>
              {renderValue(node, col)}
            </td>
          ))}
        </tr>
      );
    }

    return rows;
  };

  const allRows = renderNode(tree);

  return (
    <div className={REPORT_TABLE_STYLES.container}>
      <table className={REPORT_TABLE_STYLES.table}>
        <thead className={REPORT_TABLE_STYLES.thead}>
          <tr>
            {columns.map((c, i) => (
              <th
                key={i}
                className={
                  i === 0
                    ? `${REPORT_TABLE_STYLES.th} min-w-[420px]`
                    : `${REPORT_TABLE_STYLES.thNumeric} min-w-[140px]`
                }
              >
                {c || (i === 0 ? "Account" : "")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{allRows}</tbody>
      </table>
    </div>
  );
}

