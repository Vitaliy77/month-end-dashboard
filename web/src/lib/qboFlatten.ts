// web/src/lib/qboFlatten.ts
// Utilities to flatten QBO nested RowNode structures into flat rows with paths

type QboRowNode = {
  type?: string;
  group?: string;
  ColData?: Array<{ value?: string; id?: string }>;
  Header?: { ColData?: Array<{ value?: string; id?: string }> };
  Summary?: { ColData?: Array<{ value?: string; id?: string }> };
  Rows?: { Row?: QboRowNode[] };
};

export type FlatRow = {
  path: string; // Full path like "ASSETS / Current Assets / Checking"
  label: string; // Last segment of path
  accountId?: string;
  values: Record<string, number | null>; // Column key -> value
  isGroup: boolean;
  originalNode: QboRowNode;
};

/**
 * Flatten QBO nested RowNode structure into flat rows with paths.
 */
export function flattenQboRows(
  rows: QboRowNode[],
  columns: string[],
  pathPrefix: string[] = []
): FlatRow[] {
  const result: FlatRow[] = [];

  function walk(node: QboRowNode, currentPath: string[]): void {
    const cells = node.ColData || node.Header?.ColData || [];
    const label = String(cells[0]?.value ?? "").trim();
    const accountId = cells[0]?.id;

    if (!label) {
      // No label - just process children
      if (node.Rows?.Row) {
        for (const child of node.Rows.Row) {
          walk(child, currentPath);
        }
      }
      return;
    }

    const fullPath = [...currentPath, label];
    const pathStr = fullPath.join(" / ");
    const isSection = node.type === "Section";
    const hasChildren = Array.isArray(node.Rows?.Row) && node.Rows.Row.length > 0;

    // Extract values for each column
    const values: Record<string, number | null> = {};
    for (let i = 1; i < cells.length && i - 1 < columns.length; i++) {
      const colKey = columns[i] || `col${i}`;
      const cellValue = cells[i]?.value;
      if (cellValue) {
        const num = toNumber(cellValue);
        values[colKey] = num;
      } else {
        values[colKey] = null;
      }
    }

    // If this is a section with summary, use summary values
    if (isSection && node.Summary?.ColData) {
      const summaryCells = node.Summary.ColData;
      for (let i = 1; i < summaryCells.length && i - 1 < columns.length; i++) {
        const colKey = columns[i] || `col${i}`;
        const cellValue = summaryCells[i]?.value;
        if (cellValue) {
          const num = toNumber(cellValue);
          values[colKey] = num;
        }
      }
    }

    // Add this row
    result.push({
      path: pathStr,
      label,
      accountId,
      values,
      isGroup: isSection && hasChildren,
      originalNode: node,
    });

    // Process children
    if (hasChildren && node.Rows?.Row) {
      for (const child of node.Rows.Row) {
        walk(child, fullPath);
      }
    }
  }

  for (const row of rows) {
    walk(row, pathPrefix);
  }

  return result;
}

function toNumber(v: string): number | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  // Handle QBO format: "(123.45)" for negatives, "$", commas
  const negByParens = /^\(.*\)$/.test(s);
  const cleaned = s.replace(/[(),$]/g, "").replace(/,/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return negByParens ? -n : n;
}

